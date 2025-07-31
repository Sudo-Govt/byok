import React, { useState } from 'react';
import { Project } from './ProjectList';

export interface ProjectCardProps {
  project: Project;
  onUpdate?: (data: Partial<Project>) => void;
  onDelete?: () => void;
  onSelect?: () => void;
  loading?: boolean;
  showActions?: boolean;
  compact?: boolean;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  onUpdate,
  onDelete,
  onSelect,
  loading = false,
  showActions = true,
  compact = false
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    name: project.name,
    description: project.description || '',
    status: project.status,
    priority: project.priority
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleEdit = () => {
    setIsEditing(true);
    setEditData({
      name: project.name,
      description: project.description || '',
      status: project.status,
      priority: project.priority
    });
  };

  const handleSaveEdit = () => {
    if (onUpdate) {
      onUpdate(editData);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditData({
      name: project.name,
      description: project.description || '',
      status: project.status,
      priority: project.priority
    });
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete();
    }
    setShowDeleteConfirm(false);
  };

  const getStatusColor = (status: string) => {
    const colors = {
      draft: '#6b7280',
      active: '#3b82f6',
      completed: '#10b981',
      archived: '#f59e0b',
      cancelled: '#ef4444'
    };
    return colors[status as keyof typeof colors] || '#6b7280';
  };

  const getPriorityColor = (priority: string) => {
    const colors = {
      low: '#10b981',
      medium: '#f59e0b',
      high: '#f97316',
      critical: '#ef4444'
    };
    return colors[priority as keyof typeof colors] || '#6b7280';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const renderEditForm = () => (
    <div className="project-card__edit-form">
      <div className="form-group">
        <label htmlFor={`name-${project.id}`}>Name</label>
        <input
          id={`name-${project.id}`}
          type="text"
          value={editData.name}
          onChange={(e) => setEditData(prev => ({ ...prev, name: e.target.value }))}
          className="form-input"
          disabled={loading}
        />
      </div>

      <div className="form-group">
        <label htmlFor={`description-${project.id}`}>Description</label>
        <textarea
          id={`description-${project.id}`}
          value={editData.description}
          onChange={(e) => setEditData(prev => ({ ...prev, description: e.target.value }))}
          className="form-textarea"
          rows={3}
          disabled={loading}
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor={`status-${project.id}`}>Status</label>
          <select
            id={`status-${project.id}`}
            value={editData.status}
            onChange={(e) => setEditData(prev => ({ ...prev, status: e.target.value as Project['status'] }))}
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
          <label htmlFor={`priority-${project.id}`}>Priority</label>
          <select
            id={`priority-${project.id}`}
            value={editData.priority}
            onChange={(e) => setEditData(prev => ({ ...prev, priority: e.target.value as Project['priority'] }))}
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

      <div className="form-actions">
        <button
          onClick={handleSaveEdit}
          disabled={loading || !editData.name.trim()}
          className="btn btn-primary"
        >
          {loading ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={handleCancelEdit}
          disabled={loading}
          className="btn btn-secondary"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  const renderDeleteConfirm = () => (
    <div className="project-card__delete-confirm">
      <p>Are you sure you want to delete this project? This action cannot be undone.</p>
      <div className="form-actions">
        <button
          onClick={handleDelete}
          disabled={loading}
          className="btn btn-danger"
        >
          {loading ? 'Deleting...' : 'Delete'}
        </button>
        <button
          onClick={() => setShowDeleteConfirm(false)}
          disabled={loading}
          className="btn btn-secondary"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  const renderTags = () => {
    if (!project.tags || project.tags.length === 0) return null;

    return (
      <div className="project-card__tags">
        {project.tags.slice(0, compact ? 2 : 5).map((tag, index) => (
          <span key={index} className="tag">
            {tag}
          </span>
        ))}
        {project.tags.length > (compact ? 2 : 5) && (
          <span className="tag tag-more">
            +{project.tags.length - (compact ? 2 : 5)} more
          </span>
        )}
      </div>
    );
  };

  const renderProjectInfo = () => (
    <div className="project-card__content">
      <div className="project-card__header">
        <h3 
          className="project-card__title"
          onClick={onSelect}
          style={{ cursor: onSelect ? 'pointer' : 'default' }}
        >
          {project.name}
        </h3>
        <div className="project-card__badges">
          <span 
            className="badge badge-status"
            style={{ backgroundColor: getStatusColor(project.status) }}
          >
            {project.status}
          </span>
          <span 
            className="badge badge-priority"
            style={{ backgroundColor: getPriorityColor(project.priority) }}
          >
            {project.priority}
          </span>
        </div>
      </div>

      {project.description && !compact && (
        <p className="project-card__description">
          {project.description.length > 150
            ? `${project.description.substring(0, 150)}...`
            : project.description
          }
        </p>
      )}

      {renderTags()}

      <div className="project-card__metadata">
        <div className="metadata-item">
          <span className="metadata-label">Created:</span>
          <span className="metadata-value">{formatDate(project.createdAt)}</span>
        </div>
        {project.updatedAt !== project.createdAt && (
          <div className="metadata-item">
            <span className="metadata-label">Updated:</span>
            <span className="metadata-value">{formatDate(project.updatedAt)}</span>
          </div>
        )}
      </div>
    </div>
  );

  const renderActions = () => {
    if (!showActions) return null;

    return (
      <div className="project-card__actions">
        <button
          onClick={handleEdit}
          disabled={loading || isEditing}
          className="btn btn-sm btn-outline"
          title="Edit project"
        >
          Edit
        </button>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          disabled={loading || isEditing}
          className="btn btn-sm btn-outline btn-danger"
          title="Delete project"
        >
          Delete
        </button>
        {onSelect && (
          <button
            onClick={onSelect}
            disabled={loading}
            className="btn btn-sm btn-primary"
            title="View project details"
          >
            View
          </button>
        )}
      </div>
    );
  };

  return (
    <div className={`project-card ${compact ? 'compact' : ''} ${isEditing ? 'editing' : ''}`}>
      {isEditing ? renderEditForm() : renderProjectInfo()}
      
      {showDeleteConfirm && renderDeleteConfirm()}
      
      {!isEditing && !showDeleteConfirm && renderActions()}
      
      {loading && (
        <div className="project-card__loading-overlay">
          <div className="loading-spinner">Loading...</div>
        </div>
      )}
    </div>
  );
};