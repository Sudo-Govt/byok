import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  permissions?: string[];
  iat?: number;
  exp?: number;
}

export interface AuthOptions {
  secretKey: string;
  algorithm?: jwt.Algorithm;
  expiresIn?: string | number;
  issuer?: string;
  audience?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
  token?: string;
}

export class AuthMiddleware {
  private options: Required<AuthOptions>;

  constructor(options: AuthOptions) {
    this.options = {
      secretKey: options.secretKey,
      algorithm: options.algorithm || 'HS256',
      expiresIn: options.expiresIn || '24h',
      issuer: options.issuer || 'byok-api',
      audience: options.audience || 'byok-client'
    };
  }

  /**
   * Generate JWT token
   */
  public generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, this.options.secretKey, {
      algorithm: this.options.algorithm,
      expiresIn: this.options.expiresIn,
      issuer: this.options.issuer,
      audience: this.options.audience
    });
  }

  /**
   * Verify JWT token
   */
  public verifyToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, this.options.secretKey, {
        algorithms: [this.options.algorithm],
        issuer: this.options.issuer,
        audience: this.options.audience
      }) as JWTPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw ApiError.unauthorized('Token has expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw ApiError.unauthorized('Invalid token');
      } else {
        throw ApiError.unauthorized('Token verification failed');
      }
    }
  }

  /**
   * Extract token from request
   */
  private extractToken(req: Request): string | null {
    // Check Authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check for token in cookies
    if (req.cookies && req.cookies.token) {
      return req.cookies.token;
    }

    // Check for token in query parameters (less secure, for specific use cases)
    if (req.query.token && typeof req.query.token === 'string') {
      return req.query.token;
    }

    return null;
  }

  /**
   * Authentication middleware - requires valid JWT token
   */
  public authenticate() {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      try {
        const token = this.extractToken(req);
        
        if (!token) {
          throw ApiError.unauthorized('No token provided');
        }

        const payload = this.verifyToken(token);
        
        // Attach user info to request
        req.user = payload;
        req.token = token;

        // Log authentication success
        logger.debug('User authenticated', {
          userId: payload.userId,
          email: payload.email,
          role: payload.role
        });

        next();
      } catch (error) {
        if (error instanceof ApiError) {
          res.status(error.statusCode).json(error.toClientResponse());
        } else {
          const authError = ApiError.unauthorized('Authentication failed');
          res.status(authError.statusCode).json(authError.toClientResponse());
        }
      }
    };
  }

  /**
   * Optional authentication middleware - doesn't require token but validates if present
   */
  public optionalAuth() {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      try {
        const token = this.extractToken(req);
        
        if (token) {
          const payload = this.verifyToken(token);
          req.user = payload;
          req.token = token;
        }

        next();
      } catch (error) {
        // For optional auth, we continue even if token is invalid
        logger.warn('Optional authentication failed', { error: error.message });
        next();
      }
    };
  }

  /**
   * Role-based authorization middleware
   */
  public authorize(allowedRoles: string | string[]) {
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      if (!req.user) {
        const error = ApiError.unauthorized('Authentication required');
        res.status(error.statusCode).json(error.toClientResponse());
        return;
      }

      if (!roles.includes(req.user.role)) {
        const error = ApiError.forbidden(`Access denied. Required roles: ${roles.join(', ')}`);
        res.status(error.statusCode).json(error.toClientResponse());
        return;
      }

      next();
    };
  }

  /**
   * Permission-based authorization middleware
   */
  public requirePermissions(requiredPermissions: string | string[]) {
    const permissions = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
    
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      if (!req.user) {
        const error = ApiError.unauthorized('Authentication required');
        res.status(error.statusCode).json(error.toClientResponse());
        return;
      }

      const userPermissions = req.user.permissions || [];
      const hasAllPermissions = permissions.every(permission => 
        userPermissions.includes(permission)
      );

      if (!hasAllPermissions) {
        const error = ApiError.forbidden(`Insufficient permissions. Required: ${permissions.join(', ')}`);
        res.status(error.statusCode).json(error.toClientResponse());
        return;
      }

      next();
    };
  }

  /**
   * Resource ownership middleware - ensures user can only access their own resources
   */
  public requireOwnership(userIdField: string = 'userId') {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      if (!req.user) {
        const error = ApiError.unauthorized('Authentication required');
        res.status(error.statusCode).json(error.toClientResponse());
        return;
      }

      // Check if user is admin (admins can access all resources)
      if (req.user.role === 'admin') {
        next();
        return;
      }

      // Get resource user ID from params, body, or query
      const resourceUserId = req.params[userIdField] || 
                            req.body[userIdField] || 
                            req.query[userIdField];

      if (resourceUserId && resourceUserId !== req.user.userId) {
        const error = ApiError.forbidden('You can only access your own resources');
        res.status(error.statusCode).json(error.toClientResponse());
        return;
      }

      next();
    };
  }

  /**
   * Refresh token middleware
   */
  public refreshToken() {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      try {
        const token = this.extractToken(req);
        
        if (!token) {
          throw ApiError.unauthorized('No token provided for refresh');
        }

        // Verify the token (even if expired, we need to check its validity)
        let payload: JWTPayload;
        try {
          payload = this.verifyToken(token);
        } catch (error) {
          if (error instanceof ApiError && error.message === 'Token has expired') {
            // For refresh, we allow expired tokens but verify the signature
            payload = jwt.verify(token, this.options.secretKey, {
              algorithms: [this.options.algorithm],
              ignoreExpiration: true
            }) as JWTPayload;
          } else {
            throw error;
          }
        }

        // Generate new token
        const newPayload = {
          userId: payload.userId,
          email: payload.email,
          role: payload.role,
          permissions: payload.permissions
        };
        
        const newToken = this.generateToken(newPayload);

        res.json({
          token: newToken,
          user: newPayload
        });
      } catch (error) {
        if (error instanceof ApiError) {
          res.status(error.statusCode).json(error.toClientResponse());
        } else {
          const authError = ApiError.unauthorized('Token refresh failed');
          res.status(authError.statusCode).json(authError.toClientResponse());
        }
      }
    };
  }
}

/**
 * Create authentication middleware with default options
 */
export function createAuthMiddleware(options: AuthOptions): AuthMiddleware {
  return new AuthMiddleware(options);
}

/**
 * Common role definitions
 */
export const Roles = {
  ADMIN: 'admin',
  USER: 'user',
  MODERATOR: 'moderator',
  GUEST: 'guest'
} as const;

/**
 * Common permission definitions
 */
export const Permissions = {
  READ: 'read',
  WRITE: 'write',
  DELETE: 'delete',
  ADMIN: 'admin',
  CREATE_PROJECT: 'create:project',
  UPDATE_PROJECT: 'update:project',
  DELETE_PROJECT: 'delete:project',
  VIEW_PROJECT: 'view:project'
} as const;