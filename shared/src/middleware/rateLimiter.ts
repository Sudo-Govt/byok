import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';

export interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum number of requests per window
  message?: string; // Custom error message
  statusCode?: number; // HTTP status code for rate limit response
  skipSuccessfulRequests?: boolean; // Skip counting successful requests
  skipFailedRequests?: boolean; // Skip counting failed requests
  keyGenerator?: (req: Request) => string; // Custom key generator function
  onLimitReached?: (req: Request, res: Response) => void; // Callback when limit is reached
}

export interface RateLimitInfo {
  totalRequests: number;
  remainingRequests: number;
  resetTime: Date;
}

interface RequestCounter {
  count: number;
  resetTime: number;
}

export class RateLimiter {
  private options: Required<RateLimitOptions>;
  private store = new Map<string, RequestCounter>();
  private cleanupInterval: NodeJS.Timeout;

  constructor(options: RateLimitOptions) {
    this.options = {
      windowMs: options.windowMs,
      maxRequests: options.maxRequests,
      message: options.message || 'Too many requests, please try again later',
      statusCode: options.statusCode || 429,
      skipSuccessfulRequests: options.skipSuccessfulRequests || false,
      skipFailedRequests: options.skipFailedRequests || false,
      keyGenerator: options.keyGenerator || this.defaultKeyGenerator,
      onLimitReached: options.onLimitReached || (() => {})
    };

    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Create the rate limiting middleware
   */
  public middleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const key = this.options.keyGenerator(req);
      const now = Date.now();
      const windowStart = now - this.options.windowMs;

      let counter = this.store.get(key);

      // Initialize or reset counter if window has expired
      if (!counter || counter.resetTime <= now) {
        counter = {
          count: 0,
          resetTime: now + this.options.windowMs
        };
        this.store.set(key, counter);
      }

      // Check if limit is exceeded
      if (counter.count >= this.options.maxRequests) {
        this.handleLimitExceeded(req, res, counter);
        return;
      }

      // Increment counter
      counter.count++;

      // Add rate limit headers
      this.addHeaders(res, counter);

      // Set up response tracking for successful/failed request handling
      this.setupResponseTracking(req, res, counter);

      next();
    };
  }

  /**
   * Handle when rate limit is exceeded
   */
  private handleLimitExceeded(req: Request, res: Response, counter: RequestCounter): void {
    this.addHeaders(res, counter);
    
    // Log rate limit exceeded
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.originalUrl,
      method: req.method
    });

    // Call custom callback if provided
    this.options.onLimitReached(req, res);

    // Send error response
    const error = ApiError.rateLimitExceeded(this.options.message);
    res.status(this.options.statusCode).json(error.toClientResponse());
  }

  /**
   * Add rate limit headers to response
   */
  private addHeaders(res: Response, counter: RequestCounter): void {
    const remainingRequests = Math.max(0, this.options.maxRequests - counter.count);
    
    res.set({
      'X-RateLimit-Limit': this.options.maxRequests.toString(),
      'X-RateLimit-Remaining': remainingRequests.toString(),
      'X-RateLimit-Reset': new Date(counter.resetTime).toISOString(),
      'X-RateLimit-Window': (this.options.windowMs / 1000).toString()
    });

    // Add Retry-After header if limit exceeded
    if (remainingRequests === 0) {
      const retryAfter = Math.ceil((counter.resetTime - Date.now()) / 1000);
      res.set('Retry-After', retryAfter.toString());
    }
  }

  /**
   * Setup response tracking for conditional counting
   */
  private setupResponseTracking(req: Request, res: Response, counter: RequestCounter): void {
    if (!this.options.skipSuccessfulRequests && !this.options.skipFailedRequests) {
      return; // No conditional counting needed
    }

    const originalEnd = res.end;
    const self = this;

    res.end = function(this: Response, ...args: any[]) {
      // Determine if request was successful or failed
      const isSuccessful = this.statusCode < 400;
      const isFailed = this.statusCode >= 400;

      // Decrement counter if we should skip this type of request
      if ((self.options.skipSuccessfulRequests && isSuccessful) ||
          (self.options.skipFailedRequests && isFailed)) {
        counter.count--;
      }

      // Call original end method
      originalEnd.apply(this, args);
    };
  }

  /**
   * Default key generator using IP address
   */
  private defaultKeyGenerator(req: Request): string {
    return req.ip || 'unknown';
  }

  /**
   * Get rate limit info for a specific key
   */
  public getRateLimitInfo(key: string): RateLimitInfo | null {
    const counter = this.store.get(key);
    if (!counter) return null;

    return {
      totalRequests: counter.count,
      remainingRequests: Math.max(0, this.options.maxRequests - counter.count),
      resetTime: new Date(counter.resetTime)
    };
  }

  /**
   * Reset rate limit for a specific key
   */
  public resetKey(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, counter] of this.store.entries()) {
      if (counter.resetTime <= now) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Get current store size (for monitoring)
   */
  public getStoreSize(): number {
    return this.store.size;
  }

  /**
   * Clear all rate limit data
   */
  public clear(): void {
    this.store.clear();
  }

  /**
   * Destroy the rate limiter and cleanup
   */
  public destroy(): void {
    clearInterval(this.cleanupInterval);
    this.clear();
  }
}

/**
 * Create a rate limiter with default options
 */
export function createRateLimiter(options: RateLimitOptions): (req: Request, res: Response, next: NextFunction) => void {
  const limiter = new RateLimiter(options);
  return limiter.middleware();
}

/**
 * Common rate limiter configurations
 */
export const rateLimitPresets = {
  /**
   * Strict rate limiting: 10 requests per minute
   */
  strict: (customOptions?: Partial<RateLimitOptions>) => createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
    message: 'Too many requests, please slow down',
    ...customOptions
  }),

  /**
   * Standard rate limiting: 100 requests per 15 minutes
   */
  standard: (customOptions?: Partial<RateLimitOptions>) => createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
    ...customOptions
  }),

  /**
   * Lenient rate limiting: 1000 requests per hour
   */
  lenient: (customOptions?: Partial<RateLimitOptions>) => createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 1000,
    ...customOptions
  }),

  /**
   * API rate limiting: 60 requests per minute
   */
  api: (customOptions?: Partial<RateLimitOptions>) => createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60,
    ...customOptions
  }),

  /**
   * Auth rate limiting: 5 requests per 15 minutes (for login attempts)
   */
  auth: (customOptions?: Partial<RateLimitOptions>) => createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
    message: 'Too many authentication attempts, please try again later',
    ...customOptions
  })
};