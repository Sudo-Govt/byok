import Redis from 'ioredis';
import { logger } from './logger';
import { metrics } from './metrics';

// Cache configuration
export interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  ttl: number; // Default TTL in seconds
  maxRetries: number;
  retryDelayOnFailover: number;
  enableOfflineQueue: boolean;
  keyPrefix: string;
}

// Default cache configuration
const defaultConfig: CacheConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  ttl: parseInt(process.env.CACHE_TTL || '3600'), // 1 hour
  maxRetries: 3,
  retryDelayOnFailover: 100,
  enableOfflineQueue: false,
  keyPrefix: process.env.CACHE_KEY_PREFIX || 'byok:',
};

// Cache interface
export interface CacheInterface {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: any, ttl?: number): Promise<boolean>;
  del(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  expire(key: string, ttl: number): Promise<boolean>;
  flushAll(): Promise<boolean>;
  keys(pattern: string): Promise<string[]>;
  mget<T>(keys: string[]): Promise<(T | null)[]>;
  mset(keyValues: Record<string, any>, ttl?: number): Promise<boolean>;
}

// Redis cache implementation
export class RedisCache implements CacheInterface {
  private client: Redis;
  private config: CacheConfig;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    this.client = new Redis({
      host: this.config.host,
      port: this.config.port,
      password: this.config.password,
      db: this.config.db,
      maxRetriesPerRequest: this.config.maxRetries,
      retryDelayOnFailover: this.config.retryDelayOnFailover,
      enableOfflineQueue: this.config.enableOfflineQueue,
      keyPrefix: this.config.keyPrefix,
      lazyConnect: true,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      logger.info('Redis cache connected');
      metrics.counter('cache.redis.connections', 1, { status: 'connected' });
    });

    this.client.on('error', (error) => {
      logger.error('Redis cache error', error);
      metrics.counter('cache.redis.errors', 1, { error: error.message });
    });

