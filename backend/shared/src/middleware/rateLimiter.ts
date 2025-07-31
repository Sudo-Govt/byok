import { Request, Response, NextFunction } from 'express';
import { RateLimiterRedis, RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import { ApiError, ErrorFactory } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { metrics } from '../utils/metrics';
import { cache } from '../utils/cache';

// Rate limiter configuration
export interface RateLimiterConfig {
  keyPrefix: string;
  points: number;          // Number of requests
  duration: number;        // Per duration in seconds
  blockDuration: number;   // Block duration in seconds
  skipFailedRequests?: boolean;
  skipSuccessfulRequests?: boolean;
  useRedis?: boolean;
  customKey?: (req: Request) => string;
  skip?: (req: Request) => boolean;
  onLimitReached?: (req: Request, rateLimiterRes: RateLimiterRes) => void;
}

// Default configurations for different rate limit types
const defaultConfigs = {
  global: {
    keyPrefix: 'global_rl',
    points: 1000,
    duration: 3600, // 1 hour
    blockDuration: 3600, // 1 hour
  },
  perIp: {
    keyPrefix: 'ip_rl',
    points: 100,
    duration: 900, // 15 minutes
    blockDuration: 900, // 15 minutes
  },
  perUser: {
    keyPrefix: 'user_rl',
    points: 500,
    duration: 3600, // 1 hour
    blockDuration: 1800, // 30 minutes
  },
  perApiKey: {
    keyPrefix: 'api_key_rl',
    points: 1000,
    duration: 3600, // 1 hour
    blockDuration: 3600, // 1 hour
  },
  strict: {
    keyPrefix: 'strict_rl',
    points: 10,
    duration: 60, // 1 minute
    blockDuration: 300, // 5 minutes
  },
  auth: {
    keyPrefix: 'auth_rl',
    points: 5,
    duration: 900, // 15 minutes
    blockDuration: 1800, // 30 minutes
  },
};

// Rate limiter class
export class RateLimiter {
  private limiter: RateLimiterRedis | RateLimiterMemory;
  private config: RateLimiterConfig;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...defaultConfigs.global, ...config };
    
    if (this.config.useRedis && process.env.NODE_ENV !== 'test') {
      this.limiter = new RateLimiterRedis({
        storeClient: cache as any, // Use cache as Redis client
        keyPrefix: this.config.keyPrefix,
        points: this.config.points,
        duration: this.config.duration,
        blockDuration: this.config.blockDuration,
        skipFailedRequests: this.config.skipFailedRequests,
        skipSuccessfulRequests: this.config.skipSuccessfulRequests,
      });
    } else {
      this.limiter = new RateLimiterMemory({
        keyPrefix: this.config.keyPrefix,
        points: this.config.points,
        duration: this.config.duration,
        blockDuration: this.config.blockDuration,
        skipFailedRequests: this.config.skipFailedRequests,
        skipSuccessfulRequests: this.config.skipSuccessfulRequests,
      });
    }
  }

  // Create middleware function
  middleware() {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        // Skip if skip function returns true
        if (this.config.skip && this.config.skip(req)) {
          return next();
        }

        // Generate key for rate limiting
        const key = this.generateKey(req);
        
        // Consume point
        const rateLimiterRes = await this.limiter.consume(key);

        // Set rate limit headers
        this.setRateLimitHeaders(res, rateLimiterRes);

        // Log successful request
        logger.debug('Rate limit check passed', {
          key,
          remainingPoints: rateLimiterRes.remainingPoints,
          totalHits: rateLimiterRes.totalHits,
        });

        // Update metrics
        metrics.counter('rate_limit.requests', 1, {
          keyPrefix: this.config.keyPrefix,
          status: 'allowed',
        });

        next();
      } catch (rateLimiterRes) {
        if (rateLimiterRes instanceof Error) {
          // Log error and allow request through
          logger.error('Rate limiter error', rateLimiterRes);
          metrics.counter('rate_limit.errors', 1, {
            keyPrefix: this.config.keyPrefix,
          });
          return next();
        }

        // Rate limit exceeded
        const key = this.generateKey(req);
        const requestId = req.headers['x-request-id'] as string;
        const userId = (req as any).user?.id;

        // Set rate limit headers
        this.setRateLimitHeaders(res, rateLimiterRes);

        // Log rate limit exceeded
        logger.warn('Rate limit exceeded', {
          key,
          keyPrefix: this.config.keyPrefix,
          remainingPoints: rateLimiterRes.remainingPoints,
          msBeforeNext: rateLimiterRes.msBeforeNext,
          requestId,
          userId,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        });

        // Update metrics
        metrics.counter('rate_limit.requests', 1, {
          keyPrefix: this.config.keyPrefix,
          status: 'blocked',
        });

        // Call custom onLimitReached handler
        if (this.config.onLimitReached) {
          this.config.onLimitReached(req, rateLimiterRes);
        }

        // Create rate limit error
        const error = ErrorFactory.rateLimitError(
          `Too many requests. Try again in ${Math.round(rateLimiterRes.msBeforeNext / 1000)} seconds.`,
          {
            retryAfter: Math.round(rateLimiterRes.msBeforeNext / 1000),
            limit: this.config.points,
            windowMs: this.config.duration * 1000,
            remaining: rateLimiterRes.remainingPoints,
          },
          requestId,
          userId
        );

        next(error);
      }
    };
  }

  // Generate key for rate limiting
  private generateKey(req: Request): string {
    if (this.config.customKey) {
      return this.config.customKey(req);
    }

    // Default key generation based on config prefix
    switch (this.config.keyPrefix) {
      case 'user_rl':
        return (req as any).user?.id || req.ip;
      case 'api_key_rl':
        return req.headers['x-api-key'] as string || req.ip;
      case 'ip_rl':
      default:
        return req.ip;
    }
  }

  // Set rate limit headers
  private setRateLimitHeaders(res: Response, rateLimiterRes: RateLimiterRes): void {
    res.set({
      'X-RateLimit-Limit': String(this.config.points),
      'X-RateLimit-Remaining': String(rateLimiterRes.remainingPoints),
      'X-RateLimit-Reset': String(new Date(Date.now() + rateLimiterRes.msBeforeNext)),
    });

    if (rateLimiterRes.remainingPoints === 0) {
      res.set('Retry-After', String(Math.round(rateLimiterRes.msBeforeNext / 1000)));
    }
  }

  // Get current status for a key
  async getStatus(key: string): Promise<RateLimiterRes | null> {
    try {
      return await this.limiter.get(key);
    } catch (error) {
      logger.error('Error getting rate limiter status', error);
      return null;
    }
  }

  // Reset rate limit for a key
  async reset(key: string): Promise<void> {
    try {
      await this.limiter.delete(key);
      logger.info('Rate limit reset', { key, keyPrefix: this.config.keyPrefix });
    } catch (error) {
      logger.error('Error resetting rate limit', error, { key });
    }
  }

  // Block a key for a specific duration
  async block(key: string, duration: number): Promise<void> {
    try {
      await this.limiter.block(key, duration);
      logger.warn('Key blocked', { key, keyPrefix: this.config.keyPrefix, duration });
    } catch (error) {
      logger.error('Error blocking key', error, { key });
    }
  }
}

// Pre-configured rate limiters
export const rateLimiters = {
  // Global rate limiter
  global: new RateLimiter({
    ...defaultConfigs.global,
    useRedis: true,
  }),

  // Per IP rate limiter
  perIp: new RateLimiter({
    ...defaultConfigs.perIp,
    useRedis: true,
    customKey: (req: Request) => req.ip,
  }),

  // Per user rate limiter
  perUser: new RateLimiter({
    ...defaultConfigs.perUser,
    useRedis: true,
    customKey: (req: Request) => (req as any).user?.id || req.ip,
    skip: (req: Request) => !(req as any).user, // Skip if no user
  }),

  // Per API key rate limiter
  perApiKey: new RateLimiter({
    ...defaultConfigs.perApiKey,
    useRedis: true,
    customKey: (req: Request) => {
      const apiKey = req.headers['x-api-key'] as string;
      return apiKey || req.ip;
    },
  }),

  // Strict rate limiter for sensitive endpoints
  strict: new RateLimiter({
    ...defaultConfigs.strict,
    useRedis: true,
  }),

  // Authentication rate limiter
  auth: new RateLimiter({
    ...defaultConfigs.auth,
    useRedis: true,
    skipSuccessfulRequests: true, // Only count failed attempts
    onLimitReached: (req: Request, rateLimiterRes: RateLimiterRes) => {
      // Log potential security threat
      logger.warn('Authentication rate limit exceeded - potential attack', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        url: req.originalUrl,
        msBeforeNext: rateLimiterRes.msBeforeNext,
      });

      // Update security metrics
      metrics.counter('security.auth.rate_limit_exceeded', 1, {
        ip: req.ip,
        endpoint: req.path,
      });
    },
  }),
};

