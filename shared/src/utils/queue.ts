import { EventEmitter } from 'events';

export interface QueueJob<T = any> {
  id: string;
  data: T;
  priority: number;
  attempts: number;
  maxAttempts: number;
  delay: number;
  createdAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  error?: string;
}

export interface QueueOptions {
  concurrency?: number;
  maxAttempts?: number;
  defaultDelay?: number;
  retryDelay?: number;
}

export interface JobProcessor<T = any> {
  (job: QueueJob<T>): Promise<void>;
}

export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export class Queue<T = any> extends EventEmitter {
  private jobs = new Map<string, QueueJob<T>>();
  private pendingJobs: QueueJob<T>[] = [];
  private processingJobs = new Set<string>();
  private processor?: JobProcessor<T>;
  private options: Required<QueueOptions>;
  private isProcessing = false;
  private jobIdCounter = 0;

  constructor(name: string, options: QueueOptions = {}) {
    super();
    this.options = {
      concurrency: options.concurrency || 1,
      maxAttempts: options.maxAttempts || 3,
      defaultDelay: options.defaultDelay || 0,
      retryDelay: options.retryDelay || 5000
    };
  }

  /**
   * Set the job processor function
   */
  public process(processor: JobProcessor<T>): void {
    this.processor = processor;
    if (!this.isProcessing) {
      this.startProcessing();
    }
  }

  /**
   * Add a job to the queue
   */
  public add(data: T, options: { priority?: number; delay?: number; maxAttempts?: number } = {}): string {
    const jobId = `job_${++this.jobIdCounter}_${Date.now()}`;
    const job: QueueJob<T> = {
      id: jobId,
      data,
      priority: options.priority || 0,
      attempts: 0,
      maxAttempts: options.maxAttempts || this.options.maxAttempts,
      delay: options.delay || this.options.defaultDelay,
      createdAt: new Date()
    };

    this.jobs.set(jobId, job);
    
    if (job.delay > 0) {
      setTimeout(() => {
        this.pendingJobs.push(job);
        this.sortPendingJobs();
        this.emit('job:added', job);
      }, job.delay);
    } else {
      this.pendingJobs.push(job);
      this.sortPendingJobs();
      this.emit('job:added', job);
    }

    return jobId;
  }

  /**
   * Get job by ID
   */
  public getJob(jobId: string): QueueJob<T> | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Remove job by ID
   */
  public removeJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    // Remove from pending jobs
    const pendingIndex = this.pendingJobs.findIndex(j => j.id === jobId);
    if (pendingIndex >= 0) {
      this.pendingJobs.splice(pendingIndex, 1);
    }

    // Remove from processing jobs
    this.processingJobs.delete(jobId);

    // Remove from jobs map
    this.jobs.delete(jobId);

    this.emit('job:removed', job);
    return true;
  }

  /**
   * Get queue statistics
   */
  public getStats(): {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  } {
    const stats = {
      total: this.jobs.size,
      pending: 0,
      processing: this.processingJobs.size,
      completed: 0,
      failed: 0
    };

    for (const job of this.jobs.values()) {
      if (job.completedAt) {
        stats.completed++;
      } else if (job.failedAt && job.attempts >= job.maxAttempts) {
        stats.failed++;
      } else if (!this.processingJobs.has(job.id)) {
        stats.pending++;
      }
    }

    return stats;
  }

  /**
   * Clear all jobs
   */
  public clear(): void {
    this.jobs.clear();
    this.pendingJobs = [];
    this.processingJobs.clear();
    this.emit('queue:cleared');
  }

  /**
   * Pause queue processing
   */
  public pause(): void {
    this.isProcessing = false;
    this.emit('queue:paused');
  }

  /**
   * Resume queue processing
   */
  public resume(): void {
    if (!this.isProcessing && this.processor) {
      this.startProcessing();
    }
    this.emit('queue:resumed');
  }

  /**
   * Start processing jobs
   */
  private startProcessing(): void {
    this.isProcessing = true;
    this.processNextJobs();
  }

  /**
   * Process next available jobs
   */
  private async processNextJobs(): Promise<void> {
    if (!this.isProcessing || !this.processor) return;

    const availableSlots = this.options.concurrency - this.processingJobs.size;
    const jobsToProcess = this.pendingJobs.splice(0, availableSlots);

    for (const job of jobsToProcess) {
      this.processJob(job);
    }

    // Continue processing if there are more jobs
    if (this.pendingJobs.length > 0 && this.processingJobs.size < this.options.concurrency) {
      setImmediate(() => this.processNextJobs());
    }
  }

  /**
   * Process a single job
   */
  private async processJob(job: QueueJob<T>): Promise<void> {
    if (!this.processor) return;

    this.processingJobs.add(job.id);
    job.attempts++;
    job.processedAt = new Date();

    this.emit('job:processing', job);

    try {
      await this.processor(job);
      job.completedAt = new Date();
      this.emit('job:completed', job);
    } catch (error) {
      job.error = error instanceof Error ? error.message : String(error);
      job.failedAt = new Date();
      
      this.emit('job:failed', job, error);

      // Retry if attempts remaining
      if (job.attempts < job.maxAttempts) {
        setTimeout(() => {
          delete job.failedAt;
          delete job.error;
          this.pendingJobs.push(job);
          this.sortPendingJobs();
          this.emit('job:retry', job);
        }, this.options.retryDelay);
      }
    } finally {
      this.processingJobs.delete(job.id);
      
      // Process next jobs
      if (this.isProcessing) {
        setImmediate(() => this.processNextJobs());
      }
    }
  }

  /**
   * Sort pending jobs by priority (higher priority first)
   */
  private sortPendingJobs(): void {
    this.pendingJobs.sort((a, b) => b.priority - a.priority);
  }
}

export class QueueManager {
  private static instance: QueueManager;
  private queues = new Map<string, Queue>();

  private constructor() {}

  public static getInstance(): QueueManager {
    if (!QueueManager.instance) {
      QueueManager.instance = new QueueManager();
    }
    return QueueManager.instance;
  }

  /**
   * Create or get a named queue
   */
  public getQueue<T = any>(name: string, options?: QueueOptions): Queue<T> {
    if (!this.queues.has(name)) {
      this.queues.set(name, new Queue<T>(name, options));
    }
    return this.queues.get(name) as Queue<T>;
  }

  /**
   * Remove a named queue
   */
  public removeQueue(name: string): boolean {
    const queue = this.queues.get(name);
    if (queue) {
      queue.pause();
      queue.clear();
      return this.queues.delete(name);
    }
    return false;
  }

  /**
   * Get all queue names
   */
  public getQueueNames(): string[] {
    return Array.from(this.queues.keys());
  }

  /**
   * Get stats for all queues
   */
  public getAllStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    for (const [name, queue] of this.queues.entries()) {
      stats[name] = queue.getStats();
    }
    return stats;
  }
}

export const queueManager = QueueManager.getInstance();