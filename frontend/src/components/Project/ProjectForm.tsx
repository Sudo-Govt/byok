import React, { useState, useEffect } from 'react';
import { useProjectActions } from '../../hooks/useProjectActions';

// Project interfaces
interface Project {
  id: string;
  name: string;
  description?: string;
  type: 'web' | 'mobile' | 'desktop' | 'api';
  status: 'planning' | 'active' | 'completed' | 'cancelled';
  ownerId: string;
  startDate?: Date;
  endDate?: Date;
  tags: string[];
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateProjectData {
  name: string;
  description?: string;
  type: 'web' | 'mobile' | 'desktop' | 'api';
  status?: 'planning' | 'active' | 'completed' | 'cancelled';
  startDate?: Date;
  endDate?: Date;
  tags?: string[];
  metadata?: Record<string, any>;
}

interface UpdateProjectData {
  name?: string;
  description?: string;
  type?: 'web' | 'mobile' | 'desktop' | 'api';
  status?: 'planning' | 'active' | 'completed' | 'cancelled';
  startDate?: Date;
  endDate?: Date;
  tags?: string[];
  metadata?: Record<string, any>;
}

// Component props
interface ProjectFormProps {
  project?: Project; // If provided, form is in edit mode
  onSubmit?: (data: CreateProjectData | UpdateProjectData) => void;
  onCancel?: () => void;
  onSuccess?: (project: Project) => void;
  onError?: (error: Error) => void;
  className?: string;
  disabled?: boolean;
  showCancelButton?: boolean;
  submitButtonText?: string;
  title?: string;
}

// Form validation errors
interface ValidationErrors {
  name?: string;
  description?: string;
  type?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  tags?: string;
  general?: string;
}

const ProjectForm: React.FC<ProjectFormProps> = ({
  project,
  onSubmit,
  onCancel,
  onSuccess,
  onError,
  className = '',
  disabled = false,
  showCancelButton = true,
  submitButtonText,
  title,
}) => {
  const isEditing = !!project;
  
  // Form state
  const [formData, setFormData] = useState<CreateProjectData>({
    name: project?.name || '',
    description: project?.description || '',
    type: project?.type || 'web',
    status: project?.status || 'planning',
    startDate: project?.startDate,
    endDate: project?.endDate,
    tags: project?.tags || [],
    metadata: project?.metadata || {},
  });

  const [tagInput, setTagInput] = useState('');
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Custom hooks
  const {
    createProject,
    updateProject,
    createProjectLoading,
    updateProjectLoading,
    createProjectError,
    updateProjectError,
  } = useProjectActions();

  // Derived state
  const loading = createProjectLoading || updateProjectLoading;
  const error = createProjectError || updateProjectError;

  // Form options
  const typeOptions = [
    { value: 'web', label: 'Web Application', icon: '🌐' },
    { value: 'mobile', label: 'Mobile Application', icon: '📱' },
    { value: 'desktop', label: 'Desktop Application', icon: '💻' },
    { value: 'api', label: 'API Service', icon: '🔌' },
  ];

  const statusOptions = [
    { value: 'planning', label: 'Planning', icon: '📋', description: 'Project is being planned' },
    { value: 'active', label: 'Active', icon: '🚀', description: 'Project is in progress' },
    { value: 'completed', label: 'Completed', icon: '✅', description: 'Project is completed' },
    { value: 'cancelled', label: 'Cancelled', icon: '❌', description: 'Project is cancelled' },
  ];

  // Validation functions
  const validateField = (name: string, value: any): string | undefined => {
    switch (name) {
      case 'name':
        if (!value || value.trim().length === 0) {
          return 'Project name is required';
        }
        if (value.length > 100) {
          return 'Project name cannot exceed 100 characters';
        }
        break;
        
      case 'description':
        if (value && value.length > 1000) {
          return 'Description cannot exceed 1000 characters';
        }
        break;
        
      case 'startDate':
      case 'endDate':
        if (value && isNaN(new Date(value).getTime())) {
          return 'Please enter a valid date';
        }
        break;
        
      case 'dateRange':
        if (formData.startDate && formData.endDate) {
          const start = new Date(formData.startDate);
          const end = new Date(formData.endDate);
          if (start >= end) {
            return 'End date must be after start date';
          }
        }
        break;
        
      default:
        break;
    }
    return undefined;
  };

  const validateForm = (): boolean => {
    const newErrors: ValidationErrors = {};
    
    // Validate all fields
    Object.keys(formData).forEach(key => {
      const error = validateField(key, formData[key as keyof CreateProjectData]);
      if (error) {
        newErrors[key as keyof ValidationErrors] = error;
      }
    });
    
    // Validate date range
    const dateRangeError = validateField('dateRange', null);
    if (dateRangeError) {
      newErrors.endDate = dateRangeError;
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Event handlers
  const handleInputChange = (field: keyof CreateProjectData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));

    // Clear error for this field
    if (errors[field as keyof ValidationErrors]) {
      setErrors(prev => ({
        ...prev,
        [field]: undefined,
      }));
    }

    // Mark field as touched
    setTouched(prev => ({
      ...prev,
      [field]: true,
    }));
  };

  const handleTagAdd = () => {
    const tag = tagInput.trim();
    if (tag && !formData.tags?.includes(tag)) {
      if (formData.tags?.length >= 10) {
        setErrors(prev => ({
          ...prev,
          tags: 'Maximum 10 tags allowed',
        }));
        return;
      }
      
      if (!/^[a-zA-Z0-9-_]+$/.test(tag)) {
        setErrors(prev => ({
          ...prev,
          tags: 'Tags can only contain letters, numbers, hyphens, and underscores',
        }));
        return;
      }
      
      handleInputChange('tags', [...(formData.tags || []), tag]);
      setTagInput('');
      setErrors(prev => ({
        ...prev,
        tags: undefined,
      }));
    }
  };

  const handleTagRemove = (tagToRemove: string) => {
    handleInputChange('tags', formData.tags?.filter(tag => tag !== tagToRemove) || []);
  };

  const handleTagInputKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTagAdd();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      let result: Project;
      
      if (isEditing && project) {
        // Update existing project
        const updateData: UpdateProjectData = {};
        
        // Only include changed fields
        Object.keys(formData).forEach(key => {
          const formValue = formData[key as keyof CreateProjectData];
          const originalValue = project[key as keyof Project];
          
          if (JSON.stringify(formValue) !== JSON.stringify(originalValue)) {
            (updateData as any)[key] = formValue;
          }
        });
        
        if (Object.keys(updateData).length === 0) {
          onCancel?.();
          return;
        }
        
        result = await updateProject(project.id, updateData);
      } else {
        // Create new project
        result = await createProject(formData);
      }
      
      onSubmit?.(formData);
      onSuccess?.(result);
    } catch (err) {
      const error = err as Error;
      setErrors({ general: error.message });
      onError?.(error);
    }
  };

  const handleReset = () => {
    if (isEditing && project) {
      setFormData({
        name: project.name,
        description: project.description || '',
        type: project.type,
        status: project.status,
        startDate: project.startDate,
        endDate: project.endDate,
        tags: project.tags || [],
        metadata: project.metadata || {},
      });
    } else {
      setFormData({
        name: '',
        description: '',
        type: 'web',
        status: 'planning',
        tags: [],
        metadata: {},
      });
    }
    setErrors({});
    setTouched({});
    setTagInput('');
  };

  // Effects
  useEffect(() => {
    if (error) {
      setErrors({ general: error.message });
    }
  }, [error]);

  return (
    <div className={`project-form ${className}`}>
      <form onSubmit={handleSubmit} noValidate>
        {/* Form header */}
        <div className="form-header">
          <h2>{title || (isEditing ? 'Edit Project' : 'Create New Project')}</h2>
        </div>

        {/* General error */}
        {errors.general && (
          <div className="error-message general-error">
            {errors.general}
          </div>
        )}

        {/* Project name */}
        <div className="form-group">
          <label htmlFor="project-name" className="form-label required">
            Project Name
          </label>
          <input
            id="project-name"
            type="text"
            value={formData.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
            onBlur={() => setTouched(prev => ({ ...prev, name: true }))}
            className={`form-input ${errors.name ? 'error' : ''}`}
            placeholder="Enter project name"
            disabled={disabled || loading}
            maxLength={100}
            required
          />
          {errors.name && touched.name && (
            <div className="error-message">{errors.name}</div>
          )}
        </div>

        {/* Project description */}
        <div className="form-group">
          <label htmlFor="project-description" className="form-label">
            Description
          </label>
          <textarea
            id="project-description"
            value={formData.description}
            onChange={(e) => handleInputChange('description', e.target.value)}
            onBlur={() => setTouched(prev => ({ ...prev, description: true }))}
            className={`form-textarea ${errors.description ? 'error' : ''}`}
            placeholder="Enter project description (optional)"
            disabled={disabled || loading}
            maxLength={1000}
            rows={4}
          />
          {errors.description && touched.description && (
            <div className="error-message">{errors.description}</div>
          )}
          <div className="character-count">
            {formData.description?.length || 0}/1000
          </div>
        </div>

        {/* Project type and status */}
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="project-type" className="form-label required">
              Project Type
            </label>
            <select
              id="project-type"
              value={formData.type}
              onChange={(e) => handleInputChange('type', e.target.value)}
              className="form-select"
              disabled={disabled || loading}
              required
            >
              {typeOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.icon} {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="project-status" className="form-label required">
              Status
            </label>
            <select
              id="project-status"
              value={formData.status}
              onChange={(e) => handleInputChange('status', e.target.value)}
              className="form-select"
              disabled={disabled || loading}
              required
            >
              {statusOptions.map(option => (
                <option key={option.value} value={option.value} title={option.description}>
                  {option.icon} {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Project dates */}
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="project-start-date" className="form-label">
              Start Date
            </label>
            <input
              id="project-start-date"
              type="date"
              value={formData.startDate ? new Date(formData.startDate).toISOString().split('T')[0] : ''}
              onChange={(e) => handleInputChange('startDate', e.target.value ? new Date(e.target.value) : undefined)}
              onBlur={() => setTouched(prev => ({ ...prev, startDate: true }))}
              className={`form-input ${errors.startDate ? 'error' : ''}`}
              disabled={disabled || loading}
            />
            {errors.startDate && touched.startDate && (
              <div className="error-message">{errors.startDate}</div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="project-end-date" className="form-label">
              End Date
            </label>
            <input
              id="project-end-date"
              type="date"
              value={formData.endDate ? new Date(formData.endDate).toISOString().split('T')[0] : ''}
              onChange={(e) => handleInputChange('endDate', e.target.value ? new Date(e.target.value) : undefined)}
              onBlur={() => setTouched(prev => ({ ...prev, endDate: true }))}
              className={`form-input ${errors.endDate ? 'error' : ''}`}
              disabled={disabled || loading}
            />
            {errors.endDate && touched.endDate && (
              <div className="error-message">{errors.endDate}</div>
            )}
          </div>
        </div>

        {/* Project tags */}
        <div className="form-group">
          <label htmlFor="project-tags" className="form-label">
            Tags
          </label>
          <div className="tags-input-container">
            <div className="tags-list">
              {formData.tags?.map(tag => (
                <span key={tag} className="tag">
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleTagRemove(tag)}
                    className="tag-remove"
                    disabled={disabled || loading}
                    aria-label={`Remove tag ${tag}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="tag-input-row">
              <input
                id="project-tags"
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={handleTagInputKeyPress}
                className={`form-input tag-input ${errors.tags ? 'error' : ''}`}
                placeholder="Add a tag..."
                disabled={disabled || loading || (formData.tags?.length >= 10)}
                maxLength={50}
              />
              <button
                type="button"
                onClick={handleTagAdd}
                className="btn btn-secondary btn-sm"
                disabled={disabled || loading || !tagInput.trim() || (formData.tags?.length >= 10)}
              >
                Add
              </button>
            </div>
          </div>
          {errors.tags && (
            <div className="error-message">{errors.tags}</div>
          )}
          <div className="help-text">
            Press Enter or click Add to add a tag. Max 10 tags. Use letters, numbers, hyphens, and underscores only.
          </div>
        </div>

        {/* Form actions */}
        <div className="form-actions">
          {showCancelButton && (
            <button
              type="button"
              onClick={onCancel}
              className="btn btn-secondary"
              disabled={loading}
            >
              Cancel
            </button>
          )}
          
          <button
            type="button"
            onClick={handleReset}
            className="btn btn-outline"
            disabled={disabled || loading}
          >
            Reset
          </button>
          
          <button
            type="submit"
            className="btn btn-primary"
            disabled={disabled || loading}
          >
            {loading ? (
              <>
                <span className="loading-spinner"></span>
                {isEditing ? 'Updating...' : 'Creating...'}
              </>
            ) : (
              submitButtonText || (isEditing ? 'Update Project' : 'Create Project')
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProjectForm;