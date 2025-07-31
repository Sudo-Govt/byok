import Bull, { Queue, Job, JobOptions, QueueOptions } from 'bull';
import { logger } from './logger';
import { metrics } from './metrics';

// Queue configuration
export interface QueueConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  defaultJobOptions: JobOptions;
  settings: {
    stalledInterval: number;
    maxStalledCount: number;
    retryProcessDelay: number;
  };
}

// Default queue configuration
const defaultConfig: QueueConfig = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_QUEUE_DB || '1'),
  },
  defaultJobOptions: {
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 50,      // Keep last 50 failed jobs
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    delay: 0,
  },
  settings: {
    stalledInterval: 30 * 1000,    // 30 seconds
    maxStalledCount: 1,
    retryProcessDelay: 5 * 1000,   // 5 seconds
  },
};

// Job data interfaces
export interface BaseJobData {
  id?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface EmailJobData extends BaseJobData {
  to: string | string[];
  subject: string;
  template: string;
  data: Record<string, any>;
  priority?: number;
}

export interface NotificationJobData extends BaseJobData {
  userId: string;
  type: 'email' | 'push' | 'sms';
  title: string;
  message: string;
  data?: Record<string, any>;
}

export interface DataProcessingJobData extends BaseJobData {
  inputData: any;
  processingType: string;
  options?: Record<string, any>;
}

export interface ReportJobData extends BaseJobData {
  reportType: string;
  filters: Record<string, any>;
  format: 'pdf' | 'excel' | 'csv';
  userId: string;
}

// Queue manager class
export class QueueManager {
  private queues: Map<string, Queue> = new Map();
  private config: QueueConfig;

  constructor(config: Partial<QueueConfig> = {}) {
    this.config = this.mergeConfig(defaultConfig, config);
  }

  private mergeConfig(defaultCfg: QueueConfig, userCfg: Partial<QueueConfig>): QueueConfig {
    return {
      redis: { ...defaultCfg.redis, ...userCfg.redis },
      defaultJobOptions: { ...defaultCfg.defaultJobOptions, ...userCfg.defaultJobOptions },
      settings: { ...defaultCfg.settings, ...userCfg.settings },
    };
  }

  // Create or get queue
  getQueue(name: string): Queue {
    if (!this.queues.has(name)) {
      const queueOptions: QueueOptions = {
        redis: this.config.redis,
        defaultJobOptions: this.config.defaultJobOptions,
        settings: this.config.settings,
      };

      const queue = new Bull(name, queueOptions);
      this.setupQueueEventHandlers(queue, name);
      this.queues.set(name, queue);
    }

    return this.queues.get(name)!;
  }

  private setupQueueEventHandlers(queue: Queue, queueName: string): void {
    // Job events
    queue.on('waiting', (jobId) => {
      logger.debug(`Job ${jobId} is waiting in queue ${queueName}`);
      metrics.counter('queue.jobs.waiting', 1, { queue: queueName });
    });

    queue.on('active', (job) => {
      logger.debug(`Job ${job.id} started processing in queue ${queueName}`);
      metrics.counter('queue.jobs.active', 1, { queue: queueName });
    });

    queue.on('completed', (job, result) => {
      logger.info(`Job ${job.id} completed in queue ${queueName}`, { 
        jobId: job.id,
        duration: Date.now() - job.processedOn!,
        result 
      });
      metrics.counter('queue.jobs.completed', 1, { queue: queueName });
      metrics.timer('queue.job.duration', Date.now() - job.processedOn!, { queue: queueName, status: 'completed' });
    });

    queue.on('failed', (job, error) => {
      logger.error(`Job ${job.id} failed in queue ${queueName}`, error, {
        jobId: job.id,
        attempts: job.attemptsMade,
        maxAttempts: job.opts.attempts,
        data: job.data
      });
      metrics.counter('queue.jobs.failed', 1, { queue: queueName });
      metrics.timer('queue.job.duration', Date.now() - job.processedOn!, { queue: queueName, status: 'failed' });
    });

    queue.on('stalled', (job) => {
      logger.warn(`Job ${job.id} stalled in queue ${queueName}`);
      metrics.counter('queue.jobs.stalled', 1, { queue: queueName });
    });

    queue.on('progress', (job, progress) => {
      logger.debug(`Job ${job.id} progress: ${progress}% in queue ${queueName}`);
      metrics.gauge('queue.job.progress', progress, { queue: queueName, jobId: job.id?.toString() });
    });

    // Queue events
    queue.on('error', (error) => {
      logger.error(`Queue ${queueName} error`, error);
      metrics.counter('queue.errors', 1, { queue: queueName });
    });

    queue.on('paused', () => {
      logger.info(`Queue ${queueName} paused`);
      metrics.counter('queue.state.changes', 1, { queue: queueName, state: 'paused' });
    });

    queue.on('resumed', () => {
      logger.info(`Queue ${queueName} resumed`);
      metrics.counter('queue.state.changes', 1, { queue: queueName, state: 'resumed' });
    });

    queue.on('cleaned', (jobs, type) => {
      logger.info(`Queue ${queueName} cleaned ${jobs.length} ${type} jobs`);
      metrics.counter('queue.jobs.cleaned', jobs.length, { queue: queueName, type });
    });
  }

