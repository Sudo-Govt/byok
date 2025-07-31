import { Request, Response, NextFunction } from 'express';
import { Validator, ValidationResult } from '../utils/validation';
import { ApiError, ErrorFactory } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { metrics } from '../utils/metrics';

// Validation target types
export type ValidationTarget = 'body' | 'query' | 'params' | 'headers';

// Validation options
export interface ValidatorMiddlewareOptions {
  abortEarly?: boolean;
  allowUnknown?: boolean;
  stripUnknown?: boolean;
  skipOnError?: boolean;
  logValidation?: boolean;
}

// Validation middleware factory
export function validateRequest(
  target: ValidationTarget,
  validator: Validator,
  options: ValidatorMiddlewareOptions = {}
) {
  const {
    abortEarly = false,
    allowUnknown = false,
    stripUnknown = true,
    skipOnError = false,
    logValidation = true,
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = req.headers['x-request-id'] as string;
    const userId = (req as any).user?.id;
    const startTime = Date.now();

    try {
      // Get data to validate based on target
      const dataToValidate = getValidationData(req, target);

      // Log validation attempt if enabled
      if (logValidation) {
        logger.debug(`Validating ${target}`, {
          requestId,
          userId,
          target,
          dataKeys: Object.keys(dataToValidate),
        });
      }

      // Perform validation
      const result: ValidationResult = validator.validate(
        dataToValidate,
        requestId,
        userId
      );

      const duration = Date.now() - startTime;

      // Update metrics
      metrics.timer('validation.duration', duration, {
        target,
        valid: result.isValid.toString(),
      });
      metrics.counter('validation.attempts', 1, {
        target,
        status: result.isValid ? 'success' : 'failed',
      });

      if (result.isValid) {
        // Validation passed - update request object with validated data
        setValidatedData(req, target, result.data, stripUnknown);

        if (logValidation) {
          logger.debug(`Validation passed for ${target}`, {
            requestId,
            userId,
            target,
            duration,
          });
        }

        next();
      } else {
        // Validation failed
        if (logValidation) {
          logger.warn(`Validation failed for ${target}`, {
            requestId,
            userId,
            target,
            errors: result.errors,
            duration,
          });
        }

        if (skipOnError) {
          // Skip validation and continue
          next();
        } else {
          // Return validation error
          next(result.error);
        }
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error(`Validation process error for ${target}`, error, {
        requestId,
        userId,
        target,
        duration,
      });

      metrics.timer('validation.duration', duration, {
        target,
        error: 'true',
      });
      metrics.counter('validation.errors', 1, { target });

      const apiError = ErrorFactory.internalServerError(
        'Validation process failed',
        { 
          target,
          originalError: error instanceof Error ? error.message : 'Unknown error' 
        },
        requestId,
        userId
      );

      next(apiError);
    }
  };
}

// Get data to validate based on target
function getValidationData(req: Request, target: ValidationTarget): any {
  switch (target) {
    case 'body':
      return req.body || {};
    case 'query':
      return req.query || {};
    case 'params':
      return req.params || {};
    case 'headers':
      return req.headers || {};
    default:
      return {};
  }
}

// Set validated data back to request object
function setValidatedData(
  req: Request,
  target: ValidationTarget,
  data: any,
  stripUnknown: boolean
): void {
  switch (target) {
    case 'body':
      req.body = data;
      break;
    case 'query':
      req.query = data;
      break;
    case 'params':
      req.params = data;
      break;
    case 'headers':
      if (stripUnknown) {
        // Don't override all headers, just update validated ones
        Object.assign(req.headers, data);
      }
      break;
  }
}

// Validate request body
export function validateBody(
  validator: Validator,
  options?: ValidatorMiddlewareOptions
) {
  return validateRequest('body', validator, options);
}

// Validate query parameters
export function validateQuery(
  validator: Validator,
  options?: ValidatorMiddlewareOptions
) {
  return validateRequest('query', validator, {
    allowUnknown: true, // Usually allow unknown query params
    ...options,
  });
}

// Validate URL parameters
export function validateParams(
  validator: Validator,
  options?: ValidatorMiddlewareOptions
) {
  return validateRequest('params', validator, options);
}

// Validate headers
export function validateHeaders(
  validator: Validator,
  options?: ValidatorMiddlewareOptions
) {
  return validateRequest('headers', validator, {
    allowUnknown: true, // Usually allow unknown headers
    stripUnknown: false, // Don't strip unknown headers
    ...options,
  });
}

// Validate multiple targets
export function validateMultiple(
  validations: Array<{
    target: ValidationTarget;
    validator: Validator;
    options?: ValidatorMiddlewareOptions;
  }>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = req.headers['x-request-id'] as string;
    const userId = (req as any).user?.id;
    const startTime = Date.now();

    try {
      const results: Array<{ target: ValidationTarget; result: ValidationResult }> = [];
      let hasErrors = false;
      const errors: string[] = [];

      // Validate all targets
      for (const { target, validator, options = {} } of validations) {
        const dataToValidate = getValidationData(req, target);
        const result = validator.validate(dataToValidate, requestId, userId);
        
        results.push({ target, result });

        if (!result.isValid) {
          hasErrors = true;
          if (result.errors) {
            errors.push(...result.errors.map(err => `${target}: ${err}`));
          }
        } else {
          // Update request with validated data
          setValidatedData(req, target, result.data, options.stripUnknown !== false);
        }
      }

      const duration = Date.now() - startTime;

      // Update metrics
      metrics.timer('validation.multiple.duration', duration, {
        targetCount: validations.length.toString(),
        valid: hasErrors ? 'false' : 'true',
      });
      metrics.counter('validation.multiple.attempts', 1, {
        targetCount: validations.length.toString(),
        status: hasErrors ? 'failed' : 'success',
      });

      if (hasErrors) {
        logger.warn('Multiple validation failed', {
          requestId,
          userId,
          errors,
          targets: validations.map(v => v.target),
          duration,
        });

        const error = ErrorFactory.validationError(
          'Multiple validation errors occurred',
          {
            validationErrors: errors,
            results: results.filter(r => !r.result.isValid),
          },
          requestId,
          userId
        );

        next(error);
      } else {
        logger.debug('Multiple validation passed', {
          requestId,
          userId,
          targets: validations.map(v => v.target),
          duration,
        });

        next();
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Multiple validation process error', error, {
        requestId,
        userId,
        targets: validations.map(v => v.target),
        duration,
      });

      metrics.timer('validation.multiple.duration', duration, {
        targetCount: validations.length.toString(),
        error: 'true',
      });
      metrics.counter('validation.multiple.errors', 1);

      const apiError = ErrorFactory.internalServerError(
        'Multiple validation process failed',
        { originalError: error instanceof Error ? error.message : 'Unknown error' },
        requestId,
        userId
      );

      next(apiError);
    }
  };
}

