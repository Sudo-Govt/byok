import Joi from 'joi';
import { commonSchemas } from '../../shared/src/utils/validation';

// Project validation schemas
export const projectSchemas = {
  // Base project schema
  base: Joi.object({
    id: commonSchemas.id.optional(),
    name: Joi.string().trim().min(1).max(100).required()
      .messages({
        'string.empty': 'Project name is required',
        'string.min': 'Project name must be at least 1 character long',
        'string.max': 'Project name cannot exceed 100 characters',
      }),
    description: Joi.string().trim().max(1000).allow('').optional()
      .messages({
        'string.max': 'Description cannot exceed 1000 characters',
      }),
    type: Joi.string().valid('web', 'mobile', 'desktop', 'api').required()
      .messages({
        'any.only': 'Project type must be one of: web, mobile, desktop, api',
        'any.required': 'Project type is required',
      }),
    status: Joi.string().valid('planning', 'active', 'completed', 'cancelled').default('planning')
      .messages({
        'any.only': 'Project status must be one of: planning, active, completed, cancelled',
      }),
    startDate: Joi.date().iso().allow(null).optional()
      .messages({
        'date.format': 'Start date must be a valid ISO date',
      }),
    endDate: Joi.date().iso().allow(null).optional()
      .when('startDate', {
        is: Joi.exist(),
        then: Joi.date().min(Joi.ref('startDate')),
        otherwise: Joi.date(),
      })
      .messages({
        'date.format': 'End date must be a valid ISO date',
        'date.min': 'End date must be after start date',
      }),
    tags: Joi.array().items(
      Joi.string().trim().min(1).max(50)
        .pattern(/^[a-zA-Z0-9-_]+$/)
        .messages({
          'string.pattern.base': 'Tags can only contain letters, numbers, hyphens, and underscores',
          'string.min': 'Each tag must be at least 1 character long',
          'string.max': 'Each tag cannot exceed 50 characters',
        })
    ).max(10).unique().default([])
      .messages({
        'array.max': 'Cannot have more than 10 tags',
        'array.unique': 'Tags must be unique',
      }),
    metadata: Joi.object().default({}),
    ownerId: commonSchemas.id.optional(),
    createdAt: Joi.date().optional(),
    updatedAt: Joi.date().optional(),
  }),

  // Create project schema
  create: Joi.object({
    name: Joi.string().trim().min(1).max(100).required()
      .messages({
        'string.empty': 'Project name is required',
        'string.min': 'Project name must be at least 1 character long',
        'string.max': 'Project name cannot exceed 100 characters',
      }),
    description: Joi.string().trim().max(1000).allow('').optional()
      .messages({
        'string.max': 'Description cannot exceed 1000 characters',
      }),
    type: Joi.string().valid('web', 'mobile', 'desktop', 'api').required()
      .messages({
        'any.only': 'Project type must be one of: web, mobile, desktop, api',
        'any.required': 'Project type is required',
      }),
    status: Joi.string().valid('planning', 'active', 'completed', 'cancelled').default('planning')
      .messages({
        'any.only': 'Project status must be one of: planning, active, completed, cancelled',
      }),
    startDate: Joi.date().iso().allow(null).optional()
      .messages({
        'date.format': 'Start date must be a valid ISO date',
      }),
    endDate: Joi.date().iso().allow(null).optional()
      .when('startDate', {
        is: Joi.exist(),
        then: Joi.date().min(Joi.ref('startDate')),
        otherwise: Joi.date(),
      })
      .messages({
        'date.format': 'End date must be a valid ISO date',
        'date.min': 'End date must be after start date',
      }),
    tags: Joi.array().items(
      Joi.string().trim().min(1).max(50)
        .pattern(/^[a-zA-Z0-9-_]+$/)
        .messages({
          'string.pattern.base': 'Tags can only contain letters, numbers, hyphens, and underscores',
          'string.min': 'Each tag must be at least 1 character long',
          'string.max': 'Each tag cannot exceed 50 characters',
        })
    ).max(10).unique().default([])
      .messages({
        'array.max': 'Cannot have more than 10 tags',
        'array.unique': 'Tags must be unique',
      }),
    metadata: Joi.object().default({}),
  }),

  // Update project schema
  update: Joi.object({
    name: Joi.string().trim().min(1).max(100).optional()
      .messages({
        'string.empty': 'Project name cannot be empty',
        'string.min': 'Project name must be at least 1 character long',
        'string.max': 'Project name cannot exceed 100 characters',
      }),
    description: Joi.string().trim().max(1000).allow('').optional()
      .messages({
        'string.max': 'Description cannot exceed 1000 characters',
      }),
    type: Joi.string().valid('web', 'mobile', 'desktop', 'api').optional()
      .messages({
        'any.only': 'Project type must be one of: web, mobile, desktop, api',
      }),
    status: Joi.string().valid('planning', 'active', 'completed', 'cancelled').optional()
      .messages({
        'any.only': 'Project status must be one of: planning, active, completed, cancelled',
      }),
    startDate: Joi.date().iso().allow(null).optional()
      .messages({
        'date.format': 'Start date must be a valid ISO date',
      }),
    endDate: Joi.date().iso().allow(null).optional()
      .when('startDate', {
        is: Joi.exist(),
        then: Joi.date().min(Joi.ref('startDate')),
        otherwise: Joi.date(),
      })
      .messages({
        'date.format': 'End date must be a valid ISO date',
        'date.min': 'End date must be after start date',
      }),
    tags: Joi.array().items(
      Joi.string().trim().min(1).max(50)
        .pattern(/^[a-zA-Z0-9-_]+$/)
        .messages({
          'string.pattern.base': 'Tags can only contain letters, numbers, hyphens, and underscores',
          'string.min': 'Each tag must be at least 1 character long',
          'string.max': 'Each tag cannot exceed 50 characters',
        })
    ).max(10).unique().optional()
      .messages({
        'array.max': 'Cannot have more than 10 tags',
        'array.unique': 'Tags must be unique',
      }),
    metadata: Joi.object().optional(),
  }),

  // Search/filter schema
  search: Joi.object({
    // Pagination
    page: Joi.number().integer().min(1).default(1)
      .messages({
        'number.min': 'Page number must be at least 1',
        'number.integer': 'Page number must be an integer',
      }),
    limit: Joi.number().integer().min(1).max(100).default(10)
      .messages({
        'number.min': 'Limit must be at least 1',
        'number.max': 'Limit cannot exceed 100',
        'number.integer': 'Limit must be an integer',
      }),

    // Sorting
    sortBy: Joi.string().valid(
      'name', 'type', 'status', 'created_at', 'updated_at', 'start_date', 'end_date'
    ).default('created_at')
      .messages({
        'any.only': 'Sort field must be one of: name, type, status, created_at, updated_at, start_date, end_date',
      }),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
      .messages({
        'any.only': 'Sort order must be either asc or desc',
      }),

    // Filters
    type: Joi.string().valid('web', 'mobile', 'desktop', 'api').optional()
      .messages({
        'any.only': 'Project type must be one of: web, mobile, desktop, api',
      }),
    status: Joi.string().valid('planning', 'active', 'completed', 'cancelled').optional()
      .messages({
        'any.only': 'Project status must be one of: planning, active, completed, cancelled',
      }),
    search: Joi.string().trim().min(1).max(100).optional()
      .messages({
        'string.min': 'Search term must be at least 1 character long',
        'string.max': 'Search term cannot exceed 100 characters',
      }),
    tags: Joi.string().pattern(/^[a-zA-Z0-9-_,]+$/).optional()
      .messages({
        'string.pattern.base': 'Tags must be comma-separated and contain only letters, numbers, hyphens, and underscores',
      }),

    // Date filters
    startDateFrom: Joi.date().iso().optional()
      .messages({
        'date.format': 'Start date from must be a valid ISO date',
      }),
    startDateTo: Joi.date().iso().optional()
      .when('startDateFrom', {
        is: Joi.exist(),
        then: Joi.date().min(Joi.ref('startDateFrom')),
        otherwise: Joi.date(),
      })
      .messages({
        'date.format': 'Start date to must be a valid ISO date',
        'date.min': 'Start date to must be after start date from',
      }),
    endDateFrom: Joi.date().iso().optional()
      .messages({
        'date.format': 'End date from must be a valid ISO date',
      }),
    endDateTo: Joi.date().iso().optional()
      .when('endDateFrom', {
        is: Joi.exist(),
        then: Joi.date().min(Joi.ref('endDateFrom')),
        otherwise: Joi.date(),
      })
      .messages({
        'date.format': 'End date to must be a valid ISO date',
        'date.min': 'End date to must be after end date from',
      }),
  }),

  // Admin search schema (includes additional fields)
  adminSearch: Joi.object({
    // All fields from regular search
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sortBy: Joi.string().valid(
      'name', 'type', 'status', 'created_at', 'updated_at', 'start_date', 'end_date', 'owner_id'
    ).default('created_at'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
    type: Joi.string().valid('web', 'mobile', 'desktop', 'api').optional(),
    status: Joi.string().valid('planning', 'active', 'completed', 'cancelled').optional(),
    search: Joi.string().trim().min(1).max(100).optional(),
    tags: Joi.string().pattern(/^[a-zA-Z0-9-_,]+$/).optional(),
    startDateFrom: Joi.date().iso().optional(),
    startDateTo: Joi.date().iso().optional(),
    endDateFrom: Joi.date().iso().optional(),
    endDateTo: Joi.date().iso().optional(),

    // Admin-specific fields
    ownerId: commonSchemas.id.optional()
      .messages({
        'string.guid': 'Owner ID must be a valid UUID',
      }),
    q: Joi.string().trim().min(1).max(100).optional()
      .messages({
        'string.min': 'Search query must be at least 1 character long',
        'string.max': 'Search query cannot exceed 100 characters',
      }),
  }),

  // Project ID parameter schema
  projectId: Joi.object({
    id: commonSchemas.id.required()
      .messages({
        'string.guid': 'Project ID must be a valid UUID',
        'any.required': 'Project ID is required',
      }),
  }),

  // User ID parameter schema
  userId: Joi.object({
    userId: commonSchemas.id.required()
      .messages({
        'string.guid': 'User ID must be a valid UUID',
        'any.required': 'User ID is required',
      }),
  }),

  // Bulk create schema
  bulkCreate: Joi.object({
    projects: Joi.array().items(
      Joi.object({
        name: Joi.string().trim().min(1).max(100).required(),
        description: Joi.string().trim().max(1000).allow('').optional(),
        type: Joi.string().valid('web', 'mobile', 'desktop', 'api').required(),
        status: Joi.string().valid('planning', 'active', 'completed', 'cancelled').default('planning'),
        startDate: Joi.date().iso().allow(null).optional(),
        endDate: Joi.date().iso().allow(null).optional(),
        tags: Joi.array().items(
          Joi.string().trim().min(1).max(50).pattern(/^[a-zA-Z0-9-_]+$/)
        ).max(10).unique().default([]),
        metadata: Joi.object().default({}),
      })
    ).min(1).max(10).required()
      .messages({
        'array.min': 'At least one project is required',
        'array.max': 'Cannot create more than 10 projects at once',
        'any.required': 'Projects array is required',
      }),
  }),

  // Project duplicate schema
  duplicate: Joi.object({
    namePrefix: Joi.string().trim().max(20).default('Copy of')
      .messages({
        'string.max': 'Name prefix cannot exceed 20 characters',
      }),
    copyMetadata: Joi.boolean().default(true),
    resetDates: Joi.boolean().default(true),
    newStatus: Joi.string().valid('planning', 'active', 'completed', 'cancelled').default('planning'),
  }),

  // Project archive schema
  archive: Joi.object({
    reason: Joi.string().trim().max(500).optional()
      .messages({
        'string.max': 'Archive reason cannot exceed 500 characters',
      }),
  }),
};

// Custom validation functions for projects
export const projectValidationHelpers = {
  // Validate project name uniqueness (would be used in service layer)
  validateNameUniqueness: (name: string, ownerId: string, excludeId?: string) => {
    // This would be implemented to check database
    // Returns true if name is unique for the user
    return true;
  },

  // Validate date range
  validateDateRange: (startDate?: Date, endDate?: Date) => {
    if (startDate && endDate && startDate >= endDate) {
      return false;
    }
    return true;
  },

  // Validate project status transition
  validateStatusTransition: (currentStatus: string, newStatus: string) => {
    const validTransitions: Record<string, string[]> = {
      planning: ['active', 'cancelled'],
      active: ['completed', 'cancelled'],
      completed: [], // Cannot transition from completed
      cancelled: ['planning'], // Can restart cancelled projects
    };

    return validTransitions[currentStatus]?.includes(newStatus) ?? false;
  },

  // Validate tag format
  validateTagFormat: (tag: string) => {
    return /^[a-zA-Z0-9-_]+$/.test(tag) && tag.length >= 1 && tag.length <= 50;
  },

  // Validate metadata structure
  validateMetadata: (metadata: any) => {
    // Ensure metadata is a plain object and not too large
    if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
      return false;
    }

    // Check size (rough estimate)
    const stringified = JSON.stringify(metadata);
    return stringified.length <= 10000; // 10KB limit
  },
};

export default projectSchemas;