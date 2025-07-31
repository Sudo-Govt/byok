export enum ErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND_ERROR = 'NOT_FOUND_ERROR',
  CONFLICT_ERROR = 'CONFLICT_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  BAD_REQUEST_ERROR = 'BAD_REQUEST_ERROR',
  SERVICE_UNAVAILABLE_ERROR = 'SERVICE_UNAVAILABLE_ERROR'
}

export interface ErrorDetails {
  field?: string;
  value?: any;
  constraint?: string;
  message?: string;
}

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly errorType: ErrorType;
  public readonly details?: ErrorDetails[];
  public readonly timestamp: Date;
  public readonly requestId?: string;

  constructor(
    message: string,
    statusCode: number,
    errorType: ErrorType,
    details?: ErrorDetails[],
    requestId?: string
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errorType = errorType;
    this.details = details;
    this.timestamp = new Date();
    this.requestId = requestId;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }

  public toJSON(): object {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      errorType: this.errorType,
      details: this.details,
      timestamp: this.timestamp,
      requestId: this.requestId,
      stack: this.stack
    };
  }

  public toClientResponse(): object {
    return {
      error: {
        message: this.message,
        type: this.errorType,
        details: this.details,
        timestamp: this.timestamp,
        requestId: this.requestId
      }
    };
  }

  // Factory methods for common error types
  public static badRequest(message: string, details?: ErrorDetails[], requestId?: string): ApiError {
    return new ApiError(message, 400, ErrorType.BAD_REQUEST_ERROR, details, requestId);
  }

  public static unauthorized(message: string = 'Unauthorized', requestId?: string): ApiError {
    return new ApiError(message, 401, ErrorType.AUTHENTICATION_ERROR, undefined, requestId);
  }

  public static forbidden(message: string = 'Forbidden', requestId?: string): ApiError {
    return new ApiError(message, 403, ErrorType.AUTHORIZATION_ERROR, undefined, requestId);
  }

  public static notFound(message: string = 'Resource not found', requestId?: string): ApiError {
    return new ApiError(message, 404, ErrorType.NOT_FOUND_ERROR, undefined, requestId);
  }

  public static conflict(message: string, details?: ErrorDetails[], requestId?: string): ApiError {
    return new ApiError(message, 409, ErrorType.CONFLICT_ERROR, details, requestId);
  }

  public static validationError(message: string, details?: ErrorDetails[], requestId?: string): ApiError {
    return new ApiError(message, 422, ErrorType.VALIDATION_ERROR, details, requestId);
  }

  public static rateLimitExceeded(message: string = 'Rate limit exceeded', requestId?: string): ApiError {
    return new ApiError(message, 429, ErrorType.RATE_LIMIT_ERROR, undefined, requestId);
  }

  public static internalServerError(message: string = 'Internal server error', requestId?: string): ApiError {
    return new ApiError(message, 500, ErrorType.INTERNAL_ERROR, undefined, requestId);
  }

  public static serviceUnavailable(message: string = 'Service unavailable', requestId?: string): ApiError {
    return new ApiError(message, 503, ErrorType.SERVICE_UNAVAILABLE_ERROR, undefined, requestId);
  }
}