// Rate limiter middleware factory
export function createRateLimiter(config: Partial<RateLimiterConfig> = {}): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  const rateLimiter = new RateLimiter(config);
  return rateLimiter.middleware();
}

// Common rate limiter middleware functions
export const rateLimiterMiddleware = {
  // Apply global rate limiting
  global: rateLimiters.global.middleware(),

  // Apply IP-based rate limiting
  perIp: rateLimiters.perIp.middleware(),

  // Apply user-based rate limiting
  perUser: rateLimiters.perUser.middleware(),

  // Apply API key-based rate limiting
  perApiKey: rateLimiters.perApiKey.middleware(),

  // Apply strict rate limiting
  strict: rateLimiters.strict.middleware(),

  // Apply authentication rate limiting
  auth: rateLimiters.auth.middleware(),

  // Combined rate limiting (IP + User)
  combined: [
    rateLimiters.perIp.middleware(),
    rateLimiters.perUser.middleware(),
  ],

  // Custom rate limiter for specific endpoints
  custom: (config: Partial<RateLimiterConfig>) => createRateLimiter(config),

  // Rate limiter for file uploads
  upload: createRateLimiter({
    keyPrefix: 'upload_rl',
    points: 10,
    duration: 3600, // 1 hour
    blockDuration: 3600, // 1 hour
    useRedis: true,
  }),

  // Rate limiter for password reset
  passwordReset: createRateLimiter({
    keyPrefix: 'password_reset_rl',
    points: 3,
    duration: 3600, // 1 hour
    blockDuration: 3600, // 1 hour
    useRedis: true,
    customKey: (req: Request) => `${req.ip}:${req.body.email || 'unknown'}`,
  }),

  // Rate limiter for email sending
  email: createRateLimiter({
    keyPrefix: 'email_rl',
    points: 10,
    duration: 3600, // 1 hour
    blockDuration: 1800, // 30 minutes
    useRedis: true,
  }),
};

// Rate limiter utilities
export const rateLimiterUtils = {
  // Get rate limit status for multiple keys
  async getMultipleStatuses(keys: string[], rateLimiter: RateLimiter): Promise<Record<string, RateLimiterRes | null>> {
    const statuses: Record<string, RateLimiterRes | null> = {};
    
    for (const key of keys) {
      statuses[key] = await rateLimiter.getStatus(key);
    }
    
    return statuses;
  },

  // Reset rate limits for multiple keys
  async resetMultiple(keys: string[], rateLimiter: RateLimiter): Promise<void> {
    await Promise.all(keys.map(key => rateLimiter.reset(key)));
  },

  // Check if IP is suspicious based on rate limit violations
  async isSuspiciousIp(ip: string): Promise<boolean> {
    const status = await rateLimiters.perIp.getStatus(ip);
    return status ? status.remainingPoints <= 0 : false;
  },

  // Get rate limit summary for monitoring
  async getRateLimitSummary(): Promise<Record<string, any>> {
    return {
      global: await rateLimiters.global.getStatus('global'),
      // Add more summaries as needed
    };
  },

  // Dynamic rate limiting based on user tier
  createTieredRateLimiter: (getUserTier: (req: Request) => string) => {
    const tierConfigs = {
      free: { points: 100, duration: 3600 },
      premium: { points: 500, duration: 3600 },
      enterprise: { points: 1000, duration: 3600 },
    };

    return async (req: Request, res: Response, next: NextFunction) => {
      const tier = getUserTier(req);
      const config = tierConfigs[tier as keyof typeof tierConfigs] || tierConfigs.free;
      
      const rateLimiter = new RateLimiter({
        keyPrefix: `tier_${tier}_rl`,
        ...config,
        useRedis: true,
        customKey: (req: Request) => (req as any).user?.id || req.ip,
      });

      return rateLimiter.middleware()(req, res, next);
    };
  },
};

export default {
  RateLimiter,
  rateLimiters,
  rateLimiterMiddleware,
  createRateLimiter,
  rateLimiterUtils,
};