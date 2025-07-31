import React, { useState, useEffect } from 'react';
import { useProjectApi } from '../../hooks/useProjectApi';
import { useProjectActions } from '../../hooks/useProjectActions';

// Project interface
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

// Component props
interface ProjectDetailsProps {
  projectId: string;
  onEdit?: (project: Project) => void;
  onDelete?: (project: Project) => void;
  onClose?: () => void;
  className?: string;
  showActions?: boolean;
  readOnly?: boolean;
}

const ProjectDetails: React.FC<ProjectDetailsProps> = ({
  projectId,
  onEdit,
  onDelete,
  onClose,
  className = '',
  showActions = true,
  readOnly = false,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'metadata'>('overview');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Custom hooks
  const { project, loading, error, fetchProject } = useProjectApi();
  const { deleteProject, deleteProjectLoading } = useProjectActions();

  // Load project data
  useEffect(() => {
    if (projectId) {
      fetchProject(projectId);
    }
  }, [projectId, fetchProject]);

  // Configuration objects
  const typeConfig = {
    web: { icon: '🌐', label: 'Web Application', color: '#3B82F6' },
    mobile: { icon: '📱', label: 'Mobile Application', color: '#10B981' },
    desktop: { icon: '💻', label: 'Desktop Application', color: '#8B5CF6' },
    api: { icon: '🔌', label: 'API Service', color: '#F59E0B' },
  };

  const statusConfig = {
    planning: { icon: '📋', label: 'Planning', color: '#6B7280', description: 'Project is being planned' },
    active: { icon: '🚀', label: 'Active', color: '#3B82F6', description: 'Project is in progress' },
    completed: { icon: '✅', label: 'Completed', color: '#10B981', description: 'Project is completed' },
    cancelled: { icon: '❌', label: 'Cancelled', color: '#EF4444', description: 'Project is cancelled' },
  };

  // Helper functions
  const formatDate = (date: Date | undefined) => {
    if (!date) return 'Not set';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatDateTime = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getProjectDuration = () => {
    if (!project?.startDate || !project?.endDate) {
      return null;
    }

    const start = new Date(project.startDate);
    const end = new Date(project.endDate);
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 30) {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
    } else if (diffDays < 365) {
      const months = Math.round(diffDays / 30);
      return `${months} month${months !== 1 ? 's' : ''}`;
    } else {
      const years = Math.round(diffDays / 365);
      return `${years} year${years !== 1 ? 's' : ''}`;
    }
  };

  const getProgressInfo = () => {
    if (!project?.startDate || !project?.endDate) {
      return null;
    }

    const start = new Date(project.startDate).getTime();
    const end = new Date(project.endDate).getTime();
    const now = Date.now();

    if (now < start) {
      return { progress: 0, status: 'not-started', label: 'Not started' };
    }

    if (now > end) {
      return { progress: 100, status: 'overdue', label: 'Overdue' };
    }

    const progress = ((now - start) / (end - start)) * 100;
    return { 
      progress: Math.round(progress), 
      status: 'in-progress', 
      label: `${Math.round(progress)}% complete` 
    };
  };

  const getDaysRemaining = () => {
    if (!project?.endDate) return null;
    
    const now = new Date();
    const end = new Date(project.endDate);
    const diffTime = end.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  };

  // Event handlers
  const handleEdit = () => {
    if (project) {
      onEdit?.(project);
    }
  };

  const handleDelete = async () => {
    if (!project) return;

    try {
      await deleteProject(project.id);
      onDelete?.(project);
      onClose?.();
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  const handleDeleteConfirm = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
  };

  // Loading state
  if (loading && !project) {
    return (
      <div className={`project-details loading ${className}`}>
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading project details...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`project-details error ${className}`}>
        <div className="error-container">
          <h3>Error Loading Project</h3>
          <p>{error.message}</p>
          <button className="btn btn-primary" onClick={() => fetchProject(projectId)}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  // No project found
  if (!project) {
    return (
      <div className={`project-details not-found ${className}`}>
        <div className="not-found-container">
          <h3>Project Not Found</h3>
          <p>The requested project could not be found.</p>
        </div>
      </div>
    );
  }

  const typeInfo = typeConfig[project.type];
  const statusInfo = statusConfig[project.status];
  const progressInfo = getProgressInfo();
  const daysRemaining = getDaysRemaining();
  const duration = getProjectDuration();

  return (
    <div className={`project-details ${className}`}>
      {/* Header */}
      <div className="project-header">
        <div className="header-content">
          <div className="project-title">
            <h1>{project.name}</h1>
            <div className="project-badges">
              <span 
                className={`type-badge type-${project.type}`}
                style={{ backgroundColor: typeInfo.color }}
              >
                {typeInfo.icon} {typeInfo.label}
              </span>
              <span 
                className={`status-badge status-${project.status}`}
                style={{ backgroundColor: statusInfo.color }}
              >
                {statusInfo.icon} {statusInfo.label}
              </span>
            </div>
          </div>

          {/* Actions */}
          {showActions && !readOnly && (
            <div className="header-actions">
              <button
                className="btn btn-secondary"
                onClick={handleEdit}
                disabled={loading}
              >
                ✏️ Edit
              </button>
              <button
                className="btn btn-danger"
                onClick={handleDeleteConfirm}
                disabled={deleteProjectLoading}
              >
                {deleteProjectLoading ? 'Deleting...' : '🗑️ Delete'}
              </button>
            </div>
          )}

          {/* Close button */}
          {onClose && (
            <button className="close-button" onClick={onClose} aria-label="Close">
              ×
            </button>
          )}
        </div>

        {/* Progress bar */}
        {progressInfo && (
          <div className="progress-section">
            <div className="progress-info">
              <span className="progress-label">{progressInfo.label}</span>
              {daysRemaining !== null && project.status === 'active' && (
                <span className={`days-remaining ${daysRemaining <= 7 ? 'urgent' : daysRemaining <= 14 ? 'warning' : ''}`}>
                  {daysRemaining > 0 ? (
                    `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining`
                  ) : daysRemaining === 0 ? (
                    'Due today'
                  ) : (
                    `${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) !== 1 ? 's' : ''} overdue`
                  )}
                </span>
              )}
            </div>
            <div className="progress-bar">
              <div 
                className={`progress-fill status-${progressInfo.status}`}
                style={{ width: `${progressInfo.progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📊 Overview
        </button>
        <button
          className={`tab ${activeTab === 'timeline' ? 'active' : ''}`}
          onClick={() => setActiveTab('timeline')}
        >
          📅 Timeline
        </button>
        <button
          className={`tab ${activeTab === 'metadata' ? 'active' : ''}`}
          onClick={() => setActiveTab('metadata')}
        >
          🔧 Metadata
        </button>
      </div>

      {/* Tab content */}
      <div className="tab-content">
        {/* Overview tab */}
        {activeTab === 'overview' && (
          <div className="overview-tab">
            {/* Description */}
            <div className="detail-section">
              <h3>Description</h3>
              {project.description ? (
                <p className="description">{project.description}</p>
              ) : (
                <p className="no-description">No description provided</p>
              )}
            </div>

            {/* Tags */}
            {project.tags.length > 0 && (
              <div className="detail-section">
                <h3>Tags</h3>
                <div className="tags-container">
                  {project.tags.map(tag => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Key information */}
            <div className="detail-section">
              <h3>Project Information</h3>
              <div className="info-grid">
                <div className="info-item">
                  <label>Type</label>
                  <span>{typeInfo.icon} {typeInfo.label}</span>
                </div>
                <div className="info-item">
                  <label>Status</label>
                  <span>{statusInfo.icon} {statusInfo.label}</span>
                </div>
                <div className="info-item">
                  <label>Start Date</label>
                  <span>{formatDate(project.startDate)}</span>
                </div>
                <div className="info-item">
                  <label>End Date</label>
                  <span>{formatDate(project.endDate)}</span>
                </div>
                {duration && (
                  <div className="info-item">
                    <label>Duration</label>
                    <span>{duration}</span>
                  </div>
                )}
                <div className="info-item">
                  <label>Created</label>
                  <span>{formatDateTime(project.createdAt)}</span>
                </div>
                <div className="info-item">
                  <label>Last Updated</label>
                  <span>{formatDateTime(project.updatedAt)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Timeline tab */}
        {activeTab === 'timeline' && (
          <div className="timeline-tab">
            <div className="timeline">
              <div className="timeline-item">
                <div className="timeline-marker created"></div>
                <div className="timeline-content">
                  <h4>Project Created</h4>
                  <p>{formatDateTime(project.createdAt)}</p>
                  <span className="timeline-badge">Initial setup</span>
                </div>
              </div>

              {project.startDate && (
                <div className="timeline-item">
                  <div className="timeline-marker start"></div>
                  <div className="timeline-content">
                    <h4>Start Date</h4>
                    <p>{formatDate(project.startDate)}</p>
                    <span className="timeline-badge">Planned start</span>
                  </div>
                </div>
              )}

              {project.updatedAt !== project.createdAt && (
                <div className="timeline-item">
                  <div className="timeline-marker updated"></div>
                  <div className="timeline-content">
                    <h4>Last Updated</h4>
                    <p>{formatDateTime(project.updatedAt)}</p>
                    <span className="timeline-badge">Recent changes</span>
                  </div>
                </div>
              )}

              {project.endDate && (
                <div className="timeline-item">
                  <div className="timeline-marker end"></div>
                  <div className="timeline-content">
                    <h4>End Date</h4>
                    <p>{formatDate(project.endDate)}</p>
                    <span className="timeline-badge">
                      {project.status === 'completed' ? 'Completed' : 'Planned end'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Metadata tab */}
        {activeTab === 'metadata' && (
          <div className="metadata-tab">
            <div className="detail-section">
              <h3>Technical Details</h3>
              <div className="metadata-grid">
                <div className="metadata-item">
                  <label>Project ID</label>
                  <span className="monospace">{project.id}</span>
                </div>
                <div className="metadata-item">
                  <label>Owner ID</label>
                  <span className="monospace">{project.ownerId}</span>
                </div>
              </div>
            </div>

            {Object.keys(project.metadata).length > 0 ? (
              <div className="detail-section">
                <h3>Custom Metadata</h3>
                <div className="metadata-json">
                  <pre>{JSON.stringify(project.metadata, null, 2)}</pre>
                </div>
              </div>
            ) : (
              <div className="detail-section">
                <h3>Custom Metadata</h3>
                <p className="no-metadata">No custom metadata available</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay">
          <div className="modal delete-modal">
            <h3>Delete Project</h3>
            <p>
              Are you sure you want to delete "<strong>{project.name}</strong>"? 
              This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={handleDeleteCancel}
                disabled={deleteProjectLoading}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleDelete}
                disabled={deleteProjectLoading}
              >
                {deleteProjectLoading ? 'Deleting...' : 'Delete Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectDetails;