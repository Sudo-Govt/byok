import { ValidationRule } from '../../shared/src/utils/validation';

/**
 * Validation schemas for project-related operations
 */
export const projectValidationSchemas = {
  /**
   * Schema for creating a new project
   */
  createProject: [
    {
      field: 'name',
      required: true,
      type: 'string' as const,
      minLength: 1,
      maxLength: 255,
      sanitize: (value: string) => value?.trim(),
      custom: (value: string) => {
        if (!value || value.trim().length === 0) {
          return 'Project name cannot be empty';
        }
        return true;
      }
    },
    {
      field: 'description',
      required: false,
      type: 'string' as const,
      maxLength: 2000,
      sanitize: (value: string) => value?.trim()
    },
    {
      field: 'status',
      required: false,
      type: 'string' as const,
      custom: (value: string) => {
        if (!value) return true;
        const validStatuses = ['draft', 'active', 'completed', 'archived', 'cancelled'];
        return validStatuses.includes(value) || `Status must be one of: ${validStatuses.join(', ')}`;
      }
    },
    {
      field: 'priority',
      required: false,
      type: 'string' as const,
      custom: (value: string) => {
        if (!value) return true;
        const validPriorities = ['low', 'medium', 'high', 'critical'];
        return validPriorities.includes(value) || `Priority must be one of: ${validPriorities.join(', ')}`;
      }
    },
    {
      field: 'tags',
      required: false,
      type: 'array' as const,
      custom: (value: string[]) => {
        if (!value) return true;
        if (!Array.isArray(value)) return 'Tags must be an array';
        if (value.length > 20) return 'Maximum 20 tags allowed';
        
        for (const tag of value) {
          if (typeof tag !== 'string') return 'All tags must be strings';
          if (tag.length === 0) return 'Tags cannot be empty';
          if (tag.length > 50) return 'Each tag must be 50 characters or less';
        }
        return true;
      },
      sanitize: (value: string[]) => {
        if (!Array.isArray(value)) return value;
        return value.map(tag => tag.trim()).filter(tag => tag.length > 0);
      }
    },
    {
      field: 'metadata',
      required: false,
      type: 'object' as const,
      custom: (value: any) => {
        if (!value) return true;
        if (typeof value !== 'object' || Array.isArray(value)) {
          return 'Metadata must be an object';
        }
        
        // Check for nested objects depth (max 3 levels)
        const checkDepth = (obj: any, depth = 0): boolean => {
          if (depth > 3) return false;
          if (typeof obj !== 'object' || obj === null) return true;
          
          for (const key in obj) {
            if (typeof obj[key] === 'object' && obj[key] !== null) {
              if (!checkDepth(obj[key], depth + 1)) return false;
            }
          }
          return true;
        };
        
        if (!checkDepth(value)) {
          return 'Metadata cannot be nested more than 3 levels deep';
        }
        
        // Check size (approximate)
        const jsonString = JSON.stringify(value);
        if (jsonString.length > 10000) {
          return 'Metadata size cannot exceed 10KB';
        }
        
        return true;
      }
    }
  ] as ValidationRule[],

  /**
   * Schema for updating an existing project
   */
  updateProject: [
    {
      field: 'name',
      required: false,
      type: 'string' as const,
      minLength: 1,
      maxLength: 255,
      sanitize: (value: string) => value?.trim(),
      custom: (value: string) => {
        if (value && value.trim().length === 0) {
          return 'Project name cannot be empty';
        }
        return true;
      }
    },
    {
      field: 'description',
      required: false,
      type: 'string' as const,
      maxLength: 2000,
      sanitize: (value: string) => value?.trim()
    },
    {
      field: 'status',
      required: false,
      type: 'string' as const,
      custom: (value: string) => {
        if (!value) return true;
        const validStatuses = ['draft', 'active', 'completed', 'archived', 'cancelled'];
        return validStatuses.includes(value) || `Status must be one of: ${validStatuses.join(', ')}`;
      }
    },
    {
      field: 'priority',
      required: false,
      type: 'string' as const,
      custom: (value: string) => {
        if (!value) return true;
        const validPriorities = ['low', 'medium', 'high', 'critical'];
        return validPriorities.includes(value) || `Priority must be one of: ${validPriorities.join(', ')}`;
      }
    },
    {
      field: 'tags',
      required: false,
      type: 'array' as const,
      custom: (value: string[]) => {
        if (!value) return true;
        if (!Array.isArray(value)) return 'Tags must be an array';
        if (value.length > 20) return 'Maximum 20 tags allowed';
        
        for (const tag of value) {
          if (typeof tag !== 'string') return 'All tags must be strings';
          if (tag.length === 0) return 'Tags cannot be empty';
          if (tag.length > 50) return 'Each tag must be 50 characters or less';
        }
        return true;
      },
      sanitize: (value: string[]) => {
        if (!Array.isArray(value)) return value;
        return value.map(tag => tag.trim()).filter(tag => tag.length > 0);
      }
    },
    {
      field: 'metadata',
      required: false,
      type: 'object' as const,
      custom: (value: any) => {
        if (!value) return true;
        if (typeof value !== 'object' || Array.isArray(value)) {
          return 'Metadata must be an object';
        }
        
        // Check for nested objects depth (max 3 levels)
        const checkDepth = (obj: any, depth = 0): boolean => {
          if (depth > 3) return false;
          if (typeof obj !== 'object' || obj === null) return true;
          
          for (const key in obj) {
            if (typeof obj[key] === 'object' && obj[key] !== null) {
              if (!checkDepth(obj[key], depth + 1)) return false;
            }
          }
          return true;
        };
        
        if (!checkDepth(value)) {
          return 'Metadata cannot be nested more than 3 levels deep';
        }
        
        // Check size (approximate)
        const jsonString = JSON.stringify(value);
        if (jsonString.length > 10000) {
          return 'Metadata size cannot exceed 10KB';
        }
        
        return true;
      }
    }
  ] as ValidationRule[],

  /**
   * Schema for project filtering and search
   */
  projectFilters: [
    {
      field: 'status',
      required: false,
      type: 'string' as const,
      custom: (value: string) => {
        if (!value) return true;
        const validStatuses = ['draft', 'active', 'completed', 'archived', 'cancelled'];
        return validStatuses.includes(value) || `Status must be one of: ${validStatuses.join(', ')}`;
      }
    },
    {
      field: 'priority',
      required: false,
      type: 'string' as const,
      custom: (value: string) => {
        if (!value) return true;
        const validPriorities = ['low', 'medium', 'high', 'critical'];
        return validPriorities.includes(value) || `Priority must be one of: ${validPriorities.join(', ')}`;
      }
    },
    {
      field: 'userId',
      required: false,
      type: 'uuid' as const
    },
    {
      field: 'tags',
      required: false,
      type: 'array' as const,
      custom: (value: string[]) => {
        if (!value) return true;
        if (!Array.isArray(value)) return 'Tags must be an array';
        return value.every(tag => typeof tag === 'string') || 'All tags must be strings';
      }
    },
    {
      field: 'search',
      required: false,
      type: 'string' as const,
      maxLength: 255,
      sanitize: (value: string) => value?.trim()
    }
  ] as ValidationRule[],

  /**
   * Schema for pagination and sorting
   */
  paginationAndSort: [
    {
      field: 'offset',
      required: false,
      type: 'number' as const,
      min: 0,
      sanitize: (value: any) => value ? parseInt(value, 10) : 0
    },
    {
      field: 'limit',
      required: false,
      type: 'number' as const,
      min: 1,
      max: 100,
      sanitize: (value: any) => value ? Math.min(parseInt(value, 10), 100) : 10
    },
    {
      field: 'sortBy',
      required: false,
      type: 'string' as const,
      custom: (value: string) => {
        if (!value) return true;
        const allowedFields = ['name', 'createdAt', 'updatedAt', 'priority', 'status'];
        return allowedFields.includes(value) || `Sort field must be one of: ${allowedFields.join(', ')}`;
      }
    },
    {
      field: 'sortOrder',
      required: false,
      type: 'string' as const,
      custom: (value: string) => {
        if (!value) return true;
        return ['asc', 'desc'].includes(value) || 'Sort order must be "asc" or "desc"';
      }
    }
  ] as ValidationRule[]
};

