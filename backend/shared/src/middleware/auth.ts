import { Request, Response, NextFunction } from 'express';
import { jwtUtils } from '../utils/security';
import { ApiError, ErrorFactory } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { metrics } from '../utils/metrics';

// User interface
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  permissions: string[];
  isActive: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// JWT Payload interface
export interface JwtPayload {
  sub: string; // user ID
  email: string;
  role: string;
  permissions: string[];
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

// Extended Request interface with user
export interface AuthenticatedRequest extends Request {
  user: User;
  token: string;
}

// Authentication middleware options
export interface AuthMiddlewareOptions {
  required?: boolean;
  roles?: string[];
  permissions?: string[];
  skipExpiredCheck?: boolean;
  allowInactiveUsers?: boolean;
}

// Authentication service interface
export interface AuthService {
  getUserById(id: string): Promise<User | null>;
  isUserActive(userId: string): Promise<boolean>;
  hasPermission(userId: string, permission: string): Promise<boolean>;
  hasRole(userId: string, role: string): Promise<boolean>;
  updateLastLogin(userId: string): Promise<void>;
}

// Mock auth service for demo (replace with actual implementation)
class MockAuthService implements AuthService {
  private users: Map<string, User> = new Map([
    ['user-1', {
      id: 'user-1',
      email: 'admin@example.com',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      permissions: ['users:read', 'users:write', 'projects:read', 'projects:write'],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }],
    ['user-2', {
      id: 'user-2',
      email: 'user@example.com',
      firstName: 'Regular',
      lastName: 'User',
      role: 'user',
      permissions: ['projects:read', 'projects:write'],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }],
  ]);

  async getUserById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async isUserActive(userId: string): Promise<boolean> {
    const user = await this.getUserById(userId);
    return user?.isActive || false;
  }

  async hasPermission(userId: string, permission: string): Promise<boolean> {
    const user = await this.getUserById(userId);
    return user?.permissions.includes(permission) || false;
  }

  async hasRole(userId: string, role: string): Promise<boolean> {
    const user = await this.getUserById(userId);
    return user?.role === role || false;
  }

  async updateLastLogin(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.lastLogin = new Date();
      user.updatedAt = new Date();
    }
  }
}

// Default auth service instance
export const authService: AuthService = new MockAuthService();

