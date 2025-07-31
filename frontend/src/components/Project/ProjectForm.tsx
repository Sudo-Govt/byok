import React, { useState, useEffect } from 'react';
import { Project } from './ProjectList';

export interface ProjectFormData {
  name: string;
  description: string;
  status: 'draft' | 'active' | 'completed' | 'archived' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  tags: string[];
  metadata?: Record<string, any>;
}

export interface ProjectFormProps {
  project?: Project;
  onSubmit: (data: ProjectFormData) => void;
  onCancel?: () => void;
  loading?: boolean;
  mode?: 'create' | 'edit';
}

export const ProjectForm: React.FC<ProjectFormProps> = ({
  project,
  onSubmit,
  onCancel,
  loading = false,
  mode = project ? 'edit' : 'create'
}) => {
  const [formData, setFormData] = useState<ProjectFormData>({
    name: '',
    description: '',
    status: 'draft',
    priority: 'medium',
    tags: [],
    metadata: {}
  });

  const [tagInput, setTagInput] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Initialize form data from project prop
  useEffect(() => {
    if (project) {
      setFormData({
        name: project.name,
        description: project.description || '',
        status: project.status,
        priority: project.priority,
        tags: project.tags || [],
        metadata: project.metadata || {}
      });
    }
  }, [project]);

  const validateField = (name: string, value: any): string => {
    switch (name) {
      case 'name':
        if (!value || value.trim().length === 0) {
          return 'Project name is required';
        }
        if (value.trim().length < 3) {
          return 'Project name must be at least 3 characters long';
        }
        if (value.length > 255) {
          return 'Project name cannot exceed 255 characters';
        }
        return '';

      case 'description':
        if (value && value.length > 2000) {
          return 'Description cannot exceed 2000 characters';
        }
        return '';

      case 'tags':
        if (value.length > 20) {
          return 'Maximum 20 tags allowed';
        }
        for (const tag of value) {
          if (tag.length > 50) {
            return 'Each tag must be 50 characters or less';
          }
          if (!/^[a-zA-Z0-9\-_\s]+$/.test(tag)) {
            return 'Tags can only contain letters, numbers, hyphens, underscores, and spaces';
          }
        }
        return '';

      default:
        return '';
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    // Validate all fields
    Object.keys(formData).forEach(key => {
      const error = validateField(key, formData[key as keyof ProjectFormData]);
      if (error) {
        newErrors[key] = error;
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFieldChange = (name: string, value: any) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleFieldBlur = (name: string) => {
    setTouched(prev => ({ ...prev, [name]: true }));
    
    const error = validateField(name, formData[name as keyof ProjectFormData]);
    if (error) {
      setErrors(prev => ({ ...prev, [name]: error }));
    }
  };

  const handleAddTag = () => {
    const trimmedTag = tagInput.trim();
    if (trimmedTag && !formData.tags.includes(trimmedTag)) {
      const newTags = [...formData.tags, trimmedTag];
      handleFieldChange('tags', newTags);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const newTags = formData.tags.filter(tag => tag !== tagToRemove);
    handleFieldChange('tags', newTags);
  };

  const handleTagInputKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    } else if (e.key === 'Backspace' && tagInput === '' && formData.tags.length > 0) {
      // Remove last tag if input is empty and backspace is pressed
      handleRemoveTag(formData.tags[formData.tags.length - 1]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Mark all fields as touched
    const allTouched = Object.keys(formData).reduce((acc, key) => {
      acc[key] = true;
      return acc;
    }, {} as Record<string, boolean>);
    setTouched(allTouched);

    if (validateForm()) {
      onSubmit(formData);
    }
  };

  const renderFieldError = (fieldName: string) => {
    if (!touched[fieldName] || !errors[fieldName]) return null;
    
    return (
      <div className="field-error">
        {errors[fieldName]}
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="project-form">
      <div className="project-form__header">
        <h2>{mode === 'create' ? 'Create New Project' : 'Edit Project'}</h2>
      </div>

      <div className="project-form__content">
        {/* Project Name */}
        <div className="form-group">
          <label htmlFor="project-name" className="form-label required">
            Project Name
          </label>
          <input
            id="project-name"
            type="text"
            value={formData.name}
            onChange={(e) => handleFieldChange('name', e.target.value)}
            onBlur={() => handleFieldBlur('name')}
            className={`form-input ${errors.name ? 'error' : ''}`}
            placeholder="Enter project name..."
            disabled={loading}
            maxLength={255}
          />
          {renderFieldError('name')}
        </div>

        {/* Project Description */}
        <div className="form-group">
          <label htmlFor="project-description" className="form-label">
            Description
          </label>
          <textarea
            id="project-description"
            value={formData.description}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            onBlur={() => handleFieldBlur('description')}
            className={`form-textarea ${errors.description ? 'error' : ''}`}
            placeholder="Enter project description..."
            rows={4}
            disabled={loading}
            maxLength={2000}
          />
          <div className="character-count">
            {formData.description.length}/2000 characters
          </div>
          {renderFieldError('description')}
        </div>

        {/* Status and Priority Row */}
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="project-status" className="form-label">
              Status
            </label>
            <select
              id="project-status"
              value={formData.status}
              onChange={(e) => handleFieldChange('status', e.target.value)}
              className="form-select"
              disabled={loading}
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="project-priority" className="form-label">
              Priority
            </label>
            <select
              id="project-priority"
              value={formData.priority}
              onChange={(e) => handleFieldChange('priority', e.target.value)}
              className="form-select"
              disabled={loading}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>

        {/* Tags */}
        <div className="form-group">
          <label htmlFor="project-tags" className="form-label">
            Tags
          </label>
          <div className="tags-input-container">
            <div className="tags-display">
              {formData.tags.map((tag, index) => (
                <span key={index} className="tag">
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="tag-remove"
                    disabled={loading}
                    aria-label={`Remove tag ${tag}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                id="project-tags"
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagInputKeyPress}
                className="tag-input"
                placeholder={formData.tags.length === 0 ? "Add tags..." : ""}
                disabled={loading || formData.tags.length >= 20}
                maxLength={50}
              />
            </div>
            {tagInput.trim() && (
              <button
                type="button"
                onClick={handleAddTag}
                className="add-tag-btn"
                disabled={loading || formData.tags.length >= 20}
              >
                Add Tag
              </button>
            )}
          </div>
          <div className="form-help">
            Press Enter to add a tag. Maximum 20 tags allowed.
          </div>
          {renderFieldError('tags')}
        </div>

        {/* Status Transition Warning */}
        {mode === 'edit' && project && project.status !== formData.status && (
          <div className="status-warning">
            <strong>Status Change:</strong> Changing from "{project.status}" to "{formData.status}".
            {formData.status === 'cancelled' && (
              <span className="warning-text"> This action cannot be undone.</span>
            )}
          </div>
        )}
      </div>

      {/* Form Actions */}
      <div className="project-form__actions">
        <button
          type="submit"
          disabled={loading || Object.keys(errors).some(key => errors[key])}
          className="btn btn-primary"
        >
          {loading ? (
            mode === 'create' ? 'Creating...' : 'Saving...'
          ) : (
            mode === 'create' ? 'Create Project' : 'Save Changes'
          )}
        </button>
        
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="btn btn-secondary"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Form Summary */}
      <div className="project-form__summary">
        {Object.keys(errors).length > 0 && (
          <div className="form-errors">
            <strong>Please fix the following errors:</strong>
            <ul>
              {Object.entries(errors).map(([field, error]) => (
                <li key={field}>{error}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </form>
  );
};