  // Add job to queue
  async addJob<T extends BaseJobData>(
    queueName: string,
    jobName: string,
    data: T,
    options: JobOptions = {}
  ): Promise<Job<T>> {
    const queue = this.getQueue(queueName);
    const jobOptions = { ...this.config.defaultJobOptions, ...options };

    try {
      const job = await queue.add(jobName, data, jobOptions);
      
      logger.info(`Job ${job.id} added to queue ${queueName}`, {
        jobName,
        jobId: job.id,
        priority: jobOptions.priority || 0,
        delay: jobOptions.delay || 0
      });

      metrics.counter('queue.jobs.added', 1, { queue: queueName, jobName });
      
      return job;
    } catch (error) {
      logger.error(`Failed to add job to queue ${queueName}`, error, { jobName, data });
      metrics.counter('queue.jobs.add_failed', 1, { queue: queueName, jobName });
      throw error;
    }
  }

  // Process jobs in queue
  process<T extends BaseJobData>(
    queueName: string,
    jobName: string,
    processor: (job: Job<T>) => Promise<any>,
    concurrency: number = 1
  ): void {
    const queue = this.getQueue(queueName);

    queue.process(jobName, concurrency, async (job: Job<T>) => {
      const startTime = Date.now();
      
      try {
        logger.info(`Processing job ${job.id} of type ${jobName}`, {
          jobId: job.id,
          attempts: job.attemptsMade + 1,
          maxAttempts: job.opts.attempts,
          data: job.data
        });

        // Update job progress
        await job.progress(0);

        const result = await processor(job);

        // Mark as completed
        await job.progress(100);

        const duration = Date.now() - startTime;
        logger.info(`Job ${job.id} completed successfully`, {
          jobId: job.id,
          duration,
          result
        });

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(`Job ${job.id} processing failed`, error, {
          jobId: job.id,
          duration,
          attempts: job.attemptsMade + 1,
          maxAttempts: job.opts.attempts
        });

        throw error;
      }
    });

    logger.info(`Processor registered for queue ${queueName}, job type ${jobName} with concurrency ${concurrency}`);
  }

  // Get queue statistics
  async getQueueStats(queueName: string): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
  }> {
    const queue = this.getQueue(queueName);
    
    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed(),
      queue.isPaused()
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      paused: paused ? 1 : 0
    };
  }

  // Clean queue
  async cleanQueue(
    queueName: string,
    grace: number = 5000,
    status: 'completed' | 'failed' | 'active' | 'waiting' = 'completed',
    limit: number = 100
  ): Promise<number> {
    const queue = this.getQueue(queueName);
    
    try {
      const jobs = await queue.clean(grace, status as any, limit);
      logger.info(`Cleaned ${jobs.length} ${status} jobs from queue ${queueName}`);
      return jobs.length;
    } catch (error) {
      logger.error(`Failed to clean queue ${queueName}`, error);
      throw error;
    }
  }

  // Pause queue
  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.pause();
    logger.info(`Queue ${queueName} paused`);
  }

  // Resume queue
  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.resume();
    logger.info(`Queue ${queueName} resumed`);
  }

  // Close all queues
  async close(): Promise<void> {
    const closePromises = Array.from(this.queues.values()).map(queue => queue.close());
    await Promise.all(closePromises);
    this.queues.clear();
    logger.info('All queues closed');
  }

  // Get all queue names
  getQueueNames(): string[] {
    return Array.from(this.queues.keys());
  }
}

