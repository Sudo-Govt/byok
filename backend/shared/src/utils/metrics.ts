import { logger } from './logger';

// Metrics interface
export interface Metric {
  name: string;
  value: number;
  tags?: Record<string, string>;
  timestamp?: Date;
  type: 'counter' | 'gauge' | 'histogram' | 'timer';
}

// Metrics collector class
class MetricsCollector {
  private metrics: Map<string, Metric[]> = new Map();
  private enabled: boolean = process.env.METRICS_ENABLED !== 'false';

  constructor() {
    if (this.enabled) {
      // Flush metrics periodically
      setInterval(() => this.flush(), 60000); // Every minute
    }
  }

  // Counter metric - increment only
  counter(name: string, value: number = 1, tags?: Record<string, string>): void {
    if (!this.enabled) return;

    const metric: Metric = {
      name,
      value,
      tags,
      timestamp: new Date(),
      type: 'counter'
    };

    this.addMetric(name, metric);
  }

  // Gauge metric - can go up or down
  gauge(name: string, value: number, tags?: Record<string, string>): void {
    if (!this.enabled) return;

    const metric: Metric = {
      name,
      value,
      tags,
      timestamp: new Date(),
      type: 'gauge'
    };

    this.addMetric(name, metric);
  }

  // Timer metric - measure duration
  timer(name: string, duration: number, tags?: Record<string, string>): void {
    if (!this.enabled) return;

    const metric: Metric = {
      name,
      value: duration,
      tags,
      timestamp: new Date(),
      type: 'timer'
    };

    this.addMetric(name, metric);
  }

  // Histogram metric - track distribution of values
  histogram(name: string, value: number, tags?: Record<string, string>): void {
    if (!this.enabled) return;

    const metric: Metric = {
      name,
      value,
      tags,
      timestamp: new Date(),
      type: 'histogram'
    };

    this.addMetric(name, metric);
  }

  // Time a function execution
  timeFunction<T>(name: string, fn: () => T, tags?: Record<string, string>): T {
    const start = Date.now();
    try {
      const result = fn();
      const duration = Date.now() - start;
      this.timer(name, duration, tags);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.timer(name, duration, { ...tags, error: 'true' });
      throw error;
    }
  }

  // Time an async function execution
  async timeAsyncFunction<T>(name: string, fn: () => Promise<T>, tags?: Record<string, string>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.timer(name, duration, tags);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.timer(name, duration, { ...tags, error: 'true' });
      throw error;
    }
  }

  private addMetric(name: string, metric: Metric): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name)!.push(metric);
  }

  // Get all metrics
  getMetrics(): Record<string, Metric[]> {
    const result: Record<string, Metric[]> = {};
    this.metrics.forEach((metrics, name) => {
      result[name] = [...metrics];
    });
    return result;
  }

  // Get metrics for a specific name
  getMetric(name: string): Metric[] {
    return this.metrics.get(name) || [];
  }

  // Clear metrics
  clear(): void {
    this.metrics.clear();
  }

  // Flush metrics to external system (implement based on your needs)
  private flush(): void {
    if (this.metrics.size === 0) return;

    const metricsData = this.getMetrics();
    
    // Log metrics for now (replace with external metrics service)
    logger.debug('Metrics flush', { 
      timestamp: new Date(),
      metricsCount: Object.keys(metricsData).length,
      metrics: metricsData
    });

    // Clear after flush
    this.clear();
  }

  // Generate summary statistics
  getSummary(): Record<string, any> {
    const summary: Record<string, any> = {};
    
    this.metrics.forEach((metrics, name) => {
      const values = metrics.map(m => m.value);
      const count = values.length;
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = count > 0 ? sum / count : 0;
      const min = count > 0 ? Math.min(...values) : 0;
      const max = count > 0 ? Math.max(...values) : 0;

      summary[name] = {
        count,
        sum,
        avg,
        min,
        max,
        type: metrics[0]?.type || 'unknown'
      };
    });

    return summary;
  }
}

// Create singleton instance
export const metrics = new MetricsCollector();

// Common application metrics
export const appMetrics = {
  // HTTP request metrics
  httpRequest: (method: string, route: string, statusCode: number, duration: number) => {
    metrics.counter('http.requests.total', 1, { method, route, status: statusCode.toString() });
    metrics.timer('http.request.duration', duration, { method, route });
  },

  // Database metrics
  dbQuery: (operation: string, table: string, duration: number, success: boolean = true) => {
    metrics.counter('db.queries.total', 1, { operation, table, success: success.toString() });
    metrics.timer('db.query.duration', duration, { operation, table });
  },

  // Authentication metrics
  authAttempt: (success: boolean, method: string = 'unknown') => {
    metrics.counter('auth.attempts.total', 1, { success: success.toString(), method });
  },

  // Error metrics
  error: (type: string, service: string = 'unknown') => {
    metrics.counter('errors.total', 1, { type, service });
  },

  // Business metrics
  projectCreated: (userId: string) => {
    metrics.counter('projects.created.total', 1, { userId });
  },

  projectDeleted: (userId: string) => {
    metrics.counter('projects.deleted.total', 1, { userId });
  },

  userRegistration: (method: string = 'email') => {
    metrics.counter('users.registrations.total', 1, { method });
  },

  // System metrics
  memoryUsage: () => {
    const usage = process.memoryUsage();
    metrics.gauge('system.memory.heap.used', usage.heapUsed);
    metrics.gauge('system.memory.heap.total', usage.heapTotal);
    metrics.gauge('system.memory.rss', usage.rss);
  },

  cpuUsage: () => {
    const usage = process.cpuUsage();
    metrics.gauge('system.cpu.user', usage.user);
    metrics.gauge('system.cpu.system', usage.system);
  }
};

// Middleware for automatic system metrics collection
export const startSystemMetricsCollection = (intervalMs: number = 30000) => {
  setInterval(() => {
    appMetrics.memoryUsage();
    appMetrics.cpuUsage();
  }, intervalMs);
};

export default metrics;