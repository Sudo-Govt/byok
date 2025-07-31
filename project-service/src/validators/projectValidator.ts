import { Validator, ValidationRule, ValidationResult } from '../../shared/src/utils/validation';
import { projectValidationSchemas, combinedProjectSchemas, PROJECT_VALIDATION_CONSTANTS } from './projectSchemas';
import { CreateProjectData, UpdateProjectData, ProjectFilters, ProjectSortOptions, PaginationOptions } from '../services/projectService';

export class ProjectValidator {
  private createValidator: Validator;
  private updateValidator: Validator;
  private filterValidator: Validator;
  private listValidator: Validator;
  private searchValidator: Validator;

  constructor() {
    this.createValidator = new Validator(projectValidationSchemas.createProject);
    this.updateValidator = new Validator(projectValidationSchemas.updateProject);
    this.filterValidator = new Validator(projectValidationSchemas.projectFilters);
    this.listValidator = new Validator(combinedProjectSchemas.listProjects);
    this.searchValidator = new Validator(combinedProjectSchemas.searchProjects);
  }

  /**
   * Validate project creation data
   */
  public validateCreateProject(data: any): ValidationResult {
    const result = this.createValidator.validate(data);
    
    if (result.isValid && result.sanitizedData) {
      // Additional business logic validation
      const additionalValidation = this.validateBusinessRules(result.sanitizedData, 'create');
      if (!additionalValidation.isValid) {
        return additionalValidation;
      }
    }
    
    return result;
  }

  /**
   * Validate project update data
   */
  public validateUpdateProject(data: any): ValidationResult {
    const result = this.updateValidator.validate(data);
    
    if (result.isValid && result.sanitizedData) {
      // Additional business logic validation
      const additionalValidation = this.validateBusinessRules(result.sanitizedData, 'update');
      if (!additionalValidation.isValid) {
        return additionalValidation;
      }
    }
    
    return result;
  }

  /**
   * Validate project filters
   */
  public validateProjectFilters(data: any): ValidationResult {
    return this.filterValidator.validate(data);
  }

  /**
   * Validate list projects request
   */
  public validateListProjects(data: any): ValidationResult {
    return this.listValidator.validate(data);
  }

  /**
   * Validate search projects request
   */
  public validateSearchProjects(data: any): ValidationResult {
    const result = this.searchValidator.validate(data);
    
    if (result.isValid && result.sanitizedData) {
      // Additional search-specific validation
      const searchTerm = result.sanitizedData.q;
      if (searchTerm && this.containsOnlySpecialCharacters(searchTerm)) {
        return {
          isValid: false,
          errors: [{
            field: 'q',
            message: 'Search term must contain at least one alphanumeric character'
          }]
        };
      }
    }
    
    return result;
  }

  /**
   * Validate project status transition
   */
  public validateStatusTransition(currentStatus: string, newStatus: string): ValidationResult {
    const validTransitions: Record<string, string[]> = {
      draft: ['active', 'cancelled'],
      active: ['completed', 'archived', 'cancelled'],
      completed: ['archived'],
      archived: ['active'], // Allow reactivation from archive
      cancelled: [] // No transitions from cancelled
    };

    const allowedStatuses = validTransitions[currentStatus] || [];
    
    if (!allowedStatuses.includes(newStatus)) {
      return {
        isValid: false,
        errors: [{
          field: 'status',
          message: `Cannot transition from ${currentStatus} to ${newStatus}. Allowed transitions: ${allowedStatuses.join(', ') || 'none'}`
        }]
      };
    }

    return { isValid: true, errors: [] };
  }

  /**
   * Validate project ownership
   */
  public validateProjectOwnership(projectUserId: string, requestUserId: string, userRole: string): ValidationResult {
    // Admins can access any project
    if (userRole === 'admin') {
      return { isValid: true, errors: [] };
    }

    // Users can only access their own projects
    if (projectUserId !== requestUserId) {
      return {
        isValid: false,
        errors: [{
          field: 'userId',
          message: 'You can only access your own projects'
        }]
      };
    }

    return { isValid: true, errors: [] };
  }

  /**
   * Validate project name uniqueness (for same user)
   */
  public validateProjectNameUniqueness(
    projectName: string,
    userId: string,
    existingProjects: { name: string; id: string }[],
    excludeProjectId?: string
  ): ValidationResult {
    const duplicateProject = existingProjects.find(project => 
      project.name.toLowerCase() === projectName.toLowerCase() &&
      project.id !== excludeProjectId
    );

    if (duplicateProject) {
      return {
        isValid: false,
        errors: [{
          field: 'name',
          message: 'A project with this name already exists'
        }]
      };
    }

    return { isValid: true, errors: [] };
  }

  /**
   * Validate tag format and content
   */
  public validateTags(tags: string[]): ValidationResult {
    const errors: any[] = [];
    
    if (!Array.isArray(tags)) {
      return {
        isValid: false,
        errors: [{ field: 'tags', message: 'Tags must be an array' }]
      };
    }

    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i];
      
