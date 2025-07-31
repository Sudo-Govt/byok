import Joi from 'joi';
import { logger } from './logger';
import { ApiError, ErrorFactory } from './ApiError';

// Validation options
export interface ValidationOptions {
  allowUnknown?: boolean;
  stripUnknown?: boolean;
  abortEarly?: boolean;
  skipFunctions?: boolean;
  context?: any;
}

// Default validation options
const defaultOptions: ValidationOptions = {
  allowUnknown: false,
  stripUnknown: true,
  abortEarly: false,
  skipFunctions: true,
};

// Validation result interface
export interface ValidationResult<T = any> {
  isValid: boolean;
  data?: T;
  errors?: string[];
  error?: ApiError;
}

// Custom validation class
export class Validator {
  private schema: Joi.Schema;
  private options: ValidationOptions;

  constructor(schema: Joi.Schema, options: ValidationOptions = {}) {
    this.schema = schema;
    this.options = { ...defaultOptions, ...options };
  }

  // Validate data against schema
  validate<T = any>(data: any, requestId?: string, userId?: string): ValidationResult<T> {
    try {
      const { error, value } = this.schema.validate(data, this.options);

      if (error) {
        const errors = error.details.map(detail => detail.message);
        const apiError = ErrorFactory.validationError(
          'Validation failed',
          { 
            validationErrors: errors,
            invalidFields: error.details.map(detail => detail.path.join('.'))
          },
          requestId,
          userId
        );

        logger.warn('Validation failed', {
          errors,
          data: this.sanitizeForLogging(data),
          requestId,
          userId
        });

        return {
          isValid: false,
          errors,
          error: apiError,
        };
      }

      return {
        isValid: true,
        data: value as T,
      };
    } catch (error) {
      const apiError = ErrorFactory.internalServerError(
        'Validation process failed',
        { originalError: error instanceof Error ? error.message : 'Unknown error' },
        requestId,
        userId
      );

      logger.error('Validation process error', error, { requestId, userId });

      return {
        isValid: false,
        errors: ['Validation process failed'],
        error: apiError,
      };
    }
  }

  // Validate and throw error if invalid
  validateOrThrow<T = any>(data: any, requestId?: string, userId?: string): T {
    const result = this.validate<T>(data, requestId, userId);
    
    if (!result.isValid) {
      throw result.error;
    }
    
    return result.data!;
  }

  // Sanitize data for logging (remove sensitive fields)
  private sanitizeForLogging(data: any): any {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth', 'credential'];
    const sanitized = { ...data };

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }
}

// Common validation schemas
export const commonSchemas = {
  // Basic types
  id: Joi.string().guid({ version: 'uuidv4' }).required(),
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string().min(8).max(128).required(),
  username: Joi.string().alphanum().min(3).max(30).required(),
  name: Joi.string().trim().min(1).max(100).required(),
  description: Joi.string().trim().max(1000).allow(''),
  url: Joi.string().uri().required(),
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
  
  // Dates
  date: Joi.date().iso().required(),
  dateOptional: Joi.date().iso().optional(),
  
  // Numbers
  positiveInteger: Joi.number().integer().positive().required(),
  nonNegativeInteger: Joi.number().integer().min(0).required(),
  percentage: Joi.number().min(0).max(100).required(),
  
  // Arrays
  stringArray: Joi.array().items(Joi.string()).min(1).required(),
  idArray: Joi.array().items(Joi.string().guid({ version: 'uuidv4' })).min(1).required(),
  
  // Objects
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
  }),
  
  sorting: Joi.object({
    sortBy: Joi.string().required(),
    sortOrder: Joi.string().valid('asc', 'desc').default('asc'),
  }),
  
  // Search and filters
  searchQuery: Joi.string().trim().min(1).max(100).optional(),
  
  // Status enums
  activeStatus: Joi.string().valid('active', 'inactive').default('active'),
  booleanString: Joi.string().valid('true', 'false').default('false'),
};

// User validation schemas
export const userSchemas = {
  registration: Joi.object({
    email: commonSchemas.email,
    password: commonSchemas.password,
    firstName: commonSchemas.name,
    lastName: commonSchemas.name,
    phone: commonSchemas.phone.optional(),
    acceptTerms: Joi.boolean().valid(true).required(),
  }),

  login: Joi.object({
    email: commonSchemas.email,
    password: Joi.string().required(),
    rememberMe: Joi.boolean().default(false),
  }),

  updateProfile: Joi.object({
    firstName: commonSchemas.name.optional(),
    lastName: commonSchemas.name.optional(),
    phone: commonSchemas.phone.optional(),
    bio: commonSchemas.description.optional(),
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: commonSchemas.password,
    confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required(),
  }),

  resetPassword: Joi.object({
    token: Joi.string().required(),
    password: commonSchemas.password,
    confirmPassword: Joi.string().valid(Joi.ref('password')).required(),
  }),
};

