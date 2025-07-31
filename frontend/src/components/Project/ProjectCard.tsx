import React, { useState } from 'react';

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
interface ProjectCardProps {
  project: Project;
  selected?: boolean;
  onSelect?: () => void;
  onAction?: (action: 'view' | 'edit' | 'delete' | 'duplicate') => void;
  compact?: boolean;
  loading?: boolean;
  showActions?: boolean;
  className?: string;
}

const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  selected = false,
  onSelect,
  onAction,
  compact = false,
  loading = false,
  showActions = true,
  className = '',
}) => {
  const [showMenu, setShowMenu] = useState(false);

  // Type and status configurations
  const typeConfig = {
    web: { icon: '🌐', label: 'Web', color: 'blue' },
    mobile: { icon: '📱', label: 'Mobile', color: 'green' },
    desktop: { icon: '💻', label: 'Desktop', color: 'purple' },
    api: { icon: '🔌', label: 'API', color: 'orange' },
  };

  const statusConfig = {
    planning: { icon: '📋', label: 'Planning', color: 'gray' },
    active: { icon: '🚀', label: 'Active', color: 'blue' },
    completed: { icon: '✅', label: 'Completed', color: 'green' },
    cancelled: { icon: '❌', label: 'Cancelled', color: 'red' },
  };

  // Helper functions
  const formatDate = (date: Date | undefined) => {
    if (!date) return null;
    return new Date(date).toLocaleDateString();
  };

  const getProgressInfo = () => {
    if (!project.startDate || !project.endDate) {
      return null;
    }

    const start = new Date(project.startDate).getTime();
    const end = new Date(project.endDate).getTime();
    const now = Date.now();

    if (now < start) {
      return { progress: 0, status: 'not-started' };
    }

    if (now > end) {
      return { progress: 100, status: 'overdue' };
    }

    const progress = ((now - start) / (end - start)) * 100;
    return { progress: Math.round(progress), status: 'in-progress' };
  };

  const getDaysUntilDeadline = () => {
    if (!project.endDate) return null;
    
    const now = new Date();
    const deadline = new Date(project.endDate);
    const diffTime = deadline.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  };

  // Event handlers
  const handleCardClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).closest('.card-content')) {
      onAction?.('view');
    }
  };

  const handleSelectClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.();
  };

  const handleMenuToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(!showMenu);
  };

  const handleActionClick = (action: 'view' | 'edit' | 'delete' | 'duplicate') => {
    setShowMenu(false);
    onAction?.(action);
  };

  // Calculate derived values
  const progressInfo = getProgressInfo();
  const daysUntilDeadline = getDaysUntilDeadline();
  const typeInfo = typeConfig[project.type];
  const statusInfo = statusConfig[project.status];

  return (
    <div
      className={`
        project-card 
        ${className} 
        ${selected ? 'selected' : ''} 
        ${compact ? 'compact' : ''} 
        ${loading ? 'loading' : ''}
        status-${project.status}
        type-${project.type}
      `}
      onClick={handleCardClick}
    >
      {/* Loading overlay */}
      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
        </div>
      )}

      {/* Selection checkbox */}
      {onSelect && (
        <div className="selection-checkbox">
          <input
            type="checkbox"
            checked={selected}
            onChange={handleSelectClick}
            onClick={handleSelectClick}
          />
        </div>
      )}

      {/* Card header */}
      <div className="card-header">
        <div className="project-info">
          <h3 className="project-name" title={project.name}>
            {project.name}
          </h3>
          
          {!compact && (
            <div className="project-meta">
              <span className={`type-badge type-${project.type}`}>
                {typeInfo.icon} {typeInfo.label}
              </span>
              <span className={`status-badge status-${project.status}`}>
                {statusInfo.icon} {statusInfo.label}
              </span>
            </div>
          )}
        </div>

        {/* Actions menu */}
        {showActions && (
          <div className="actions-menu">
            <button
              className="menu-trigger"
              onClick={handleMenuToggle}
              aria-label="Project actions"
            >
              ⋮
            </button>
            
            {showMenu && (
              <div className="menu-dropdown">
                <button onClick={() => handleActionClick('view')}>
                  👁️ View
                </button>
                <button onClick={() => handleActionClick('edit')}>
                  ✏️ Edit
                </button>
                <button onClick={() => handleActionClick('duplicate')}>
                  📋 Duplicate
                </button>
                <hr />
                <button 
                  className="danger"
                  onClick={() => handleActionClick('delete')}
                >
                  🗑️ Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Card content */}
      <div className="card-content">
        {/* Description */}
        {!compact && project.description && (
          <p className="project-description" title={project.description}>
            {project.description.length > 100 
              ? `${project.description.substring(0, 100)}...` 
              : project.description
            }
          </p>
        )}

        {/* Tags */}
        {project.tags.length > 0 && (
          <div className="project-tags">
            {project.tags.slice(0, compact ? 2 : 5).map(tag => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
            {project.tags.length > (compact ? 2 : 5) && (
              <span className="tag tag-more">
                +{project.tags.length - (compact ? 2 : 5)} more
              </span>
            )}
          </div>
        )}

        {/* Progress bar */}
        {!compact && progressInfo && (
          <div className="progress-section">
            <div className="progress-label">
              Progress: {progressInfo.progress}%
            </div>
            <div className="progress-bar">
              <div 
                className={`progress-fill status-${progressInfo.status}`}
                style={{ width: `${progressInfo.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Dates */}
        {!compact && (project.startDate || project.endDate) && (
          <div className="project-dates">
            {project.startDate && (
              <div className="date-item">
                <span className="date-label">Start:</span>
                <span className="date-value">{formatDate(project.startDate)}</span>
              </div>
            )}
            {project.endDate && (
              <div className="date-item">
                <span className="date-label">End:</span>
                <span className="date-value">{formatDate(project.endDate)}</span>
              </div>
            )}
          </div>
        )}

        {/* Deadline warning */}
        {!compact && daysUntilDeadline !== null && project.status === 'active' && (
          <div className={`deadline-warning ${daysUntilDeadline <= 7 ? 'urgent' : daysUntilDeadline <= 14 ? 'warning' : ''}`}>
            {daysUntilDeadline > 0 ? (
              <span>⏰ {daysUntilDeadline} day{daysUntilDeadline !== 1 ? 's' : ''} remaining</span>
            ) : daysUntilDeadline === 0 ? (
              <span>🔥 Due today</span>
            ) : (
              <span>⚠️ {Math.abs(daysUntilDeadline)} day{Math.abs(daysUntilDeadline) !== 1 ? 's' : ''} overdue</span>
            )}
          </div>
        )}
      </div>

      {/* Card footer */}
      <div className="card-footer">
        {compact && (
          <div className="compact-meta">
            <span className={`type-badge type-${project.type}`}>
              {typeInfo.icon}
            </span>
            <span className={`status-badge status-${project.status}`}>
              {statusInfo.icon}
            </span>
          </div>
        )}

        <div className="timestamps">
          <span className="created-date" title={`Created: ${new Date(project.createdAt).toLocaleString()}`}>
            Created {formatDate(project.createdAt)}
          </span>
          {project.updatedAt !== project.createdAt && (
            <span className="updated-date" title={`Updated: ${new Date(project.updatedAt).toLocaleString()}`}>
              Updated {formatDate(project.updatedAt)}
            </span>
          )}
        </div>
      </div>

      {/* Hover overlay for compact view */}
      {compact && (
        <div className="hover-overlay">
          <div className="hover-content">
            <h4>{project.name}</h4>
            {project.description && (
              <p>{project.description}</p>
            )}
            <div className="hover-meta">
              <span className={`type-badge type-${project.type}`}>
                {typeInfo.icon} {typeInfo.label}
              </span>
              <span className={`status-badge status-${project.status}`}>
                {statusInfo.icon} {statusInfo.label}
              </span>
            </div>
            {project.tags.length > 0 && (
              <div className="hover-tags">
                {project.tags.map(tag => (
                  <span key={tag} className="tag">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectCard;