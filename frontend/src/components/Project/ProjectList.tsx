import React, { useState, useEffect, useMemo } from 'react';
import ProjectCard from './ProjectCard';
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

// Filter options
interface ProjectFilters {
  type?: 'web' | 'mobile' | 'desktop' | 'api';
  status?: 'planning' | 'active' | 'completed' | 'cancelled';
  search?: string;
  tags?: string[];
}

// Sort options
interface SortOptions {
  sortBy: 'name' | 'type' | 'status' | 'created_at' | 'updated_at';
  sortOrder: 'asc' | 'desc';
}

// Component props
interface ProjectListProps {
  className?: string;
  showFilters?: boolean;
  showSearch?: boolean;
  showSort?: boolean;
  showPagination?: boolean;
  defaultPageSize?: number;
  onProjectSelect?: (project: Project) => void;
  onProjectEdit?: (project: Project) => void;
  onProjectDelete?: (project: Project) => void;
  compactView?: boolean;
}

const ProjectList: React.FC<ProjectListProps> = ({
  className = '',
  showFilters = true,
  showSearch = true,
  showSort = true,
  showPagination = true,
  defaultPageSize = 10,
  onProjectSelect,
  onProjectEdit,
  onProjectDelete,
  compactView = false,
}) => {
  // State management
  const [filters, setFilters] = useState<ProjectFilters>({});
  const [sort, setSort] = useState<SortOptions>({
    sortBy: 'updated_at',
    sortOrder: 'desc',
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);

  // Custom hooks
  const {
    projects,
    loading,
    error,
    pagination,
    fetchProjects,
    refreshProjects,
  } = useProjectApi();

  const {
    deleteProject,
    deleteProjectLoading,
    bulkDeleteProjects,
    bulkDeleteLoading,
  } = useProjectActions();

  // Fetch projects when filters, sort, or pagination change
  useEffect(() => {
    const fetchParams = {
      ...filters,
      search: searchTerm,
      page: currentPage,
      limit: pageSize,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
    };

    fetchProjects(fetchParams);
  }, [filters, sort, currentPage, pageSize, searchTerm, fetchProjects]);

  // Filter options
  const typeOptions = [
    { value: '', label: 'All Types' },
    { value: 'web', label: 'Web' },
    { value: 'mobile', label: 'Mobile' },
    { value: 'desktop', label: 'Desktop' },
    { value: 'api', label: 'API' },
  ];

  const statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'planning', label: 'Planning' },
    { value: 'active', label: 'Active' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  const sortOptions = [
    { value: 'name', label: 'Name' },
    { value: 'type', label: 'Type' },
    { value: 'status', label: 'Status' },
    { value: 'created_at', label: 'Created Date' },
    { value: 'updated_at', label: 'Updated Date' },
  ];

  // Handlers
  const handleFilterChange = (key: keyof ProjectFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value || undefined,
    }));
    setCurrentPage(1); // Reset to first page when filters change
  };

  const handleSortChange = (sortBy: string) => {
    setSort(prev => ({
      sortBy: sortBy as SortOptions['sortBy'],
      sortOrder: prev.sortBy === sortBy && prev.sortOrder === 'asc' ? 'desc' : 'asc',
    }));
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const handleProjectSelect = (projectId: string) => {
    setSelectedProjects(prev => 
      prev.includes(projectId)
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    );
  };

  const handleSelectAll = () => {
    if (selectedProjects.length === projects.length) {
      setSelectedProjects([]);
    } else {
      setSelectedProjects(projects.map(p => p.id));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedProjects.length === 0) return;

    if (window.confirm(`Are you sure you want to delete ${selectedProjects.length} project(s)?`)) {
      try {
        await bulkDeleteProjects(selectedProjects);
        setSelectedProjects([]);
        refreshProjects();
      } catch (error) {
        console.error('Failed to delete projects:', error);
      }
    }
  };

  const handleProjectAction = async (action: string, project: Project) => {
    switch (action) {
      case 'edit':
        onProjectEdit?.(project);
        break;
      case 'delete':
        if (window.confirm(`Are you sure you want to delete "${project.name}"?`)) {
          try {
            await deleteProject(project.id);
            refreshProjects();
          } catch (error) {
            console.error('Failed to delete project:', error);
          }
        }
        break;
      case 'view':
        onProjectSelect?.(project);
        break;
      default:
        break;
    }
  };

  // Memoized values
  const hasProjects = projects.length > 0;
  const hasFilters = Object.values(filters).some(value => value) || searchTerm;
  const isAllSelected = selectedProjects.length === projects.length && projects.length > 0;
  const isSomeSelected = selectedProjects.length > 0 && selectedProjects.length < projects.length;

  // Loading state
  if (loading && projects.length === 0) {
    return (
      <div className={`project-list ${className}`}>
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading projects...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`project-list ${className}`}>
      {/* Header */}
      <div className="project-list-header">
        <div className="header-content">
          <h2>Projects</h2>
          {pagination && (
            <span className="total-count">
              {pagination.total} project{pagination.total !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Actions */}
        {selectedProjects.length > 0 && (
          <div className="bulk-actions">
            <span className="selected-count">
              {selectedProjects.length} selected
            </span>
            <button
              className="btn btn-danger btn-sm"
              onClick={handleBulkDelete}
              disabled={bulkDeleteLoading}
            >
              {bulkDeleteLoading ? 'Deleting...' : 'Delete Selected'}
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="project-filters">
          {showSearch && (
            <div className="filter-group">
              <input
                type="text"
                placeholder="Search projects..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="search-input"
              />
            </div>
          )}

          <div className="filter-group">
            <select
              value={filters.type || ''}
              onChange={(e) => handleFilterChange('type', e.target.value)}
              className="filter-select"
            >
              {typeOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <select
              value={filters.status || ''}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="filter-select"
            >
              {statusOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {showSort && (
            <div className="filter-group">
              <select
                value={sort.sortBy}
                onChange={(e) => handleSortChange(e.target.value)}
                className="sort-select"
              >
                {sortOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    Sort by {option.label}
                  </option>
                ))}
              </select>
              <button
                className={`sort-order-btn ${sort.sortOrder}`}
                onClick={() => setSort(prev => ({
                  ...prev,
                  sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc'
                }))}
                title={`Sort ${sort.sortOrder === 'asc' ? 'Descending' : 'Ascending'}`}
              >
                {sort.sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          )}

          {hasFilters && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setFilters({});
                setSearchTerm('');
                setCurrentPage(1);
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="error-message">
          <p>Error loading projects: {error.message}</p>
          <button className="btn btn-primary" onClick={refreshProjects}>
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !hasProjects && !error && (
        <div className="empty-state">
          {hasFilters ? (
            <div>
              <p>No projects match your filters.</p>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setFilters({});
                  setSearchTerm('');
                }}
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <div>
              <p>You don't have any projects yet.</p>
              <p>Create your first project to get started!</p>
            </div>
          )}
        </div>
      )}

      {/* Project list */}
      {hasProjects && (
        <>
          {/* List header with select all */}
          <div className="list-header">
            <label className="select-all-checkbox">
              <input
                type="checkbox"
                checked={isAllSelected}
                ref={input => {
                  if (input) input.indeterminate = isSomeSelected;
                }}
                onChange={handleSelectAll}
              />
              Select All
            </label>
          </div>

          {/* Project cards */}
          <div className={`project-grid ${compactView ? 'compact' : ''}`}>
            {projects.map(project => (
              <ProjectCard
                key={project.id}
                project={project}
                selected={selectedProjects.includes(project.id)}
                onSelect={() => handleProjectSelect(project.id)}
                onAction={(action) => handleProjectAction(action, project)}
                compact={compactView}
                loading={deleteProjectLoading === project.id}
              />
            ))}
          </div>

          {/* Loading overlay */}
          {loading && (
            <div className="loading-overlay">
              <div className="loading-spinner"></div>
            </div>
          )}
        </>
      )}

      {/* Pagination */}
      {showPagination && pagination && pagination.totalPages > 1 && (
        <div className="pagination">
          <div className="pagination-info">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} projects
          </div>

          <div className="pagination-controls">
            <button
              className="btn btn-secondary"
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
            >
              Previous
            </button>

            {/* Page numbers */}
            <div className="page-numbers">
              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                const pageNumber = Math.max(1, pagination.page - 2) + i;
                if (pageNumber > pagination.totalPages) return null;
                
                return (
                  <button
                    key={pageNumber}
                    className={`btn ${pageNumber === pagination.page ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => handlePageChange(pageNumber)}
                  >
                    {pageNumber}
                  </button>
                );
              })}
            </div>

            <button
              className="btn btn-secondary"
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page === pagination.totalPages}
            >
              Next
            </button>
          </div>

          <div className="page-size-selector">
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="page-size-select"
            >
              <option value={10}>10 per page</option>
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectList;