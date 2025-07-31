import { logger } from './logger';

// HTTP status codes
export enum HttpStatusCode {
  // Success
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,

  // Redirection
  MOVED_PERMANENTLY = 301,
  FOUND = 302,
  NOT_MODIFIED = 304,

  // Client Errors
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  PAYMENT_REQUIRED = 402,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  NOT_ACCEPTABLE = 406,
  REQUEST_TIMEOUT = 408,
  CONFLICT = 409,
  GONE = 410,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,

  // Server Errors
  INTERNAL_SERVER_ERROR = 500,
  NOT_IMPLEMENTED = 501,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
  GATEWAY_TIMEOUT = 504,
}

// Error types
export enum ErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND_ERROR = 'NOT_FOUND_ERROR',
  CONFLICT_ERROR = 'CONFLICT_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  EXTERNAL_API_ERROR = 'EXTERNAL_API_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  BUSINESS_LOGIC_ERROR = 'BUSINESS_LOGIC_ERROR',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
}

// Error severity levels
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// Custom API Error class
export class ApiError extends Error {
  public readonly statusCode: HttpStatusCode;
  public readonly type: ErrorType;
  public readonly severity: ErrorSeverity;
  public readonly isOperational: boolean;
  public readonly context?: Record<string, any>;
  public readonly timestamp: Date;
  public readonly requestId?: string;
  public readonly userId?: string;

  constructor(
    message: string,
    statusCode: HttpStatusCode = HttpStatusCode.INTERNAL_SERVER_ERROR,
    type: ErrorType = ErrorType.INTERNAL_SERVER_ERROR,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    isOperational: boolean = true,
    context?: Record<string, any>,
    requestId?: string,
    userId?: string
  ) {
    super(message);

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.type = type;
    this.severity = severity;
    this.isOperational = isOperational;
    this.context = context;
    this.timestamp = new Date();
    this.requestId = requestId;
    this.userId = userId;

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);

    // Log the error
    this.logError();
  }

  private logError(): void {
    const logData = {
      message: this.message,
      statusCode: this.statusCode,
      type: this.type,
      severity: this.severity,
      context: this.context,
      requestId: this.requestId,
      userId: this.userId,
      stack: this.stack,
    };

    switch (this.severity) {
      case ErrorSeverity.CRITICAL:
        logger.log('fatal', 'Critical API Error', logData);
        break;
      case ErrorSeverity.HIGH:
        logger.error('High Severity API Error', this, logData);
        break;
      case ErrorSeverity.MEDIUM:
        logger.warn('Medium Severity API Error', logData);
        break;
      case ErrorSeverity.LOW:
        logger.info('Low Severity API Error', logData);
        break;
    }
  }

  // Convert error to JSON for API responses
  toJSON(): Record<string, any> {
    return {
      error: {
        message: this.message,
        type: this.type,
        statusCode: this.statusCode,
        timestamp: this.timestamp.toISOString(),
        requestId: this.requestId,
        ...(this.context && { context: this.context }),
      },
    };
  }

  // Get user-friendly message
  getUserMessage(): string {
    switch (this.type) {
      case ErrorType.VALIDATION_ERROR:
        return 'The provided data is invalid. Please check your input and try again.';
      case ErrorType.AUTHENTICATION_ERROR:
        return 'Authentication failed. Please check your credentials.';
      case ErrorType.AUTHORIZATION_ERROR:
        return 'You do not have permission to perform this action.';
      case ErrorType.NOT_FOUND_ERROR:
        return 'The requested resource was not found.';
      case ErrorType.CONFLICT_ERROR:
        return 'A conflict occurred with the current state of the resource.';
      case ErrorType.RATE_LIMIT_ERROR:
        return 'Too many requests. Please try again later.';
      case ErrorType.EXTERNAL_API_ERROR:
        return 'An external service is currently unavailable. Please try again later.';
      case ErrorType.DATABASE_ERROR:
        return 'A database error occurred. Please try again later.';
      case ErrorType.NETWORK_ERROR:
        return 'A network error occurred. Please check your connection and try again.';
      case ErrorType.BUSINESS_LOGIC_ERROR:
        return this.message; // Business logic errors can show specific messages
      default:
        return 'An unexpected error occurred. Please try again later.';
    }
  }
}

// Predefined error factory functions
export class ErrorFactory {
  // Validation errors
  static validationError(
    message: string,
    context?: Record<string, any>,
    requestId?: string,
    userId?: string
  ): ApiError {
    return new ApiError(
      message,
      HttpStatusCode.BAD_REQUEST,
      ErrorType.VALIDATION_ERROR,
      ErrorSeverity.LOW,
      true,
      context,
      requestId,
      userId
    );
  }

  // Authentication errors
  static authenticationError(
    message: string = 'Authentication failed',
    context?: Record<string, any>,
    requestId?: string,
    userId?: string
  ): ApiError {
    return new ApiError(
      message,
      HttpStatusCode.UNAUTHORIZED,
      ErrorType.AUTHENTICATION_ERROR,
      ErrorSeverity.MEDIUM,
      true,
      context,
      requestId,
      userId
    );
  }

