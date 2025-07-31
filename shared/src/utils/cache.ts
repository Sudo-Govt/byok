export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  maxSize?: number; // Maximum number of items
}

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  accessCount: number;
  lastAccessed: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}

export class InMemoryCache<T = any> {
  private cache = new Map<string, CacheEntry<T>>();
  private defaultTTL: number;
  private maxSize: number;
  private stats = {
    hits: 0,
    misses: 0
  };

  constructor(options: CacheOptions = {}) {
    this.defaultTTL = options.ttl || 3600; // 1 hour default
    this.maxSize = options.maxSize || 1000; // 1000 items default
  }

  /**
   * Get a value from the cache
   */
  public get(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update access stats
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.stats.hits++;

    return entry.value;
  }

  /**
   * Set a value in the cache
   */
  public set(key: string, value: T, ttl?: number): void {
    const expiresAt = Date.now() + (ttl || this.defaultTTL) * 1000;
    const entry: CacheEntry<T> = {
      value,
      expiresAt,
      accessCount: 0,
      lastAccessed: Date.now()
    };

    // If cache is at max size, remove least recently used item
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, entry);
  }

  /**
   * Delete a value from the cache
   */
  public delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Check if key exists and is not expired
   */
  public has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Clear all items from cache
   */
  public clear(): void {
    this.cache.clear();
    this.stats.hits = 0;
    this.stats.misses = 0;
  }

  /**
   * Get cache statistics
   */
  public getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.cache.size,
      hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0
    };
  }

  /**
   * Get all keys in the cache
   */
  public keys(): string[] {
    this.cleanupExpired();
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache size
   */
  public size(): number {
    this.cleanupExpired();
    return this.cache.size;
  }

  /**
   * Cleanup expired entries
   */
  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Evict least recently used item
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let lruTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < lruTime) {
        lruTime = entry.lastAccessed;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
    }
  }
}

export class CacheManager {
  private static instance: CacheManager;
  private caches = new Map<string, InMemoryCache>();

  private constructor() {}

  public static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  /**
   * Get or create a named cache
   */
  public getCache<T = any>(name: string, options?: CacheOptions): InMemoryCache<T> {
    if (!this.caches.has(name)) {
      this.caches.set(name, new InMemoryCache<T>(options));
    }
    return this.caches.get(name) as InMemoryCache<T>;
  }

  /**
   * Remove a named cache
   */
  public removeCache(name: string): boolean {
    return this.caches.delete(name);
  }

  /**
   * Clear all caches
   */
  public clearAll(): void {
    for (const cache of this.caches.values()) {
      cache.clear();
    }
  }

  /**
   * Get stats for all caches
   */
  public getAllStats(): Record<string, CacheStats> {
    const stats: Record<string, CacheStats> = {};
    for (const [name, cache] of this.caches.entries()) {
      stats[name] = cache.getStats();
    }
    return stats;
  }
}

export const cacheManager = CacheManager.getInstance();