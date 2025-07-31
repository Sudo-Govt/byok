import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';

export interface ErrorHandlerOptions {
  includeStackTrace?: boolean;
  logErrors?: boolean;
  customErrorMessages?: Record<string, string>;
}

export interface ExtendedError extends Error {
  statusCode?: number;
  status?: number;
  code?: string;
  details?: any;
}

export class ErrorHandler {
  private options: ErrorHandlerOptions;

  constructor(options: ErrorHandlerOptions = {}) {
    this.options = {
      includeStackTrace: process.env.NODE_ENV === 'development',
      logErrors: true,
      ...options
    };
  }

  /**
   * Express error handling middleware
   */
  public handle = (error: ExtendedError, req: Request, res: Response, next: NextFunction): void => {
    // Log the error if logging is enabled
    if (this.options.logErrors) {
      this.logError(error, req);
    }

    // Handle ApiError instances
    if (error instanceof ApiError) {
      this.handleApiError(error, res);
      return;
    }

    // Handle other known error types
    const standardizedError = this.standardizeError(error);
    this.handleStandardError(standardizedError, res);
  };

  /**
   * Handle ApiError instances
   */
  private handleApiError(error: ApiError, res: Response): void {
    const response = error.toClientResponse();
    
    if (this.options.includeStackTrace) {
      (response.error as any).stack = error.stack;
    }

    res.status(error.statusCode).json(response);
  }

  /**
   * Handle standardized errors
   */
  private handleStandardError(error: ExtendedError, res: Response): void {
    const statusCode = error.statusCode || error.status || 500;
    const message = this.getErrorMessage(error);

    const response: any = {
      error: {
        message,
        type: this.getErrorType(error),
        timestamp: new Date().toISOString()
      }
    };

    if (error.details) {
      response.error.details = error.details;
    }

    if (this.options.includeStackTrace) {
      response.error.stack = error.stack;
    }

    res.status(statusCode).json(response);
  }

  /**
   * Standardize different error formats
   */
  private standardizeError(error: ExtendedError): ExtendedError {
    // MongoDB errors
    if (error.name === 'MongoError' || error.name === 'MongoServerError') {
      return this.handleMongoError(error);
    }

    // Validation errors
    if (error.name === 'ValidationError') {
      return this.handleValidationError(error);
    }

    // JWT errors
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return this.handleJWTError(error);
    }

    // Multer errors (file upload)
    if (error.name === 'MulterError') {
      return this.handleMulterError(error);
    }

    // Rate limiting errors
    if (error.message?.includes('rate limit')) {
      error.statusCode = 429;
    }

    return error;
  }

  /**
   * Handle MongoDB-specific errors
   */
  private handleMongoError(error: ExtendedError): ExtendedError {
    if (error.code === 11000) {
      // Duplicate key error
      error.statusCode = 409;
      error.message = 'Resource already exists';
    } else if (error.message?.includes('validation failed')) {
      error.statusCode = 422;
    } else {
      error.statusCode = 500;
      error.message = 'Database error occurred';
    }
    return error;
  }

  /**
   * Handle validation errors
   */
  private handleValidationError(error: ExtendedError): ExtendedError {
    error.statusCode = 422;
    error.message = 'Validation failed';
    return error;
  }

  /**
   * Handle JWT errors
   */
  private handleJWTError(error: ExtendedError): ExtendedError {
    error.statusCode = 401;
    if (error.name === 'TokenExpiredError') {
      error.message = 'Token has expired';
    } else {
      error.message = 'Invalid token';
    }
    return error;
  }

  /**
   * Handle file upload errors
   */
  private handleMulterError(error: ExtendedError): ExtendedError {
    error.statusCode = 400;
    if (error.code === 'LIMIT_FILE_SIZE') {
      error.message = 'File size too large';
    } else if (error.code === 'LIMIT_FILE_COUNT') {
      error.message = 'Too many files';
    } else {
      error.message = 'File upload error';
    }
    return error;
  }

  /**
   * Get appropriate error message
   */
  private getErrorMessage(error: ExtendedError): string {
    // Check for custom error messages
    if (this.options.customErrorMessages && error.code) {
      const customMessage = this.options.customErrorMessages[error.code];
      if (customMessage) return customMessage;
    }

    // Return existing message or default
    return error.message || 'An unexpected error occurred';
  }

  /**
   * Determine error type from error object
   */
  private getErrorType(error: ExtendedError): string {
    if (error.statusCode === 400) return 'BAD_REQUEST';
    if (error.statusCode === 401) return 'UNAUTHORIZED';
    if (error.statusCode === 403) return 'FORBIDDEN';
    if (error.statusCode === 404) return 'NOT_FOUND';
    if (error.statusCode === 409) return 'CONFLICT';
    if (error.statusCode === 422) return 'VALIDATION_ERROR';
    if (error.statusCode === 429) return 'RATE_LIMIT_EXCEEDED';
    if (error.statusCode === 500) return 'INTERNAL_SERVER_ERROR';
    return 'UNKNOWN_ERROR';
  }

  /**
   * Log error with context
   */
  private logError(error: ExtendedError, req: Request): void {
    const errorContext = {
      error: {
        name: error.name,
        message: error.message,
        statusCode: error.statusCode || error.status,
        stack: error.stack
      },
      request: {
        method: req.method,
        url: req.url,
        headers: req.headers,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      }
    };

    if (error.statusCode && error.statusCode < 500) {
      logger.warn('Client error occurred', errorContext);
    } else {
      logger.error('Server error occurred', errorContext);
    }
  }
}

/**
 * Create default error handler middleware
 */
export function createErrorHandler(options?: ErrorHandlerOptions) {
  const handler = new ErrorHandler(options);
  return handler.handle;
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Handle 404 errors (route not found)
 */
export function notFoundHandler(req: Request, res: Response, next: NextFunction): void {
  const error = ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`);
  next(error);
}