  // Authorization errors
  static authorizationError(
    message: string = 'Insufficient permissions',
    context?: Record<string, any>,
    requestId?: string,
    userId?: string
  ): ApiError {
    return new ApiError(
      message,
      HttpStatusCode.FORBIDDEN,
      ErrorType.AUTHORIZATION_ERROR,
      ErrorSeverity.MEDIUM,
      true,
      context,
      requestId,
      userId
    );
  }

  // Not found errors
  static notFoundError(
    resource: string = 'Resource',
    context?: Record<string, any>,
    requestId?: string,
    userId?: string
  ): ApiError {
    return new ApiError(
      `${resource} not found`,
      HttpStatusCode.NOT_FOUND,
      ErrorType.NOT_FOUND_ERROR,
      ErrorSeverity.LOW,
      true,
      context,
      requestId,
      userId
    );
  }

  // Conflict errors
  static conflictError(
    message: string,
    context?: Record<string, any>,
    requestId?: string,
    userId?: string
  ): ApiError {
    return new ApiError(
      message,
      HttpStatusCode.CONFLICT,
      ErrorType.CONFLICT_ERROR,
      ErrorSeverity.MEDIUM,
      true,
      context,
      requestId,
      userId
    );
  }

  // Rate limit errors
  static rateLimitError(
    message: string = 'Rate limit exceeded',
    context?: Record<string, any>,
    requestId?: string,
    userId?: string
  ): ApiError {
    return new ApiError(
      message,
      HttpStatusCode.TOO_MANY_REQUESTS,
      ErrorType.RATE_LIMIT_ERROR,
      ErrorSeverity.MEDIUM,
      true,
      context,
      requestId,
      userId
    );
  }

  // External API errors
  static externalApiError(
    service: string,
    message?: string,
    context?: Record<string, any>,
    requestId?: string,
    userId?: string
  ): ApiError {
    return new ApiError(
      message || `External service ${service} is unavailable`,
      HttpStatusCode.BAD_GATEWAY,
      ErrorType.EXTERNAL_API_ERROR,
      ErrorSeverity.HIGH,
      true,
      { service, ...context },
      requestId,
      userId
    );
  }

  // Database errors
  static databaseError(
    operation: string,
    message?: string,
    context?: Record<string, any>,
    requestId?: string,
    userId?: string
  ): ApiError {
    return new ApiError(
      message || `Database error during ${operation}`,
      HttpStatusCode.INTERNAL_SERVER_ERROR,
      ErrorType.DATABASE_ERROR,
      ErrorSeverity.HIGH,
      true,
      { operation, ...context },
      requestId,
      userId
    );
  }

  // Network errors
  static networkError(
    message: string,
    context?: Record<string, any>,
    requestId?: string,
    userId?: string
  ): ApiError {
    return new ApiError(
      message,
      HttpStatusCode.SERVICE_UNAVAILABLE,
      ErrorType.NETWORK_ERROR,
      ErrorSeverity.HIGH,
      true,
      context,
      requestId,
      userId
    );
  }

  // Business logic errors
  static businessLogicError(
    message: string,
    statusCode: HttpStatusCode = HttpStatusCode.BAD_REQUEST,
    context?: Record<string, any>,
    requestId?: string,
    userId?: string
  ): ApiError {
    return new ApiError(
      message,
      statusCode,
      ErrorType.BUSINESS_LOGIC_ERROR,
      ErrorSeverity.MEDIUM,
      true,
      context,
      requestId,
      userId
    );
  }

  // Internal server errors
  static internalServerError(
    message: string = 'Internal server error',
    context?: Record<string, any>,
    requestId?: string,
    userId?: string
  ): ApiError {
    return new ApiError(
      message,
      HttpStatusCode.INTERNAL_SERVER_ERROR,
      ErrorType.INTERNAL_SERVER_ERROR,
      ErrorSeverity.CRITICAL,
      false,
      context,
      requestId,
      userId
    );
  }
}

// Utility functions for error handling
export class ErrorUtils {
  // Check if error is operational
  static isOperationalError(error: Error): boolean {
    if (error instanceof ApiError) {
      return error.isOperational;
    }
    return false;
  }

  // Extract error details from unknown error
  static extractErrorDetails(error: unknown): {
    message: string;
    statusCode: HttpStatusCode;
    type: ErrorType;
  } {
    if (error instanceof ApiError) {
      return {
        message: error.message,
        statusCode: error.statusCode,
        type: error.type,
      };
    }

    if (error instanceof Error) {
      return {
        message: error.message,
        statusCode: HttpStatusCode.INTERNAL_SERVER_ERROR,
        type: ErrorType.INTERNAL_SERVER_ERROR,
      };
    }

    return {
      message: 'An unknown error occurred',
      statusCode: HttpStatusCode.INTERNAL_SERVER_ERROR,
      type: ErrorType.INTERNAL_SERVER_ERROR,
    };
  }

  // Convert any error to ApiError
  static toApiError(
    error: unknown,
    requestId?: string,
    userId?: string
  ): ApiError {
    if (error instanceof ApiError) {
      return error;
    }

    if (error instanceof Error) {
      return new ApiError(
        error.message,
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.INTERNAL_SERVER_ERROR,
        ErrorSeverity.HIGH,
        false,
        { originalError: error.name },
        requestId,
        userId
      );
    }

    return ErrorFactory.internalServerError(
      'An unknown error occurred',
      { originalError: String(error) },
      requestId,
      userId
    );
  }
}

export default ApiError;