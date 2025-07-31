import { Request, Response, NextFunction } from 'express';
import { Validator, ValidationRule, ValidationResult } from '../utils/validation';
import { ApiError } from '../utils/ApiError';

export interface ValidatorMiddlewareOptions {
  abortEarly?: boolean; // Stop validation on first error
  stripUnknown?: boolean; // Remove fields not in validation rules
  allowUnknown?: boolean; // Allow fields not in validation rules
}

export type ValidationType = 'body' | 'query' | 'params' | 'headers';

export interface ValidationSchema {
  [key in ValidationType]?: ValidationRule[];
}

export class ValidatorMiddleware {
  private options: ValidatorMiddlewareOptions;

  constructor(options: ValidatorMiddlewareOptions = {}) {
    this.options = {
      abortEarly: options.abortEarly ?? true,
      stripUnknown: options.stripUnknown ?? false,
      allowUnknown: options.allowUnknown ?? true,
      ...options
    };
  }

  /**
   * Create validation middleware for a specific schema
   */
  public validate(schema: ValidationSchema) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const errors: any[] = [];
      const sanitizedData: any = {};

      // Validate each part of the request
      for (const [type, rules] of Object.entries(schema) as [ValidationType, ValidationRule[]][]) {
        if (!rules || rules.length === 0) continue;

        const data = this.getRequestData(req, type);
        const validator = new Validator(rules);
        const result = this.validateData(validator, data, type);

        if (!result.isValid) {
          errors.push(...result.errors.map(error => ({
            ...error,
            location: type
          })));

          if (this.options.abortEarly) {
            break;
          }
        } else if (result.sanitizedData) {
          sanitizedData[type] = result.sanitizedData;
        }
      }

      // If there are validation errors, return them
      if (errors.length > 0) {
        const error = ApiError.validationError('Validation failed', errors.map(err => ({
          field: err.field,
          message: err.message,
          value: err.value,
          constraint: err.location
        })));
        
        res.status(error.statusCode).json(error.toClientResponse());
        return;
      }

      // Apply sanitized data back to request
      this.applySanitizedData(req, sanitizedData);

      next();
    };
  }

  /**
   * Validate body data
   */
  public validateBody(rules: ValidationRule[], options?: ValidatorMiddlewareOptions) {
    return this.validate({ body: rules });
  }

  /**
   * Validate query parameters
   */
  public validateQuery(rules: ValidationRule[], options?: ValidatorMiddlewareOptions) {
    return this.validate({ query: rules });
  }

  /**
   * Validate route parameters
   */
  public validateParams(rules: ValidationRule[], options?: ValidatorMiddlewareOptions) {
    return this.validate({ params: rules });
  }

  /**
   * Validate headers
   */
  public validateHeaders(rules: ValidationRule[], options?: ValidatorMiddlewareOptions) {
    return this.validate({ headers: rules });
  }

  /**
   * Get request data by type
   */
  private getRequestData(req: Request, type: ValidationType): any {
    switch (type) {
      case 'body':
        return req.body;
      case 'query':
        return req.query;
      case 'params':
        return req.params;
      case 'headers':
        return req.headers;
      default:
        return {};
    }
  }

  /**
   * Validate data using validator
   */
  private validateData(validator: Validator, data: any, type: ValidationType): ValidationResult {
    return validator.validate(data);
  }

  /**
   * Apply sanitized data back to request object
   */
  private applySanitizedData(req: Request, sanitizedData: any): void {
    if (sanitizedData.body) {
      req.body = sanitizedData.body;
    }
    if (sanitizedData.query) {
      req.query = sanitizedData.query;
    }
    if (sanitizedData.params) {
      req.params = sanitizedData.params;
    }
    // Note: We don't modify headers as they should generally be read-only
  }
}

/**
 * Create validator middleware instance
 */
export function createValidator(options?: ValidatorMiddlewareOptions): ValidatorMiddleware {
  return new ValidatorMiddleware(options);
}

/**
 * Quick validation middleware creators
 */
export const validate = {
  /**
   * Validate request body
   */
  body: (rules: ValidationRule[], options?: ValidatorMiddlewareOptions) => {
    const validator = new ValidatorMiddleware(options);
    return validator.validateBody(rules);
  },

  /**
   * Validate query parameters
   */
  query: (rules: ValidationRule[], options?: ValidatorMiddlewareOptions) => {
    const validator = new ValidatorMiddleware(options);
    return validator.validateQuery(rules);
  },

  /**
   * Validate route parameters
   */
  params: (rules: ValidationRule[], options?: ValidatorMiddlewareOptions) => {
    const validator = new ValidatorMiddleware(options);
    return validator.validateParams(rules);
  },

  /**
   * Validate headers
   */
  headers: (rules: ValidationRule[], options?: ValidatorMiddlewareOptions) => {
    const validator = new ValidatorMiddleware(options);
    return validator.validateHeaders(rules);
  },

  /**
   * Validate multiple parts of request
   */
  schema: (schema: ValidationSchema, options?: ValidatorMiddlewareOptions) => {
    const validator = new ValidatorMiddleware(options);
    return validator.validate(schema);
  }
};

/**
 * Common validation rules
 */
export const commonRules = {
  /**
   * Standard ID validation (UUID)
   */
  id: (): ValidationRule => ({
    field: 'id',
    required: true,
    type: 'uuid'
  }),

  /**
   * Email validation
   */
  email: (required = true): ValidationRule => ({
    field: 'email',
    required,
    type: 'email'
  }),

  /**
   * Password validation
   */
  password: (minLength = 8): ValidationRule => ({
    field: 'password',
    required: true,
    type: 'string',
    minLength,
    pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]/
  }),

  /**
   * Name validation
   */
  name: (required = true, maxLength = 100): ValidationRule => ({
    field: 'name',
    required,
    type: 'string',
    maxLength,
    sanitize: (value: string) => value?.trim()
  }),

  /**
   * Pagination offset
   */
  offset: (): ValidationRule => ({
    field: 'offset',
    required: false,
    type: 'number',
    min: 0,
    sanitize: (value: any) => value ? parseInt(value, 10) : 0
  }),

  /**
   * Pagination limit
   */
  limit: (maxLimit = 100): ValidationRule => ({
    field: 'limit',
    required: false,
    type: 'number',
    min: 1,
    max: maxLimit,
    sanitize: (value: any) => value ? parseInt(value, 10) : 10
  }),

  /**
   * Sort field validation
   */
  sort: (allowedFields: string[]): ValidationRule => ({
    field: 'sort',
    required: false,
    type: 'string',
    custom: (value: string) => {
      if (!value) return true;
      const field = value.replace(/^-/, ''); // Remove sort direction prefix
      return allowedFields.includes(field) || `Sort field must be one of: ${allowedFields.join(', ')}`;
    }
  }),

  /**
   * Search query validation
   */
  search: (maxLength = 255): ValidationRule => ({
    field: 'search',
    required: false,
    type: 'string',
    maxLength,
    sanitize: (value: string) => value?.trim()
  }),

  /**
   * Boolean field validation
   */
  boolean: (field: string, required = false): ValidationRule => ({
    field,
    required,
    type: 'boolean',
    sanitize: (value: any) => {
      if (typeof value === 'string') {
        return value.toLowerCase() === 'true';
      }
      return Boolean(value);
    }
  }),

  /**
   * Date validation
   */
  date: (field: string, required = false): ValidationRule => ({
    field,
    required,
    type: 'string',
    custom: (value: string) => {
      if (!value) return true;
      const date = new Date(value);
      return !isNaN(date.getTime()) || 'Invalid date format';
    },
    sanitize: (value: string) => value ? new Date(value).toISOString() : value
  })
};