// Conditional validation middleware
export function validateConditionally(
  condition: (req: Request) => boolean,
  validator: Validator,
  target: ValidationTarget = 'body',
  options?: ValidatorMiddlewareOptions
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (condition(req)) {
      return validateRequest(target, validator, options)(req, res, next);
    }
    next();
  };
}

// Validation middleware for different HTTP methods
export function validateByMethod(
  validations: Partial<Record<string, {
    target: ValidationTarget;
    validator: Validator;
    options?: ValidatorMiddlewareOptions;
  }>>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const methodValidation = validations[req.method.toUpperCase()];
    
    if (methodValidation) {
      const { target, validator, options } = methodValidation;
      return validateRequest(target, validator, options)(req, res, next);
    }
    
    next();
  };
}

// File upload validation middleware
export function validateFileUpload(
  options: {
    maxFiles?: number;
    maxFileSize?: number;
    allowedMimeTypes?: string[];
    allowedExtensions?: string[];
    required?: boolean;
  } = {}
) {
  const {
    maxFiles = 10,
    maxFileSize = 10 * 1024 * 1024, // 10MB
    allowedMimeTypes = [],
    allowedExtensions = [],
    required = false,
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = req.headers['x-request-id'] as string;
    const userId = (req as any).user?.id;
    const files = req.files;

    try {
      // Check if files are required
      if (required && (!files || (Array.isArray(files) && files.length === 0))) {
        const error = ErrorFactory.validationError(
          'File upload is required',
          { field: 'files' },
          requestId,
          userId
        );
        return next(error);
      }

      // Skip validation if no files and not required
      if (!files) {
        return next();
      }

      const fileArray = Array.isArray(files) ? files : [files];
      const errors: string[] = [];

      // Check number of files
      if (fileArray.length > maxFiles) {
        errors.push(`Maximum ${maxFiles} files allowed`);
      }

      // Validate each file
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i] as any;
        const fileIndex = `File ${i + 1}`;

        // Check file size
        if (file.size > maxFileSize) {
          errors.push(`${fileIndex}: File size exceeds ${maxFileSize} bytes`);
        }

        // Check MIME type
        if (allowedMimeTypes.length > 0 && !allowedMimeTypes.includes(file.mimetype)) {
          errors.push(`${fileIndex}: Invalid file type. Allowed: ${allowedMimeTypes.join(', ')}`);
        }

        // Check file extension
        if (allowedExtensions.length > 0) {
          const extension = file.originalname.split('.').pop()?.toLowerCase();
          if (!extension || !allowedExtensions.includes(extension)) {
            errors.push(`${fileIndex}: Invalid file extension. Allowed: ${allowedExtensions.join(', ')}`);
          }
        }
      }

      // Update metrics
      metrics.counter('validation.file_upload', 1, {
        fileCount: fileArray.length.toString(),
        valid: errors.length === 0 ? 'true' : 'false',
      });

      if (errors.length > 0) {
        logger.warn('File upload validation failed', {
          requestId,
          userId,
          errors,
          fileCount: fileArray.length,
        });

        const error = ErrorFactory.validationError(
          'File upload validation failed',
          { validationErrors: errors },
          requestId,
          userId
        );

        next(error);
      } else {
        logger.debug('File upload validation passed', {
          requestId,
          userId,
          fileCount: fileArray.length,
        });

        next();
      }
    } catch (error) {
      logger.error('File upload validation error', error, {
        requestId,
        userId,
      });

      metrics.counter('validation.file_upload.errors', 1);

      const apiError = ErrorFactory.internalServerError(
        'File upload validation failed',
        { originalError: error instanceof Error ? error.message : 'Unknown error' },
        requestId,
        userId
      );

      next(apiError);
    }
  };
}