// Create default queue manager instance
export const queueManager = new QueueManager();

// Predefined queue names
export const QueueNames = {
  EMAIL: 'email',
  NOTIFICATIONS: 'notifications',
  DATA_PROCESSING: 'data-processing',
  REPORTS: 'reports',
  FILE_PROCESSING: 'file-processing',
  WEBHOOKS: 'webhooks',
  CLEANUP: 'cleanup',
} as const;

// Job type names
export const JobTypes = {
  // Email jobs
  SEND_EMAIL: 'send-email',
  SEND_BULK_EMAIL: 'send-bulk-email',
  
  // Notification jobs
  PUSH_NOTIFICATION: 'push-notification',
  SMS_NOTIFICATION: 'sms-notification',
  
  // Data processing jobs
  PROCESS_UPLOAD: 'process-upload',
  GENERATE_REPORT: 'generate-report',
  BACKUP_DATA: 'backup-data',
  
  // File processing jobs
  RESIZE_IMAGE: 'resize-image',
  CONVERT_DOCUMENT: 'convert-document',
  
  // Webhook jobs
  SEND_WEBHOOK: 'send-webhook',
  
  // Cleanup jobs
  CLEANUP_TEMP_FILES: 'cleanup-temp-files',
  CLEANUP_OLD_LOGS: 'cleanup-old-logs',
} as const;

// Utility functions for common queue operations
export const queueUtils = {
  // Add email job
  async addEmailJob(data: EmailJobData, options?: JobOptions): Promise<Job<EmailJobData>> {
    return queueManager.addJob(QueueNames.EMAIL, JobTypes.SEND_EMAIL, data, options);
  },

  // Add notification job
  async addNotificationJob(data: NotificationJobData, options?: JobOptions): Promise<Job<NotificationJobData>> {
    return queueManager.addJob(QueueNames.NOTIFICATIONS, JobTypes.PUSH_NOTIFICATION, data, options);
  },

  // Add data processing job
  async addDataProcessingJob(data: DataProcessingJobData, options?: JobOptions): Promise<Job<DataProcessingJobData>> {
    return queueManager.addJob(QueueNames.DATA_PROCESSING, JobTypes.PROCESS_UPLOAD, data, options);
  },

  // Add report generation job
  async addReportJob(data: ReportJobData, options?: JobOptions): Promise<Job<ReportJobData>> {
    return queueManager.addJob(QueueNames.REPORTS, JobTypes.GENERATE_REPORT, data, options);
  },

  // Schedule recurring job
  async addRecurringJob<T extends BaseJobData>(
    queueName: string,
    jobName: string,
    data: T,
    cronExpression: string
  ): Promise<Job<T>> {
    return queueManager.addJob(queueName, jobName, data, {
      repeat: { cron: cronExpression },
      removeOnComplete: 10,
      removeOnFail: 5,
    });
  },

  // Add high priority job
  async addHighPriorityJob<T extends BaseJobData>(
    queueName: string,
    jobName: string,
    data: T,
    options?: JobOptions
  ): Promise<Job<T>> {
    return queueManager.addJob(queueName, jobName, data, {
      ...options,
      priority: 10,
    });
  },

  // Add delayed job
  async addDelayedJob<T extends BaseJobData>(
    queueName: string,
    jobName: string,
    data: T,
    delayMs: number,
    options?: JobOptions
  ): Promise<Job<T>> {
    return queueManager.addJob(queueName, jobName, data, {
      ...options,
      delay: delayMs,
    });
  },

  // Get comprehensive queue health status
  async getHealthStatus(): Promise<Record<string, any>> {
    const queueNames = queueManager.getQueueNames();
    const health: Record<string, any> = {};

    for (const queueName of queueNames) {
      try {
        const stats = await queueManager.getQueueStats(queueName);
        health[queueName] = {
          ...stats,
          healthy: stats.failed < 10 && stats.active < 100, // Basic health check
        };
      } catch (error) {
        health[queueName] = {
          error: error instanceof Error ? error.message : 'Unknown error',
          healthy: false,
        };
      }
    }

    return health;
  },
};

export default queueManager;