// Project validation schemas
export const projectSchemas = {
  create: Joi.object({
    name: commonSchemas.name,
    description: commonSchemas.description.optional(),
    type: Joi.string().valid('web', 'mobile', 'desktop', 'api').required(),
    status: Joi.string().valid('planning', 'active', 'completed', 'cancelled').default('planning'),
    startDate: commonSchemas.dateOptional,
    endDate: commonSchemas.dateOptional,
    tags: Joi.array().items(Joi.string().trim().max(50)).max(10).optional(),
    metadata: Joi.object().optional(),
  }),

  update: Joi.object({
    name: commonSchemas.name.optional(),
    description: commonSchemas.description.optional(),
    type: Joi.string().valid('web', 'mobile', 'desktop', 'api').optional(),
    status: Joi.string().valid('planning', 'active', 'completed', 'cancelled').optional(),
    startDate: commonSchemas.dateOptional,
    endDate: commonSchemas.dateOptional,
    tags: Joi.array().items(Joi.string().trim().max(50)).max(10).optional(),
    metadata: Joi.object().optional(),
  }),

  search: Joi.object({
    query: commonSchemas.searchQuery,
    type: Joi.string().valid('web', 'mobile', 'desktop', 'api').optional(),
    status: Joi.string().valid('planning', 'active', 'completed', 'cancelled').optional(),
    tags: Joi.array().items(Joi.string()).optional(),
    ...commonSchemas.pagination,
    ...commonSchemas.sorting,
  }),
};

// API validation schemas
export const apiSchemas = {
  requestId: Joi.string().guid({ version: 'uuidv4' }).optional(),
  
  headers: Joi.object({
    'content-type': Joi.string().valid('application/json').required(),
    'authorization': Joi.string().pattern(/^Bearer .+$/).optional(),
    'x-request-id': Joi.string().guid({ version: 'uuidv4' }).optional(),
  }).unknown(true),

  queryParams: Joi.object({
    ...commonSchemas.pagination,
    search: commonSchemas.searchQuery,
  }).unknown(true),
};

// File validation schemas
export const fileSchemas = {
  upload: Joi.object({
    filename: Joi.string().required(),
    mimetype: Joi.string().required(),
    size: Joi.number().max(10 * 1024 * 1024).required(), // 10MB max
    encoding: Joi.string().optional(),
  }),

  image: Joi.object({
    filename: Joi.string().required(),
    mimetype: Joi.string().valid('image/jpeg', 'image/png', 'image/gif', 'image/webp').required(),
    size: Joi.number().max(5 * 1024 * 1024).required(), // 5MB max
  }),
};

// Custom validation functions
export const customValidators = {
  // Validate password strength
  passwordStrength: (value: string, helpers: any) => {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(value);
    const hasLowerCase = /[a-z]/.test(value);
    const hasNumbers = /\d/.test(value);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(value);

    if (value.length < minLength) {
      return helpers.error('password.minLength');
    }

    if (!hasUpperCase) {
      return helpers.error('password.uppercase');
    }

    if (!hasLowerCase) {
      return helpers.error('password.lowercase');
    }

    if (!hasNumbers) {
      return helpers.error('password.number');
    }

    if (!hasSpecialChar) {
      return helpers.error('password.special');
    }

    return value;
  },

  // Validate future date
  futureDate: (value: Date, helpers: any) => {
    if (value <= new Date()) {
      return helpers.error('date.future');
    }
    return value;
  },

  // Validate date range
  dateRange: (value: any, helpers: any) => {
    const { startDate, endDate } = value;
    if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
      return helpers.error('date.range');
    }
    return value;
  },

  // Validate unique array items
  uniqueArray: (value: any[], helpers: any) => {
    const unique = [...new Set(value)];
    if (unique.length !== value.length) {
      return helpers.error('array.unique');
    }
    return value;
  },
};

// Custom error messages
const customErrorMessages = {
  'password.minLength': 'Password must be at least 8 characters long',
  'password.uppercase': 'Password must contain at least one uppercase letter',
  'password.lowercase': 'Password must contain at least one lowercase letter',
  'password.number': 'Password must contain at least one number',
  'password.special': 'Password must contain at least one special character',
  'date.future': 'Date must be in the future',
  'date.range': 'End date must be after start date',
  'array.unique': 'Array items must be unique',
};

// Enhanced password schema with custom validation
export const enhancedPasswordSchema = Joi.string()
  .custom(customValidators.passwordStrength)
  .messages(customErrorMessages);

// Validation middleware factory
export function createValidator(schema: Joi.Schema, options?: ValidationOptions) {
  return new Validator(schema, options);
}

// Utility functions
export const validationUtils = {
  // Create a validator for request body
  body: (schema: Joi.Schema, options?: ValidationOptions) => {
    return createValidator(schema, options);
  },

  // Create a validator for query parameters
  query: (schema: Joi.Schema, options?: ValidationOptions) => {
    return createValidator(schema, { ...options, allowUnknown: true });
  },

  // Create a validator for URL parameters
  params: (schema: Joi.Schema, options?: ValidationOptions) => {
    return createValidator(schema, options);
  },

  // Validate multiple fields
  validateMultiple: (validations: Array<{ data: any; validator: Validator; name: string }>) => {
    const results: Record<string, ValidationResult> = {};
    let hasErrors = false;

    for (const { data, validator, name } of validations) {
      const result = validator.validate(data);
      results[name] = result;
      if (!result.isValid) {
        hasErrors = true;
      }
    }

    return {
      isValid: !hasErrors,
      results,
    };
  },

  // Sanitize input data
  sanitize: (data: any): any => {
    if (typeof data === 'string') {
      return data.trim();
    }

    if (Array.isArray(data)) {
      return data.map(item => validationUtils.sanitize(item));
    }

    if (typeof data === 'object' && data !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(data)) {
        sanitized[key] = validationUtils.sanitize(value);
      }
      return sanitized;
    }

    return data;
  },

  // Check if value is empty
  isEmpty: (value: any): boolean => {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
  },
};

export default {
  Validator,
  commonSchemas,
  userSchemas,
  projectSchemas,
  apiSchemas,
  fileSchemas,
  customValidators,
  createValidator,
  validationUtils,
};