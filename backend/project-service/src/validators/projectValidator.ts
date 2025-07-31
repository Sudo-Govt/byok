import { createValidator, Validator } from '../../shared/src/utils/validation';
import { projectSchemas } from './projectSchemas';

// Project validators
export const projectValidators = {
  // Create project validator
  create: createValidator(projectSchemas.create, {
    abortEarly: false,
    stripUnknown: true,
    allowUnknown: false,
  }),

  // Update project validator
  update: createValidator(projectSchemas.update, {
    abortEarly: false,
    stripUnknown: true,
    allowUnknown: false,
  }),

  // Search/filter validator
  search: createValidator(projectSchemas.search, {
    abortEarly: false,
    stripUnknown: true,
    allowUnknown: true, // Allow additional query parameters
  }),

  // Admin search validator
  adminSearch: createValidator(projectSchemas.adminSearch, {
    abortEarly: false,
    stripUnknown: true,
    allowUnknown: true,
  }),

  // Project ID parameter validator
  projectId: createValidator(projectSchemas.projectId, {
    abortEarly: false,
    stripUnknown: true,
    allowUnknown: false,
  }),

  // User ID parameter validator
  userId: createValidator(projectSchemas.userId, {
    abortEarly: false,
    stripUnknown: true,
    allowUnknown: false,
  }),

  // Bulk create validator
  bulkCreate: createValidator(projectSchemas.bulkCreate, {
    abortEarly: false,
    stripUnknown: true,
    allowUnknown: false,
  }),

  // Duplicate project validator
  duplicate: createValidator(projectSchemas.duplicate, {
    abortEarly: false,
    stripUnknown: true,
    allowUnknown: false,
  }),

  // Archive project validator
  archive: createValidator(projectSchemas.archive, {
    abortEarly: false,
    stripUnknown: true,
    allowUnknown: false,
  }),
};

// Custom validation functions for complex business logic
export const projectValidationLogic = {
  // Validate project creation with business rules
  validateProjectCreation: async (projectData: any, userId: string) => {
    const validator = projectValidators.create;
    const result = validator.validate(projectData, undefined, userId);
    
    if (!result.isValid) {
      return result;
    }

    // Additional business rule validations
    const businessValidationErrors: string[] = [];

    // Check if user has reached project limit (example business rule)
    const userProjectCount = await getUserProjectCount(userId);
    const maxProjects = getUserProjectLimit(userId);
    
    if (userProjectCount >= maxProjects) {
      businessValidationErrors.push(`You have reached the maximum number of projects (${maxProjects})`);
    }

    // Validate project name doesn't contain forbidden words
    const forbiddenWords = ['admin', 'system', 'api', 'test', 'demo'];
    const projectName = result.data?.name?.toLowerCase() || '';
    
    if (forbiddenWords.some(word => projectName.includes(word))) {
      businessValidationErrors.push('Project name contains forbidden words');
    }

    // Validate start date is not in the past (if provided)
    if (result.data?.startDate && new Date(result.data.startDate) < new Date()) {
      businessValidationErrors.push('Start date cannot be in the past');
    }

    if (businessValidationErrors.length > 0) {
      return {
        isValid: false,
        errors: [...(result.errors || []), ...businessValidationErrors],
        error: result.error,
      };
    }

    return result;
  },

  // Validate project update with business rules
  validateProjectUpdate: async (projectData: any, projectId: string, userId: string) => {
    const validator = projectValidators.update;
    const result = validator.validate(projectData, undefined, userId);
    
    if (!result.isValid) {
      return result;
    }

    // Additional business rule validations
    const businessValidationErrors: string[] = [];

    // Get current project data for validation
    const currentProject = await getCurrentProject(projectId, userId);
    if (!currentProject) {
      businessValidationErrors.push('Project not found or access denied');
      return {
        isValid: false,
        errors: businessValidationErrors,
        error: result.error,
      };
    }

    // Validate status transitions
    if (result.data?.status && result.data.status !== currentProject.status) {
      const isValidTransition = validateStatusTransition(currentProject.status, result.data.status);
      if (!isValidTransition) {
        businessValidationErrors.push(
          `Cannot change status from '${currentProject.status}' to '${result.data.status}'`
        );
      }
    }

    // Validate completed projects cannot be modified (except status)
    if (currentProject.status === 'completed') {
      const allowedFields = ['status'];
      const modifiedFields = Object.keys(result.data || {});
      const disallowedFields = modifiedFields.filter(field => !allowedFields.includes(field));
      
      if (disallowedFields.length > 0) {
        businessValidationErrors.push(
          `Cannot modify ${disallowedFields.join(', ')} of completed projects`
        );
      }
    }

    // Validate date changes for active projects
    if (currentProject.status === 'active' && (result.data?.startDate || result.data?.endDate)) {
      if (result.data.startDate && new Date(result.data.startDate) > new Date()) {
        businessValidationErrors.push('Cannot set future start date for active projects');
      }
    }

    if (businessValidationErrors.length > 0) {
      return {
        isValid: false,
        errors: [...(result.errors || []), ...businessValidationErrors],
        error: result.error,
      };
    }

    return result;
  },

  // Validate project deletion
  validateProjectDeletion: async (projectId: string, userId: string) => {
    const businessValidationErrors: string[] = [];

    // Get current project data
    const currentProject = await getCurrentProject(projectId, userId);
    if (!currentProject) {
      businessValidationErrors.push('Project not found or access denied');
    } else {
      // Cannot delete completed projects
      if (currentProject.status === 'completed') {
        businessValidationErrors.push('Cannot delete completed projects');
      }

      // Cannot delete projects with active dependencies (example business rule)
      const hasDependencies = await checkProjectDependencies(projectId);
      if (hasDependencies) {
        businessValidationErrors.push('Cannot delete projects with active dependencies');
      }
    }

    return {
      isValid: businessValidationErrors.length === 0,
      errors: businessValidationErrors,
    };
  },

  // Validate search parameters with business rules
  validateProjectSearch: (searchData: any, userId: string, isAdmin: boolean = false) => {
    const validator = isAdmin ? projectValidators.adminSearch : projectValidators.search;
    const result = validator.validate(searchData, undefined, userId);
    
    if (!result.isValid) {
      return result;
    }

    // Additional business rule validations
    const businessValidationErrors: string[] = [];

    // Limit search results for non-admin users
    if (!isAdmin && result.data?.limit && result.data.limit > 50) {
      businessValidationErrors.push('Search limit cannot exceed 50 for regular users');
    }

    // Validate date range limits
    if (result.data?.startDateFrom && result.data?.startDateTo) {
      const daysDiff = (new Date(result.data.startDateTo).getTime() - new Date(result.data.startDateFrom).getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > 365) {
        businessValidationErrors.push('Date range cannot exceed 365 days');
      }
    }

    if (businessValidationErrors.length > 0) {
      return {
        isValid: false,
        errors: [...(result.errors || []), ...businessValidationErrors],
        error: result.error,
      };
    }

    return result;
  },
};