    this.client.on('close', () => {
      logger.warn('Redis cache connection closed');
      metrics.counter('cache.redis.connections', 1, { status: 'closed' });
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis cache reconnecting');
      metrics.counter('cache.redis.connections', 1, { status: 'reconnecting' });
    });
  }

  async get<T>(key: string): Promise<T | null> {
    const start = Date.now();
    try {
      const value = await this.client.get(key);
      const duration = Date.now() - start;
      
      metrics.timer('cache.operation.duration', duration, { operation: 'get', hit: value !== null ? 'true' : 'false' });
      metrics.counter('cache.operations', 1, { operation: 'get', result: value !== null ? 'hit' : 'miss' });

      if (value === null) {
        return null;
      }

      try {
        return JSON.parse(value) as T;
      } catch {
        // Return as string if not valid JSON
        return value as unknown as T;
      }
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Cache get operation failed', error, { key });
      metrics.timer('cache.operation.duration', duration, { operation: 'get', error: 'true' });
      metrics.counter('cache.errors', 1, { operation: 'get' });
      return null;
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    const start = Date.now();
    try {
      const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
      const expiry = ttl || this.config.ttl;

      const result = await this.client.setex(key, expiry, serializedValue);
      const duration = Date.now() - start;

      metrics.timer('cache.operation.duration', duration, { operation: 'set' });
      metrics.counter('cache.operations', 1, { operation: 'set', result: 'success' });

      return result === 'OK';
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Cache set operation failed', error, { key, ttl });
      metrics.timer('cache.operation.duration', duration, { operation: 'set', error: 'true' });
      metrics.counter('cache.errors', 1, { operation: 'set' });
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    const start = Date.now();
    try {
      const result = await this.client.del(key);
      const duration = Date.now() - start;

      metrics.timer('cache.operation.duration', duration, { operation: 'del' });
      metrics.counter('cache.operations', 1, { operation: 'del', result: 'success' });

      return result > 0;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Cache delete operation failed', error, { key });
      metrics.timer('cache.operation.duration', duration, { operation: 'del', error: 'true' });
      metrics.counter('cache.errors', 1, { operation: 'del' });
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    const start = Date.now();
    try {
      const result = await this.client.exists(key);
      const duration = Date.now() - start;

      metrics.timer('cache.operation.duration', duration, { operation: 'exists' });
      metrics.counter('cache.operations', 1, { operation: 'exists', result: 'success' });

      return result === 1;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Cache exists operation failed', error, { key });
      metrics.timer('cache.operation.duration', duration, { operation: 'exists', error: 'true' });
      metrics.counter('cache.errors', 1, { operation: 'exists' });
      return false;
    }
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    const start = Date.now();
    try {
      const result = await this.client.expire(key, ttl);
      const duration = Date.now() - start;

      metrics.timer('cache.operation.duration', duration, { operation: 'expire' });
      metrics.counter('cache.operations', 1, { operation: 'expire', result: 'success' });

      return result === 1;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Cache expire operation failed', error, { key, ttl });
      metrics.timer('cache.operation.duration', duration, { operation: 'expire', error: 'true' });
      metrics.counter('cache.errors', 1, { operation: 'expire' });
      return false;
    }
  }

  async flushAll(): Promise<boolean> {
    const start = Date.now();
    try {
      const result = await this.client.flushall();
      const duration = Date.now() - start;

      metrics.timer('cache.operation.duration', duration, { operation: 'flushAll' });
      metrics.counter('cache.operations', 1, { operation: 'flushAll', result: 'success' });

      return result === 'OK';
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Cache flush operation failed', error);
      metrics.timer('cache.operation.duration', duration, { operation: 'flushAll', error: 'true' });
      metrics.counter('cache.errors', 1, { operation: 'flushAll' });
      return false;
    }
  }

  async keys(pattern: string): Promise<string[]> {
    const start = Date.now();
    try {
      const keys = await this.client.keys(pattern);
      const duration = Date.now() - start;

      metrics.timer('cache.operation.duration', duration, { operation: 'keys' });
      metrics.counter('cache.operations', 1, { operation: 'keys', result: 'success' });

      return keys;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Cache keys operation failed', error, { pattern });
      metrics.timer('cache.operation.duration', duration, { operation: 'keys', error: 'true' });
      metrics.counter('cache.errors', 1, { operation: 'keys' });
      return [];
    }
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    const start = Date.now();
    try {
      const values = await this.client.mget(...keys);
      const duration = Date.now() - start;

      metrics.timer('cache.operation.duration', duration, { operation: 'mget' });
      metrics.counter('cache.operations', 1, { operation: 'mget', result: 'success' });

      return values.map(value => {
        if (value === null) return null;
        try {
          return JSON.parse(value) as T;
        } catch {
          return value as unknown as T;
        }
      });
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Cache mget operation failed', error, { keys });
      metrics.timer('cache.operation.duration', duration, { operation: 'mget', error: 'true' });
      metrics.counter('cache.errors', 1, { operation: 'mget' });
      return keys.map(() => null);
    }
  }

  async mset(keyValues: Record<string, any>, ttl?: number): Promise<boolean> {
    const start = Date.now();
    try {
      const pipeline = this.client.pipeline();
      const expiry = ttl || this.config.ttl;

      Object.entries(keyValues).forEach(([key, value]) => {
        const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
        pipeline.setex(key, expiry, serializedValue);
      });

      const results = await pipeline.exec();
      const duration = Date.now() - start;

      metrics.timer('cache.operation.duration', duration, { operation: 'mset' });
      metrics.counter('cache.operations', 1, { operation: 'mset', result: 'success' });

      return results?.every(([error, result]) => error === null && result === 'OK') || false;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Cache mset operation failed', error, { keyCount: Object.keys(keyValues).length });
      metrics.timer('cache.operation.duration', duration, { operation: 'mset', error: 'true' });
      metrics.counter('cache.errors', 1, { operation: 'mset' });
      return false;
    }
  }

  // Additional Redis-specific methods
  async increment(key: string, amount: number = 1): Promise<number> {
    try {
      const result = await this.client.incrby(key, amount);
      metrics.counter('cache.operations', 1, { operation: 'increment', result: 'success' });
      return result;
    } catch (error) {
      logger.error('Cache increment operation failed', error, { key, amount });
      metrics.counter('cache.errors', 1, { operation: 'increment' });
      throw error;
    }
  }

  async decrement(key: string, amount: number = 1): Promise<number> {
    try {
      const result = await this.client.decrby(key, amount);
      metrics.counter('cache.operations', 1, { operation: 'decrement', result: 'success' });
      return result;
    } catch (error) {
      logger.error('Cache decrement operation failed', error, { key, amount });
      metrics.counter('cache.errors', 1, { operation: 'decrement' });
      throw error;
    }
  }

  async isConnected(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.quit();
      logger.info('Redis cache disconnected gracefully');
    } catch (error) {
      logger.error('Error disconnecting Redis cache', error);
    }
  }
}

// In-memory cache implementation (for development/testing)
export class InMemoryCache implements CacheInterface {
  private store: Map<string, { value: any; expires: number }> = new Map();
  private config: Pick<CacheConfig, 'ttl'>;

  constructor(config: Partial<Pick<CacheConfig, 'ttl'>> = {}) {
    this.config = { ttl: config.ttl || defaultConfig.ttl };
    
    // Clean up expired entries periodically
    setInterval(() => this.cleanup(), 60000); // Every minute
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.expires <= now) {
        this.store.delete(key);
      }
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry || entry.expires <= Date.now()) {
      if (entry) this.store.delete(key);
      metrics.counter('cache.operations', 1, { operation: 'get', result: 'miss' });
      return null;
    }
    metrics.counter('cache.operations', 1, { operation: 'get', result: 'hit' });
    return entry.value;
  }

  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    const expiry = ttl || this.config.ttl;
    this.store.set(key, {
      value,
      expires: Date.now() + (expiry * 1000)
    });
    metrics.counter('cache.operations', 1, { operation: 'set', result: 'success' });
    return true;
  }

  async del(key: string): Promise<boolean> {
    const deleted = this.store.delete(key);
    metrics.counter('cache.operations', 1, { operation: 'del', result: 'success' });
    return deleted;
  }

  async exists(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    const exists = entry !== undefined && entry.expires > Date.now();
    metrics.counter('cache.operations', 1, { operation: 'exists', result: 'success' });
    return exists;
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry) return false;
    
    entry.expires = Date.now() + (ttl * 1000);
    metrics.counter('cache.operations', 1, { operation: 'expire', result: 'success' });
    return true;
  }

  async flushAll(): Promise<boolean> {
    this.store.clear();
    metrics.counter('cache.operations', 1, { operation: 'flushAll', result: 'success' });
    return true;
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    const keys = Array.from(this.store.keys()).filter(key => regex.test(key));
    metrics.counter('cache.operations', 1, { operation: 'keys', result: 'success' });
    return keys;
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    const results = await Promise.all(keys.map(key => this.get<T>(key)));
    metrics.counter('cache.operations', 1, { operation: 'mget', result: 'success' });
    return results;
  }

  async mset(keyValues: Record<string, any>, ttl?: number): Promise<boolean> {
    await Promise.all(
      Object.entries(keyValues).map(([key, value]) => this.set(key, value, ttl))
    );
    metrics.counter('cache.operations', 1, { operation: 'mset', result: 'success' });
    return true;
  }
}

// Cache factory
export function createCache(config?: Partial<CacheConfig>): CacheInterface {
  if (process.env.NODE_ENV === 'test' || process.env.CACHE_TYPE === 'memory') {
    return new InMemoryCache(config);
  }
  return new RedisCache(config);
}

// Default cache instance
export const cache = createCache();

// Cache utility functions
export const cacheUtils = {
  // Generate cache key
  generateKey(...parts: string[]): string {
    return parts.join(':');
  },

  // Cache with automatic serialization
  async cacheResult<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = await cache.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const result = await fetchFn();
    await cache.set(key, result, ttl);
    return result;
  },

  // Invalidate cache pattern
  async invalidatePattern(pattern: string): Promise<number> {
    const keys = await cache.keys(pattern);
    let deletedCount = 0;
    
    for (const key of keys) {
      const deleted = await cache.del(key);
      if (deleted) deletedCount++;
    }
    
    return deletedCount;
  },

  // Cache with tags for easier invalidation
  async setWithTags(
    key: string,
    value: any,
    tags: string[],
    ttl?: number
  ): Promise<boolean> {
    const success = await cache.set(key, value, ttl);
    if (success && tags.length > 0) {
      // Store tag associations
      for (const tag of tags) {
        const tagKey = `tag:${tag}`;
        const taggedKeys = await cache.get<string[]>(tagKey) || [];
        if (!taggedKeys.includes(key)) {
          taggedKeys.push(key);
          await cache.set(tagKey, taggedKeys, ttl);
        }
      }
    }
    return success;
  },

  // Invalidate by tag
  async invalidateByTag(tag: string): Promise<number> {
    const tagKey = `tag:${tag}`;
    const taggedKeys = await cache.get<string[]>(tagKey) || [];
    let deletedCount = 0;

    for (const key of taggedKeys) {
      const deleted = await cache.del(key);
      if (deleted) deletedCount++;
    }

    await cache.del(tagKey);
    return deletedCount;
  }
};

export default cache;