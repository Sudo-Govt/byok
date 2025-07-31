import { Request, Response, NextFunction } from 'express';
import { ApiError, ErrorUtils, ErrorFactory } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { metrics } from '../utils/metrics';

// Error response interface
interface ErrorResponse {
  error: {
    message: string;
    type: string;
    statusCode: number;
    timestamp: string;
    requestId?: string;
    context?: Record<string, any>;
  };
}

// Development error response (includes stack trace)
interface DevErrorResponse extends ErrorResponse {
  error: ErrorResponse['error'] & {
    stack?: string;
    details?: any;
  };
}

// Global error handler middleware
export const errorHandler = (
  error: Error | ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // If response was already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(error);
  }

  const requestId = req.headers['x-request-id'] as string;
  const userId = (req as any).user?.id;

  // Convert any error to ApiError
  const apiError = ErrorUtils.toApiError(error, requestId, userId);

  // Log the error with context
  const errorContext = {
    requestId,
    userId,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    body: req.body,
    params: req.params,
    query: req.query,
  };

  logger.error('Request error occurred', apiError, errorContext);

  // Update metrics
  metrics.counter('http.errors', 1, {
    statusCode: apiError.statusCode.toString(),
    type: apiError.type,
    method: req.method,
    route: req.route?.path || req.path,
  });

  // Prepare error response
  const errorResponse = createErrorResponse(apiError, req);

  // Set appropriate status code
  res.status(apiError.statusCode);

  // Set security headers
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
  });

  // Send error response
  res.json(errorResponse);
};

// Create error response based on environment
function createErrorResponse(
  apiError: ApiError,
  req: Request
): ErrorResponse | DevErrorResponse {
  const baseResponse: ErrorResponse = {
    error: {
      message: getErrorMessage(apiError, req),
      type: apiError.type,
      statusCode: apiError.statusCode,
      timestamp: apiError.timestamp.toISOString(),
      requestId: apiError.requestId,
      context: getErrorContext(apiError, req),
    },
  };

  // In development, include additional details
  if (process.env.NODE_ENV === 'development') {
    const devResponse: DevErrorResponse = {
      ...baseResponse,
      error: {
        ...baseResponse.error,
        stack: apiError.stack,
        details: {
          originalMessage: apiError.message,
          severity: apiError.severity,
          isOperational: apiError.isOperational,
        },
      },
    };
    return devResponse;
  }

  return baseResponse;
}

// Get appropriate error message for user
function getErrorMessage(apiError: ApiError, req: Request): string {
  // For internal/development use, show actual message
  if (process.env.NODE_ENV === 'development' || process.env.SHOW_ERROR_DETAILS === 'true') {
    return apiError.message;
  }

  // For production, show user-friendly message
  return apiError.getUserMessage();
}

// Get error context for response
function getErrorContext(apiError: ApiError, req: Request): Record<string, any> | undefined {
  const context: Record<string, any> = {};

  // Include API error context
  if (apiError.context) {
    Object.assign(context, apiError.context);
  }

  // Include validation errors if present
  if (apiError.context?.validationErrors) {
    context.validationErrors = apiError.context.validationErrors;
  }

  // Include invalid fields if present
  if (apiError.context?.invalidFields) {
    context.invalidFields = apiError.context.invalidFields;
  }

  // Include request information in development
  if (process.env.NODE_ENV === 'development') {
    context.request = {
      method: req.method,
      url: req.originalUrl,
      headers: sanitizeHeaders(req.headers),
    };
  }

  return Object.keys(context).length > 0 ? context : undefined;
}

// Sanitize headers for logging (remove sensitive data)
function sanitizeHeaders(headers: Record<string, any>): Record<string, any> {
  const sanitized = { ...headers };
  const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
  
  sensitiveHeaders.forEach(header => {
    if (sanitized[header]) {
      sanitized[header] = '[REDACTED]';
    }
  });

  return sanitized;
}

// Handle specific error types
export const handleValidationError = (error: any): ApiError => {
  if (error.name === 'ValidationError') {
    const validationErrors = Object.values(error.errors).map((err: any) => err.message);
    return ErrorFactory.validationError(
      'Validation failed',
      { validationErrors }
    );
  }
  return ErrorUtils.toApiError(error);
};

