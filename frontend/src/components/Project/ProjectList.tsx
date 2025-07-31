import React, { useState, useEffect } from 'react';
import { ProjectCard } from './ProjectCard';
import { useProjectApi } from '../../hooks/useProjectApi';
import { useProjectActions } from '../../hooks/useProjectActions';

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'active' | 'completed' | 'archived' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  userId: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface ProjectListFilters {
  status?: string;
  priority?: string;
  search?: string;
  tags?: string[];
}

export interface ProjectListProps {
  userId?: string;
  initialFilters?: ProjectListFilters;
  showFilters?: boolean;
  showCreateButton?: boolean;
  itemsPerPage?: number;
  onProjectSelect?: (project: Project) => void;
}

export const ProjectList: React.FC<ProjectListProps> = ({
  userId,
  initialFilters = {},
  showFilters = true,
  showCreateButton = true,
  itemsPerPage = 10,
  onProjectSelect
}) => {
  const [filters, setFilters] = useState<ProjectListFilters>(initialFilters);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState(filters.search || '');

  const {
    projects,
    loading,
    error,
    pagination,
    fetchProjects,
    searchProjects
  } = useProjectApi();

  const {
    handleCreateProject,
    handleUpdateProject,
    handleDeleteProject,
    isLoading: actionLoading
  } = useProjectActions();

  // Load projects on component mount and when filters change
  useEffect(() => {
    const loadProjects = async () => {
      const offset = (currentPage - 1) * itemsPerPage;
      
      if (filters.search) {
        await searchProjects(filters.search, { offset, limit: itemsPerPage }, userId);
      } else {
        await fetchProjects({
          ...filters,
          userId: userId || filters.userId
        }, {
          field: 'createdAt',
          direction: 'desc'
        }, {
          offset,
          limit: itemsPerPage
        });
      }
    };

    loadProjects();
  }, [filters, currentPage, itemsPerPage, userId]);

  const handleFilterChange = (newFilters: Partial<ProjectListFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    setCurrentPage(1); // Reset to first page when filters change
  };

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    if (term.trim().length >= 2) {
      handleFilterChange({ search: term.trim() });
    } else if (term.trim().length === 0) {
      // Clear search
      const { search, ...otherFilters } = filters;
      setFilters(otherFilters);
      setCurrentPage(1);
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleProjectAction = async (action: string, project: Project, data?: any) => {
    try {
      switch (action) {
        case 'update':
          await handleUpdateProject(project.id, data);
          // Refresh the list
          break;
        case 'delete':
          await handleDeleteProject(project.id);
          // Refresh the list
          break;
        case 'select':
          onProjectSelect?.(project);
          break;
        default:
          break;
      }
    } catch (error) {
      console.error(`Error performing ${action} on project:`, error);
    }
  };

  const handleCreateNew = async () => {
    try {
      const newProject = await handleCreateProject({
        name: 'New Project',
        status: 'draft',
        priority: 'medium'
      });
      
      if (newProject && onProjectSelect) {
        onProjectSelect(newProject);
      }
    } catch (error) {
      console.error('Error creating project:', error);
    }
  };

  const renderFilters = () => {
    if (!showFilters) return null;

    return (
      <div className="project-list__filters">
        <div className="filter-group">
          <input
            type="text"
            placeholder="Search projects..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="search-input"
          />
        </div>
        
        <div className="filter-group">
          <select
            value={filters.status || ''}
            onChange={(e) => handleFilterChange({ status: e.target.value || undefined })}
            className="filter-select"
          >
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div className="filter-group">
          <select
            value={filters.priority || ''}
            onChange={(e) => handleFilterChange({ priority: e.target.value || undefined })}
            className="filter-select"
          >
            <option value="">All Priority</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        {Object.keys(filters).some(key => filters[key as keyof ProjectListFilters]) && (
          <button
            onClick={() => {
              setFilters({});
              setSearchTerm('');
              setCurrentPage(1);
            }}
            className="clear-filters-btn"
          >
            Clear Filters
          </button>
        )}
      </div>
    );
  };

  const renderPagination = () => {
    if (!pagination || pagination.total <= itemsPerPage) return null;

    const totalPages = Math.ceil(pagination.total / itemsPerPage);
    const pages = [];
    
    for (let i = 1; i <= totalPages; i++) {
      pages.push(
        <button
          key={i}
          onClick={() => handlePageChange(i)}
          className={`pagination-btn ${currentPage === i ? 'active' : ''}`}
          disabled={loading}
        >
          {i}
        </button>
      );
    }

    return (
      <div className="project-list__pagination">
        <button
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1 || loading}
          className="pagination-btn"
        >
          Previous
        </button>
        
        {pages}
        
        <button
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage === totalPages || loading}
          className="pagination-btn"
        >
          Next
        </button>
      </div>
    );
  };

  const renderProjectGrid = () => {
    if (loading && projects.length === 0) {
      return (
        <div className="project-list__loading">
          <div className="loading-spinner">Loading projects...</div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="project-list__error">
          <p>Error loading projects: {error}</p>
          <button onClick={() => window.location.reload()} className="retry-btn">
            Retry
          </button>
        </div>
      );
    }

    if (projects.length === 0) {
      return (
        <div className="project-list__empty">
          <h3>No projects found</h3>
          <p>
            {Object.keys(filters).length > 0
              ? 'Try adjusting your filters or create a new project.'
              : 'Get started by creating your first project.'}
          </p>
          {showCreateButton && (
            <button onClick={handleCreateNew} className="create-project-btn">
              Create New Project
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="project-list__grid">
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onUpdate={(data) => handleProjectAction('update', project, data)}
            onDelete={() => handleProjectAction('delete', project)}
            onSelect={() => handleProjectAction('select', project)}
            loading={actionLoading}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="project-list">
      <div className="project-list__header">
        <h2>Projects</h2>
        {showCreateButton && (
          <button
            onClick={handleCreateNew}
            disabled={actionLoading}
            className="create-project-btn primary"
          >
            {actionLoading ? 'Creating...' : 'New Project'}
          </button>
        )}
      </div>

      {renderFilters()}

      <div className="project-list__content">
        {renderProjectGrid()}
        {renderPagination()}
      </div>

      {pagination && (
        <div className="project-list__summary">
          Showing {Math.min(pagination.offset + 1, pagination.total)} to{' '}
          {Math.min(pagination.offset + itemsPerPage, pagination.total)} of{' '}
          {pagination.total} projects
        </div>
      )}
    </div>
  );
};