// Main authentication middleware
export function authenticate(options: AuthMiddlewareOptions = {}) {
  const {
    required = true,
    roles = [],
    permissions = [],
    skipExpiredCheck = false,
    allowInactiveUsers = false,
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string;
    const startTime = Date.now();

    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      const token = jwtUtils.extractFromHeader(authHeader);

      // If no token and authentication is not required, continue
      if (!token && !required) {
        logger.debug('No authentication token provided, but not required');
        return next();
      }

      // If no token but authentication is required, return error
      if (!token && required) {
        logger.warn('Authentication required but no token provided', {
          requestId,
          url: req.originalUrl,
          method: req.method,
          ip: req.ip,
        });

        metrics.counter('auth.attempts', 1, { status: 'no_token' });

        const error = ErrorFactory.authenticationError(
          'Authentication token is required',
          { reason: 'missing_token' },
          requestId
        );
        return next(error);
      }

      // Verify JWT token
      let payload: JwtPayload;
      try {
        payload = jwtUtils.verify(token!) as JwtPayload;
      } catch (jwtError) {
        logger.warn('Invalid JWT token', {
          requestId,
          error: jwtError instanceof Error ? jwtError.message : 'Unknown error',
          ip: req.ip,
        });

        metrics.counter('auth.attempts', 1, { status: 'invalid_token' });

        const error = ErrorFactory.authenticationError(
          'Invalid authentication token',
          { reason: 'invalid_token' },
          requestId
        );
        return next(error);
      }

      // Get user from database
      const user = await authService.getUserById(payload.sub);
      if (!user) {
        logger.warn('User not found for valid token', {
          requestId,
          userId: payload.sub,
          ip: req.ip,
        });

        metrics.counter('auth.attempts', 1, { status: 'user_not_found' });

        const error = ErrorFactory.authenticationError(
          'User account not found',
          { reason: 'user_not_found' },
          requestId,
          payload.sub
        );
        return next(error);
      }

      // Check if user is active
      if (!allowInactiveUsers && !user.isActive) {
        logger.warn('Inactive user attempted access', {
          requestId,
          userId: user.id,
          email: user.email,
          ip: req.ip,
        });

        metrics.counter('auth.attempts', 1, { status: 'inactive_user' });

        const error = ErrorFactory.authenticationError(
          'User account is inactive',
          { reason: 'inactive_user' },
          requestId,
          user.id
        );
        return next(error);
      }

      // Check role requirements
      if (roles.length > 0) {
        const hasRequiredRole = await authService.hasRole(user.id, user.role);
        const isRoleAllowed = roles.includes(user.role);
        
        if (!hasRequiredRole || !isRoleAllowed) {
          logger.warn('Insufficient role for access', {
            requestId,
            userId: user.id,
            userRole: user.role,
            requiredRoles: roles,
            ip: req.ip,
          });

          metrics.counter('auth.authorization', 1, { status: 'insufficient_role' });

          const error = ErrorFactory.authorizationError(
            'Insufficient role for this operation',
            { 
              userRole: user.role,
              requiredRoles: roles,
              reason: 'insufficient_role' 
            },
            requestId,
            user.id
          );
          return next(error);
        }
      }

      // Check permission requirements
      if (permissions.length > 0) {
        const hasAllPermissions = await Promise.all(
          permissions.map(permission => authService.hasPermission(user.id, permission))
        );

        if (hasAllPermissions.includes(false)) {
          const missingPermissions = permissions.filter(
            (permission, index) => !hasAllPermissions[index]
          );

          logger.warn('Insufficient permissions for access', {
            requestId,
            userId: user.id,
            userPermissions: user.permissions,
            requiredPermissions: permissions,
            missingPermissions,
            ip: req.ip,
          });

          metrics.counter('auth.authorization', 1, { status: 'insufficient_permissions' });

          const error = ErrorFactory.authorizationError(
            'Insufficient permissions for this operation',
            { 
              userPermissions: user.permissions,
              requiredPermissions: permissions,
              missingPermissions,
              reason: 'insufficient_permissions' 
            },
            requestId,
            user.id
          );
          return next(error);
        }
      }

      // Update last login (async, don't wait)
      authService.updateLastLogin(user.id).catch(error => {
        logger.error('Failed to update last login', error, { userId: user.id });
      });

      // Add user and token to request
      (req as AuthenticatedRequest).user = user;
      (req as AuthenticatedRequest).token = token!;

      const duration = Date.now() - startTime;

      // Log successful authentication
      logger.debug('User authenticated successfully', {
        requestId,
        userId: user.id,
        email: user.email,
        role: user.role,
        duration,
      });

      // Update metrics
      metrics.counter('auth.attempts', 1, { status: 'success' });
      metrics.timer('auth.duration', duration, { status: 'success' });

      next();
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Authentication middleware error', error, {
        requestId,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        duration,
      });

      metrics.counter('auth.errors', 1);
      metrics.timer('auth.duration', duration, { status: 'error' });

      const apiError = ErrorFactory.internalServerError(
        'Authentication process failed',
        { originalError: error instanceof Error ? error.message : 'Unknown error' },
        requestId
      );

      next(apiError);
    }
  };
}

// Authorization middleware for specific permissions
export function authorize(permissions: string | string[]) {
  const permissionArray = Array.isArray(permissions) ? permissions : [permissions];
  
  return authenticate({
    required: true,
    permissions: permissionArray,
  });
}

// Role-based authorization middleware
export function authorizeRoles(roles: string | string[]) {
  const roleArray = Array.isArray(roles) ? roles : [roles];
  
  return authenticate({
    required: true,
    roles: roleArray,
  });
}

// Optional authentication middleware
export function optionalAuth() {
  return authenticate({ required: false });
}

// Admin-only middleware
export function adminOnly() {
  return authorizeRoles(['admin']);
}