export const handleDatabaseError = (error: any): ApiError => {
  // PostgreSQL error codes
  const pgErrorCodes: Record<string, string> = {
    '23505': 'Duplicate entry - resource already exists',
    '23503': 'Referenced resource does not exist',
    '23502': 'Required field is missing',
    '23514': 'Invalid data format',
    '42P01': 'Table does not exist',
    '42703': 'Column does not exist',
  };

  if (error.code && pgErrorCodes[error.code]) {
    return ErrorFactory.databaseError(
      'database_operation',
      pgErrorCodes[error.code],
      { 
        code: error.code,
        detail: error.detail,
        table: error.table,
        column: error.column,
      }
    );
  }

  // Generic database error
  return ErrorFactory.databaseError(
    'database_operation',
    'Database operation failed',
    { originalError: error.message }
  );
};

export const handleAuthenticationError = (error: any): ApiError => {
  if (error.name === 'JsonWebTokenError') {
    return ErrorFactory.authenticationError('Invalid token');
  }
  
  if (error.name === 'TokenExpiredError') {
    return ErrorFactory.authenticationError('Token has expired');
  }

  return ErrorFactory.authenticationError('Authentication failed');
};

// 404 handler middleware
export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  const error = ErrorFactory.notFoundError(
    `Route ${req.method} ${req.originalUrl}`,
    {
      method: req.method,
      url: req.originalUrl,
      availableRoutes: getAvailableRoutes(req.app),
    },
    req.headers['x-request-id'] as string,
    (req as any).user?.id
  );

  next(error);
};

// Get available routes for debugging
function getAvailableRoutes(app: any): string[] {
  const routes: string[] = [];
  
  if (app._router && app._router.stack) {
    app._router.stack.forEach((middleware: any) => {
      if (middleware.route) {
        const methods = Object.keys(middleware.route.methods);
        methods.forEach(method => {
          routes.push(`${method.toUpperCase()} ${middleware.route.path}`);
        });
      } else if (middleware.name === 'router') {
        // Handle nested routers
        if (middleware.handle.stack) {
          middleware.handle.stack.forEach((handler: any) => {
            if (handler.route) {
              const methods = Object.keys(handler.route.methods);
              methods.forEach(method => {
                routes.push(`${method.toUpperCase()} ${handler.route.path}`);
              });
            }
          });
        }
      }
    });
  }

  return routes.slice(0, 10); // Limit to first 10 routes
}

// Async error handler wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Operational error handler (for graceful shutdowns)
export const handleOperationalError = (error: ApiError): void => {
  logger.error('Operational error occurred', error, {
    severity: error.severity,
    isOperational: error.isOperational,
  });

  // Update metrics
  metrics.counter('operational.errors', 1, {
    type: error.type,
    severity: error.severity,
  });

  // For critical operational errors, you might want to:
  // 1. Send alerts to monitoring systems
  // 2. Trigger automatic recovery procedures
  // 3. Scale resources if needed
  // 4. Log to external error tracking services

  if (error.severity === 'critical') {
    // Handle critical errors
    logger.log('fatal', 'Critical operational error', {
      error: error.message,
      stack: error.stack,
      context: error.context,
    });

    // Could trigger alerts here
    // alerting.sendCriticalAlert(error);
  }
};

// Programming error handler (for bugs)
export const handleProgrammingError = (error: Error): void => {
  logger.error('Programming error occurred - this indicates a bug', error, {
    name: error.name,
    stack: error.stack,
  });

  // Update metrics
  metrics.counter('programming.errors', 1, {
    name: error.name,
  });

  // For programming errors, you typically want to:
  // 1. Log the error with full details
  // 2. Send to error tracking service (e.g., Sentry)
  // 3. Alert the development team
  // 4. Potentially restart the process (depends on severity)

  // Could send to error tracking service here
  // errorTracking.captureException(error);
};

// Process uncaught exception handler
export const setupUncaughtExceptionHandler = (): void => {
  process.on('uncaughtException', (error: Error) => {
    logger.log('fatal', 'Uncaught Exception', {
      error: error.message,
      stack: error.stack,
    });

    metrics.counter('process.uncaught_exceptions', 1);

    // Graceful shutdown
    process.exit(1);
  });
};

// Process unhandled rejection handler
export const setupUnhandledRejectionHandler = (): void => {
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.log('fatal', 'Unhandled Rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
      promise: promise.toString(),
    });

    metrics.counter('process.unhandled_rejections', 1);

    // Graceful shutdown
    process.exit(1);
  });
};

// Initialize error handling
export const initializeErrorHandling = (): void => {
  setupUncaughtExceptionHandler();
  setupUnhandledRejectionHandler();
  
  logger.info('Error handling initialized');
};

export default {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  handleValidationError,
  handleDatabaseError,
  handleAuthenticationError,
  handleOperationalError,
  handleProgrammingError,
  initializeErrorHandling,
};