// Content type validation middleware
export function validateContentType(allowedTypes: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentType = req.get('Content-Type');
    const requestId = req.headers['x-request-id'] as string;
    const userId = (req as any).user?.id;

    if (!contentType) {
      const error = ErrorFactory.validationError(
        'Content-Type header is required',
        { allowedTypes },
        requestId,
        userId
      );
      return next(error);
    }

    const isAllowed = allowedTypes.some(type => contentType.includes(type));
    
    if (!isAllowed) {
      const error = ErrorFactory.validationError(
        `Invalid Content-Type. Allowed types: ${allowedTypes.join(', ')}`,
        { 
          contentType,
          allowedTypes 
        },
        requestId,
        userId
      );
      return next(error);
    }

    next();
  };
}

// Validation utilities
export const validatorUtils = {
  // Create sanitization middleware
  sanitizeInput: (targets: ValidationTarget[] = ['body', 'query', 'params']) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      for (const target of targets) {
        const data = getValidationData(req, target);
        if (data && typeof data === 'object') {
          // Basic sanitization
          const sanitized = sanitizeObject(data);
          setValidatedData(req, target, sanitized, false);
        }
      }
      next();
    };
  },

  // Check if request has valid JSON body
  hasValidJsonBody: (req: Request): boolean => {
    return req.is('json') && typeof req.body === 'object' && req.body !== null;
  },

  // Get validation summary for monitoring
  getValidationMetrics: () => {
    // This would return validation metrics for monitoring
    return {
      // Implementation would depend on metrics system
    };
  },
};

// Basic object sanitization
function sanitizeObject(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const sanitized: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      // Basic string sanitization
      sanitized[key] = value.trim();
    } else {
      sanitized[key] = sanitizeObject(value);
    }
  }

  return sanitized;
}

export default {
  validateRequest,
  validateBody,
  validateQuery,
  validateParams,
  validateHeaders,
  validateMultiple,
  validateConditionally,
  validateByMethod,
  validateFileUpload,
  validateContentType,
  validatorUtils,
};