// User ownership middleware (checks if user owns resource)
export function requireOwnership(
  getResourceOwnerId: (req: Request) => Promise<string> | string
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = (req as AuthenticatedRequest).user;
    const requestId = req.headers['x-request-id'] as string;

    if (!user) {
      const error = ErrorFactory.authenticationError(
        'Authentication required',
        { reason: 'no_user' },
        requestId
      );
      return next(error);
    }

    try {
      const resourceOwnerId = await getResourceOwnerId(req);
      
      // Admin can access any resource
      if (user.role === 'admin') {
        return next();
      }

      // Check if user owns the resource
      if (user.id !== resourceOwnerId) {
        logger.warn('User attempted to access resource they do not own', {
          requestId,
          userId: user.id,
          resourceOwnerId,
          url: req.originalUrl,
          method: req.method,
        });

        metrics.counter('auth.ownership_check', 1, { status: 'denied' });

        const error = ErrorFactory.authorizationError(
          'You can only access your own resources',
          { 
            reason: 'not_owner',
            resourceOwnerId: resourceOwnerId 
          },
          requestId,
          user.id
        );
        return next(error);
      }

      metrics.counter('auth.ownership_check', 1, { status: 'allowed' });
      next();
    } catch (error) {
      logger.error('Ownership check error', error, {
        requestId,
        userId: user.id,
      });

      metrics.counter('auth.ownership_check', 1, { status: 'error' });

      const apiError = ErrorFactory.internalServerError(
        'Ownership check failed',
        { originalError: error instanceof Error ? error.message : 'Unknown error' },
        requestId,
        user.id
      );

      next(apiError);
    }
  };
}

// API key authentication middleware
export function authenticateApiKey(options: { headerName?: string; required?: boolean } = {}) {
  const { headerName = 'x-api-key', required = true } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string;
    const apiKey = req.headers[headerName] as string;

    if (!apiKey && !required) {
      return next();
    }

    if (!apiKey && required) {
      const error = ErrorFactory.authenticationError(
        'API key is required',
        { reason: 'missing_api_key' },
        requestId
      );
      return next(error);
    }

    try {
      // Validate API key (implement your API key validation logic)
      const isValidApiKey = await validateApiKey(apiKey!);
      
      if (!isValidApiKey) {
        logger.warn('Invalid API key', {
          requestId,
          apiKey: apiKey!.substring(0, 8) + '***', // Log partial key for debugging
          ip: req.ip,
        });

        metrics.counter('auth.api_key', 1, { status: 'invalid' });

        const error = ErrorFactory.authenticationError(
          'Invalid API key',
          { reason: 'invalid_api_key' },
          requestId
        );
        return next(error);
      }

      metrics.counter('auth.api_key', 1, { status: 'valid' });
      next();
    } catch (error) {
      logger.error('API key validation error', error, { requestId });

      metrics.counter('auth.api_key', 1, { status: 'error' });

      const apiError = ErrorFactory.internalServerError(
        'API key validation failed',
        { originalError: error instanceof Error ? error.message : 'Unknown error' },
        requestId
      );

      next(apiError);
    }
  };
}

// Validate API key (implement based on your system)
async function validateApiKey(apiKey: string): Promise<boolean> {
  // This is a mock implementation
  // In a real system, you would validate against a database or service
  const validApiKeys = ['dev-api-key-123', 'prod-api-key-456'];
  return validApiKeys.includes(apiKey);
}

// Middleware utilities
export const authUtils = {
  // Get current user from request
  getCurrentUser: (req: Request): User | null => {
    return (req as AuthenticatedRequest).user || null;
  },

  // Get current user ID from request
  getCurrentUserId: (req: Request): string | null => {
    const user = (req as AuthenticatedRequest).user;
    return user ? user.id : null;
  },

  // Check if current user has permission
  userHasPermission: async (req: Request, permission: string): Promise<boolean> => {
    const user = (req as AuthenticatedRequest).user;
    if (!user) return false;
    return authService.hasPermission(user.id, permission);
  },

  // Check if current user has role
  userHasRole: async (req: Request, role: string): Promise<boolean> => {
    const user = (req as AuthenticatedRequest).user;
    if (!user) return false;
    return authService.hasRole(user.id, role);
  },

  // Check if current user is admin
  isAdmin: (req: Request): boolean => {
    const user = (req as AuthenticatedRequest).user;
    return user?.role === 'admin' || false;
  },

  // Generate JWT token for user
  generateTokenForUser: (user: User): string => {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days
      iss: 'byok-api',
      aud: 'byok-client',
    };

    return jwtUtils.sign(payload);
  },
};

export default {
  authenticate,
  authorize,
  authorizeRoles,
  optionalAuth,
  adminOnly,
  requireOwnership,
  authenticateApiKey,
  authUtils,
  authService,
};