// Validation middleware factory for projects
export const createProjectValidationMiddleware = (validationType: keyof typeof projectValidators) => {
  return (target: 'body' | 'query' | 'params' = 'body') => {
    const validator = projectValidators[validationType];
    return validator.validate.bind(validator);
  };
};

// Helper functions (these would be implemented in the service layer)
async function getUserProjectCount(userId: string): Promise<number> {
  // Mock implementation - would query database
  return 5;
}

function getUserProjectLimit(userId: string): number {
  // Mock implementation - would check user plan/tier
  return 10;
}

async function getCurrentProject(projectId: string, userId: string): Promise<any> {
  // Mock implementation - would query database
  return {
    id: projectId,
    ownerId: userId,
    status: 'active',
    name: 'Test Project',
  };
}

function validateStatusTransition(currentStatus: string, newStatus: string): boolean {
  const validTransitions: Record<string, string[]> = {
    planning: ['active', 'cancelled'],
    active: ['completed', 'cancelled'],
    completed: ['cancelled'], // Can only cancel completed projects
    cancelled: ['planning'], // Can restart cancelled projects
  };

  return validTransitions[currentStatus]?.includes(newStatus) ?? false;
}

async function checkProjectDependencies(projectId: string): Promise<boolean> {
  // Mock implementation - would check for dependencies
  return false;
}

// Validation error messages
export const projectValidationMessages = {
  NAME_REQUIRED: 'Project name is required',
  NAME_TOO_LONG: 'Project name cannot exceed 100 characters',
  NAME_TOO_SHORT: 'Project name must be at least 1 character long',
  NAME_FORBIDDEN: 'Project name contains forbidden words',
  TYPE_INVALID: 'Project type must be one of: web, mobile, desktop, api',
  STATUS_INVALID: 'Project status must be one of: planning, active, completed, cancelled',
  STATUS_TRANSITION_INVALID: 'Invalid status transition',
  DATE_INVALID: 'Date must be a valid ISO date',
  DATE_RANGE_INVALID: 'End date must be after start date',
  DATE_PAST: 'Start date cannot be in the past',
  TAGS_TOO_MANY: 'Cannot have more than 10 tags',
  TAGS_INVALID_FORMAT: 'Tags can only contain letters, numbers, hyphens, and underscores',
  TAGS_NOT_UNIQUE: 'Tags must be unique',
  PROJECT_LIMIT_REACHED: 'You have reached the maximum number of projects',
  PROJECT_NOT_FOUND: 'Project not found or access denied',
  PROJECT_COMPLETED_READONLY: 'Completed projects cannot be modified',
  PROJECT_HAS_DEPENDENCIES: 'Cannot delete projects with active dependencies',
  SEARCH_LIMIT_TOO_HIGH: 'Search limit cannot exceed 50 for regular users',
  DATE_RANGE_TOO_LARGE: 'Date range cannot exceed 365 days',
};

// Validation utilities
export const projectValidationUtils = {
  // Get validation error message by code
  getErrorMessage: (code: keyof typeof projectValidationMessages): string => {
    return projectValidationMessages[code];
  },

  // Format validation errors for API response
  formatValidationErrors: (errors: string[]): { field?: string; message: string }[] => {
    return errors.map(error => {
      // Extract field name if present in error message
      const fieldMatch = error.match(/^(\w+):\s*(.+)$/);
      if (fieldMatch) {
        return {
          field: fieldMatch[1],
          message: fieldMatch[2],
        };
      }
      return { message: error };
    });
  },

  // Check if validation error is recoverable
  isRecoverableError: (error: string): boolean => {
    const recoverableErrors = [
      'NAME_TOO_LONG',
      'NAME_TOO_SHORT',
      'DATE_RANGE_INVALID',
      'TAGS_TOO_MANY',
      'TAGS_INVALID_FORMAT',
    ];
    return recoverableErrors.some(code => error.includes(code));
  },
};

export default {
  projectValidators,
  projectValidationLogic,
  createProjectValidationMiddleware,
  projectValidationMessages,
  projectValidationUtils,
};