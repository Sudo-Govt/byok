export interface ValidationRule {
  field: string;
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'email' | 'url' | 'uuid';
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  custom?: (value: any) => boolean | string;
  sanitize?: (value: any) => any;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  sanitizedData?: any;
}

export class Validator {
  private rules: ValidationRule[] = [];

  constructor(rules: ValidationRule[] = []) {
    this.rules = rules;
  }

  /**
   * Add a validation rule
   */
  public addRule(rule: ValidationRule): Validator {
    this.rules.push(rule);
    return this;
  }

  /**
   * Add multiple validation rules
   */
  public addRules(rules: ValidationRule[]): Validator {
    this.rules.push(...rules);
    return this;
  }

  /**
   * Validate data against defined rules
   */
  public validate(data: any): ValidationResult {
    const errors: ValidationError[] = [];
    const sanitizedData: any = Array.isArray(data) ? [] : {};

    for (const rule of this.rules) {
      const value = this.getFieldValue(data, rule.field);
      const fieldErrors = this.validateField(rule, value);
      errors.push(...fieldErrors);

      // Apply sanitization if no errors and sanitize function exists
      if (fieldErrors.length === 0 && rule.sanitize) {
        this.setFieldValue(sanitizedData, rule.field, rule.sanitize(value));
      } else if (fieldErrors.length === 0) {
        this.setFieldValue(sanitizedData, rule.field, value);
      }
    }

    // Copy over any fields not explicitly validated
    this.copyUnvalidatedFields(data, sanitizedData);

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedData: errors.length === 0 ? sanitizedData : undefined
    };
  }

  /**
   * Validate a single field
   */
  private validateField(rule: ValidationRule, value: any): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check required
    if (rule.required && (value === undefined || value === null || value === '')) {
      errors.push({
        field: rule.field,
        message: `${rule.field} is required`,
        value
      });
      return errors; // Don't continue validation if required field is missing
    }

    // Skip further validation if value is undefined/null and not required
    if (value === undefined || value === null) {
      return errors;
    }

    // Type validation
    if (rule.type) {
      const typeError = this.validateType(rule.field, value, rule.type);
      if (typeError) {
        errors.push(typeError);
        return errors; // Don't continue if type is wrong
      }
    }

    // Length validations for strings and arrays
    if (typeof value === 'string' || Array.isArray(value)) {
      if (rule.minLength !== undefined && value.length < rule.minLength) {
        errors.push({
          field: rule.field,
          message: `${rule.field} must be at least ${rule.minLength} characters long`,
          value
        });
      }
      if (rule.maxLength !== undefined && value.length > rule.maxLength) {
        errors.push({
          field: rule.field,
          message: `${rule.field} must be at most ${rule.maxLength} characters long`,
          value
        });
      }
    }

    // Numeric range validation
    if (typeof value === 'number') {
      if (rule.min !== undefined && value < rule.min) {
        errors.push({
          field: rule.field,
          message: `${rule.field} must be at least ${rule.min}`,
          value
        });
      }
      if (rule.max !== undefined && value > rule.max) {
        errors.push({
          field: rule.field,
          message: `${rule.field} must be at most ${rule.max}`,
          value
        });
      }
    }

    // Pattern validation
    if (rule.pattern && typeof value === 'string') {
      if (!rule.pattern.test(value)) {
        errors.push({
          field: rule.field,
          message: `${rule.field} format is invalid`,
          value
        });
      }
    }

    // Custom validation
    if (rule.custom) {
      const customResult = rule.custom(value);
      if (customResult !== true) {
        errors.push({
          field: rule.field,
          message: typeof customResult === 'string' ? customResult : `${rule.field} is invalid`,
          value
        });
      }
    }

    return errors;
  }

  /**
   * Validate type
   */
  private validateType(field: string, value: any, expectedType: string): ValidationError | null {
    switch (expectedType) {
      case 'string':
        if (typeof value !== 'string') {
          return { field, message: `${field} must be a string`, value };
        }
        break;
      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          return { field, message: `${field} must be a number`, value };
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          return { field, message: `${field} must be a boolean`, value };
        }
        break;
      case 'array':
        if (!Array.isArray(value)) {
          return { field, message: `${field} must be an array`, value };
        }
        break;
      case 'object':
        if (typeof value !== 'object' || Array.isArray(value) || value === null) {
          return { field, message: `${field} must be an object`, value };
        }
        break;
      case 'email':
        if (typeof value !== 'string' || !this.isValidEmail(value)) {
          return { field, message: `${field} must be a valid email address`, value };
        }
        break;
      case 'url':
        if (typeof value !== 'string' || !this.isValidURL(value)) {
          return { field, message: `${field} must be a valid URL`, value };
        }
        break;
      case 'uuid':
        if (typeof value !== 'string' || !this.isValidUUID(value)) {
          return { field, message: `${field} must be a valid UUID`, value };
        }
        break;
    }
    return null;
  }

  /**
   * Get field value using dot notation
   */
  private getFieldValue(data: any, field: string): any {
    return field.split('.').reduce((obj, key) => obj?.[key], data);
  }

  /**
   * Set field value using dot notation
   */
  private setFieldValue(data: any, field: string, value: any): void {
    const keys = field.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((obj, key) => {
      if (!(key in obj)) {
        obj[key] = {};
      }
      return obj[key];
    }, data);
    target[lastKey] = value;
  }

  /**
   * Copy fields that weren't explicitly validated
   */
  private copyUnvalidatedFields(source: any, target: any): void {
    if (typeof source !== 'object' || source === null) return;

    const validatedFields = new Set(this.rules.map(rule => rule.field.split('.')[0]));
    
    for (const key of Object.keys(source)) {
      if (!validatedFields.has(key)) {
        target[key] = source[key];
      }
    }
  }

  /**
   * Email validation
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * URL validation
   */
  private isValidURL(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * UUID validation
   */
  private isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }
}

/**
 * Quick validation functions
 */
export const quickValidate = {
  /**
   * Validate email
   */
  email: (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  /**
   * Validate UUID
   */
  uuid: (uuid: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  },

  /**
   * Validate URL
   */
  url: (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Validate required field
   */
  required: (value: any): boolean => {
    return value !== undefined && value !== null && value !== '';
  },

  /**
   * Validate string length
   */
  length: (value: string, min?: number, max?: number): boolean => {
    if (min !== undefined && value.length < min) return false;
    if (max !== undefined && value.length > max) return false;
    return true;
  },

  /**
   * Validate numeric range
   */
  range: (value: number, min?: number, max?: number): boolean => {
    if (min !== undefined && value < min) return false;
    if (max !== undefined && value > max) return false;
    return true;
  }
};