      if (typeof tag !== 'string') {
        errors.push({
          field: `tags[${i}]`,
          message: 'Tag must be a string'
        });
        continue;
      }

      // Check for invalid characters
      if (!/^[a-zA-Z0-9\-_\s]+$/.test(tag)) {
        errors.push({
          field: `tags[${i}]`,
          message: 'Tag contains invalid characters. Only letters, numbers, hyphens, underscores, and spaces are allowed'
        });
      }

      // Check for reserved words
      const reservedWords = ['null', 'undefined', 'admin', 'system', 'root'];
      if (reservedWords.includes(tag.toLowerCase())) {
        errors.push({
          field: `tags[${i}]`,
          message: `"${tag}" is a reserved word and cannot be used as a tag`
        });
      }
    }

    // Check for duplicate tags
    const uniqueTags = new Set(tags.map(tag => tag.toLowerCase()));
    if (uniqueTags.size !== tags.length) {
      errors.push({
        field: 'tags',
        message: 'Duplicate tags are not allowed'
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate metadata structure and content
   */
  public validateMetadata(metadata: any): ValidationResult {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return { isValid: true, errors: [] }; // Metadata is optional
    }

    const errors: any[] = [];

    // Check for restricted keys
    const restrictedKeys = ['__proto__', 'constructor', 'prototype'];
    for (const key of Object.keys(metadata)) {
      if (restrictedKeys.includes(key)) {
        errors.push({
          field: `metadata.${key}`,
          message: `"${key}" is a restricted metadata key`
        });
      }
    }

    // Check for sensitive data patterns
    const sensitivePatterns = [
      /password/i,
      /secret/i,
      /token/i,
      /key/i,
      /credential/i
    ];

    const checkSensitiveData = (obj: any, path = 'metadata'): void => {
      if (typeof obj !== 'object' || obj === null) return;
      
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = `${path}.${key}`;
        
        // Check key names
        if (sensitivePatterns.some(pattern => pattern.test(key))) {
          errors.push({
            field: currentPath,
            message: `Potentially sensitive data detected in metadata key: "${key}"`
          });
        }

        // Check string values
        if (typeof value === 'string' && value.length > 100) {
          // Look for patterns that might be sensitive
          if (sensitivePatterns.some(pattern => pattern.test(value))) {
            errors.push({
              field: currentPath,
              message: 'Potentially sensitive data detected in metadata value'
            });
          }
        }

        // Recursively check nested objects
        if (typeof value === 'object' && value !== null) {
          checkSensitiveData(value, currentPath);
        }
      }
    };

    checkSensitiveData(metadata);

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate business rules
   */
  private validateBusinessRules(data: any, operation: 'create' | 'update'): ValidationResult {
    const errors: any[] = [];

    // Validate tags if present
    if (data.tags) {
      const tagValidation = this.validateTags(data.tags);
      if (!tagValidation.isValid) {
        errors.push(...tagValidation.errors);
      }
    }

    // Validate metadata if present
    if (data.metadata) {
      const metadataValidation = this.validateMetadata(data.metadata);
      if (!metadataValidation.isValid) {
        errors.push(...metadataValidation.errors);
      }
    }

    // Operation-specific validations
    if (operation === 'create') {
      // For creation, name is required and should be meaningful
      if (data.name && data.name.length < 3) {
        errors.push({
          field: 'name',
          message: 'Project name should be at least 3 characters long for clarity'
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if string contains only special characters
   */
  private containsOnlySpecialCharacters(str: string): boolean {
    return /^[^a-zA-Z0-9]+$/.test(str);
  }
}

/**
 * Create a singleton instance of ProjectValidator
 */
export const projectValidator = new ProjectValidator();

/**
 * Utility functions for common validations
 */
export const projectValidationUtils = {
  /**
   * Quick validation for project ID format
   */
  isValidProjectId: (id: string): boolean => {
    return /^proj_\d+_[a-z0-9]+$/.test(id);
  },

  /**
   * Quick validation for project status
   */
  isValidStatus: (status: string): boolean => {
    return ['draft', 'active', 'completed', 'archived', 'cancelled'].includes(status);
  },

  /**
   * Quick validation for project priority
   */
  isValidPriority: (priority: string): boolean => {
    return ['low', 'medium', 'high', 'critical'].includes(priority);
  },

  /**
   * Sanitize project name
   */
  sanitizeProjectName: (name: string): string => {
    return name.trim().replace(/\s+/g, ' ');
  },

  /**
   * Sanitize project description
   */
  sanitizeProjectDescription: (description: string): string => {
    return description.trim().replace(/\s+/g, ' ');
  },

  /**
   * Validate and sanitize tags
   */
  sanitizeTags: (tags: string[]): string[] => {
    if (!Array.isArray(tags)) return [];
    
    return tags
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0)
      .filter((tag, index, arr) => arr.indexOf(tag.toLowerCase()) === index) // Remove duplicates
      .slice(0, PROJECT_VALIDATION_CONSTANTS.MAX_TAGS); // Limit to max tags
  }
};