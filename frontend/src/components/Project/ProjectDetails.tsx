import React, { useState, useEffect } from 'react';
import { Project } from './ProjectList';
import { ProjectForm, ProjectFormData } from './ProjectForm';
import { useProjectApi } from '../../hooks/useProjectApi';
import { useProjectActions } from '../../hooks/useProjectActions';

export interface ProjectDetailsProps {
  projectId: string;
  onUpdate?: (project: Project) => void;
  onDelete?: () => void;
  onClose?: () => void;
  showEditForm?: boolean;
  readOnly?: boolean;
}

export const ProjectDetails: React.FC<ProjectDetailsProps> = ({
  projectId,
  onUpdate,
  onDelete,
  onClose,
  showEditForm: initialShowEditForm = false,
  readOnly = false
}) => {
  const [showEditForm, setShowEditForm] = useState(initialShowEditForm);
  const [activeTab, setActiveTab] = useState<'overview' | 'metadata' | 'history'>('overview');
  
  const {
    project,
    loading: fetchLoading,
    error: fetchError,
    fetchProject
  } = useProjectApi();

  const {
    handleUpdateProject,
    handleDeleteProject,
    isLoading: actionLoading
  } = useProjectActions();

  useEffect(() => {
    if (projectId) {
      fetchProject(projectId);
    }
  }, [projectId]);

  const handleEditSubmit = async (formData: ProjectFormData) => {
    try {
      const updatedProject = await handleUpdateProject(projectId, formData);
      setShowEditForm(false);
      
      if (updatedProject && onUpdate) {
        onUpdate(updatedProject);
      }
    } catch (error) {
      console.error('Error updating project:', error);
    }
  };

  const handleDeleteClick = async () => {
    if (window.confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      try {
        await handleDeleteProject(projectId);
        if (onDelete) {
          onDelete();
        }
      } catch (error) {
        console.error('Error deleting project:', error);
      }
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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

  const renderLoadingState = () => (
    <div className="project-details__loading">
      <div className="loading-spinner">Loading project details...</div>
    </div>
  );

  const renderErrorState = () => (
    <div className="project-details__error">
      <h3>Error Loading Project</h3>
      <p>{fetchError}</p>
      <div className="error-actions">
        <button onClick={() => fetchProject(projectId)} className="btn btn-primary">
          Retry
        </button>
        {onClose && (
          <button onClick={onClose} className="btn btn-secondary">
            Close
          </button>
        )}
      </div>
    </div>
  );

  const renderHeader = () => (
    <div className="project-details__header">
      <div className="header-content">
        <div className="title-section">
          <h1>{project!.name}</h1>
          <div className="badges">
            <span 
              className="badge badge-status"
              style={{ backgroundColor: getStatusColor(project!.status) }}
            >
              {project!.status}
            </span>
            <span 
              className="badge badge-priority"
              style={{ backgroundColor: getPriorityColor(project!.priority) }}
            >
              {project!.priority} priority
            </span>
          </div>
        </div>
        
        <div className="header-actions">
          {!readOnly && (
            <>
              <button
                onClick={() => setShowEditForm(true)}
                disabled={actionLoading}
                className="btn btn-outline"
              >
                Edit
              </button>
              <button
                onClick={handleDeleteClick}
                disabled={actionLoading}
                className="btn btn-outline btn-danger"
              >
                Delete
              </button>
            </>
          )}
          {onClose && (
            <button onClick={onClose} className="btn btn-secondary">
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const renderTabs = () => (
    <div className="project-details__tabs">
      <button
        onClick={() => setActiveTab('overview')}
        className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
      >
        Overview
      </button>
      <button
        onClick={() => setActiveTab('metadata')}
        className={`tab ${activeTab === 'metadata' ? 'active' : ''}`}
      >
        Metadata
      </button>
      <button
        onClick={() => setActiveTab('history')}
        className={`tab ${activeTab === 'history' ? 'active' : ''}`}
      >
        History
      </button>
    </div>
  );

  const renderOverviewTab = () => (
    <div className="tab-content overview-tab">
      {project!.description && (
        <div className="section">
          <h3>Description</h3>
          <p className="description">{project!.description}</p>
        </div>
      )}

      <div className="section">
        <h3>Details</h3>
        <div className="details-grid">
          <div className="detail-item">
            <label>Status</label>
            <span 
              className="value badge"
              style={{ backgroundColor: getStatusColor(project!.status) }}
            >
              {project!.status}
            </span>
          </div>
          <div className="detail-item">
            <label>Priority</label>
            <span 
              className="value badge"
              style={{ backgroundColor: getPriorityColor(project!.priority) }}
            >
              {project!.priority}
            </span>
          </div>
          <div className="detail-item">
            <label>Created</label>
            <span className="value">{formatDate(project!.createdAt)}</span>
          </div>
          <div className="detail-item">
            <label>Last Updated</label>
            <span className="value">{formatDate(project!.updatedAt)}</span>
          </div>
          <div className="detail-item">
            <label>Project ID</label>
            <span className="value code">{project!.id}</span>
          </div>
        </div>
      </div>

      {project!.tags && project!.tags.length > 0 && (
        <div className="section">
          <h3>Tags</h3>
          <div className="tags-list">
            {project!.tags.map((tag, index) => (
              <span key={index} className="tag">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderMetadataTab = () => (
    <div className="tab-content metadata-tab">
      <div className="section">
        <h3>Project Metadata</h3>
        {project!.metadata && Object.keys(project!.metadata).length > 0 ? (
          <div className="metadata-viewer">
            <pre className="metadata-json">
              {JSON.stringify(project!.metadata, null, 2)}
            </pre>
          </div>
        ) : (
          <p className="no-data">No metadata available for this project.</p>
        )}
      </div>

      <div className="section">
        <h3>System Information</h3>
        <div className="details-grid">
          <div className="detail-item">
            <label>User ID</label>
            <span className="value code">{project!.userId}</span>
          </div>
          <div className="detail-item">
            <label>Created At</label>
            <span className="value">{project!.createdAt}</span>
          </div>
          <div className="detail-item">
            <label>Updated At</label>
            <span className="value">{project!.updatedAt}</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderHistoryTab = () => (
    <div className="tab-content history-tab">
      <div className="section">
        <h3>Project History</h3>
        <div className="history-timeline">
          <div className="timeline-item">
            <div className="timeline-marker"></div>
            <div className="timeline-content">
              <div className="timeline-header">
                <span className="timeline-action">Project Updated</span>
                <span className="timeline-date">{formatDate(project!.updatedAt)}</span>
              </div>
              <div className="timeline-details">
                Last modification to project settings or content.
              </div>
            </div>
          </div>
          
          <div className="timeline-item">
            <div className="timeline-marker"></div>
            <div className="timeline-content">
              <div className="timeline-header">
                <span className="timeline-action">Project Created</span>
                <span className="timeline-date">{formatDate(project!.createdAt)}</span>
              </div>
              <div className="timeline-details">
                Project was initially created with status "{project!.status}" and priority "{project!.priority}".
              </div>
            </div>
          </div>
        </div>
        
        <p className="history-note">
          <em>Note: Detailed activity logging is not yet implemented. This shows basic timeline information.</em>
        </p>
      </div>
    </div>
  );

  const renderContent = () => {
    if (showEditForm) {
      return (
        <div className="project-details__edit">
          <ProjectForm
            project={project!}
            onSubmit={handleEditSubmit}
            onCancel={() => setShowEditForm(false)}
            loading={actionLoading}
            mode="edit"
          />
        </div>
      );
    }

    return (
      <div className="project-details__view">
        {renderHeader()}
        {renderTabs()}
        
        <div className="project-details__content">
          {activeTab === 'overview' && renderOverviewTab()}
          {activeTab === 'metadata' && renderMetadataTab()}
          {activeTab === 'history' && renderHistoryTab()}
        </div>
      </div>
    );
  };

  if (fetchLoading && !project) {
    return renderLoadingState();
  }

  if (fetchError && !project) {
    return renderErrorState();
  }

  if (!project) {
    return (
      <div className="project-details__not-found">
        <h3>Project Not Found</h3>
        <p>The requested project could not be found.</p>
        {onClose && (
          <button onClick={onClose} className="btn btn-primary">
            Close
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="project-details">
      {renderContent()}
      
      {actionLoading && (
        <div className="project-details__loading-overlay">
          <div className="loading-spinner">Processing...</div>
        </div>
      )}
    </div>
  );
};