/**
 * Combined validation schemas for common use cases
 */
export const combinedProjectSchemas = {
  /**
   * Complete validation for project listing with filters, pagination, and sorting
   */
  listProjects: [
    ...projectValidationSchemas.projectFilters,
    ...projectValidationSchemas.paginationAndSort
  ] as ValidationRule[],

  /**
   * Validation for project search
   */
  searchProjects: [
    {
      field: 'q',
      required: true,
      type: 'string' as const,
      minLength: 2,
      maxLength: 255,
      sanitize: (value: string) => value?.trim()
    },
    ...projectValidationSchemas.paginationAndSort.filter(rule => 
      ['offset', 'limit'].includes(rule.field)
    )
  ] as ValidationRule[]
};

/**
 * Validation constants
 */
export const PROJECT_VALIDATION_CONSTANTS = {
  NAME_MAX_LENGTH: 255,
  DESCRIPTION_MAX_LENGTH: 2000,
  TAG_MAX_LENGTH: 50,
  MAX_TAGS: 20,
  METADATA_MAX_SIZE: 10000, // 10KB
  METADATA_MAX_DEPTH: 3,
  SEARCH_MIN_LENGTH: 2,
  SEARCH_MAX_LENGTH: 255,
  MAX_LIMIT: 100
} as const;