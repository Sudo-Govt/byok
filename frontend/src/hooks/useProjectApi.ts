import { useState, useCallback, useRef } from 'react';

// API configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

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

interface ProjectFilters {
  type?: 'web' | 'mobile' | 'desktop' | 'api';
  status?: 'planning' | 'active' | 'completed' | 'cancelled';
  search?: string;
  tags?: string[];
  startDateFrom?: Date;
  startDateTo?: Date;
  endDateFrom?: Date;
  endDateTo?: Date;
}

interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface ProjectStats {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
}

// API response types
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface ApiError {
  message: string;
  type: string;
  statusCode: number;
  context?: Record<string, any>;
}

// Custom hook for project API operations
export const useProjectApi = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [pagination, setPagination] = useState<PaginatedResult<Project>['pagination'] | null>(null);

  // Track ongoing requests to prevent race conditions
  const requestIdRef = useRef(0);

  // Helper function to get auth headers
  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('authToken');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
      'X-Request-ID': crypto.randomUUID(),
    };
  }, []);

  // Helper function to handle API requests
  const apiRequest = useCallback(async <T>(
    url: string,
    options: RequestInit = {}
  ): Promise<T> => {
    const requestId = ++requestIdRef.current;

    try {
      const response = await fetch(`${API_BASE_URL}${url}`, {
        headers: getAuthHeaders(),
        ...options,
      });

      // Check if this request is still the latest
      if (requestId !== requestIdRef.current) {
        throw new Error('Request superseded');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ 
          message: 'Network error occurred' 
        }));
        throw new ApiError(
          errorData.error?.message || errorData.message || 'Request failed',
          errorData.error?.type || 'UNKNOWN_ERROR',
          response.status,
          errorData.error?.context
        );
      }

      const data: ApiResponse<T> = await response.json();
      return data.data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(
        error instanceof Error ? error.message : 'Unknown error occurred',
        'NETWORK_ERROR',
        0
      );
    }
  }, [getAuthHeaders]);

  // Fetch projects with filters and pagination
  const fetchProjects = useCallback(async (
    filters: ProjectFilters & PaginationOptions = { page: 1, limit: 10 }
  ) => {
    setLoading(true);
    setError(null);

    try {
      // Build query parameters
      const params = new URLSearchParams();
      
      if (filters.page) params.append('page', filters.page.toString());
      if (filters.limit) params.append('limit', filters.limit.toString());
      if (filters.sortBy) params.append('sortBy', filters.sortBy);
      if (filters.sortOrder) params.append('sortOrder', filters.sortOrder);
      if (filters.type) params.append('type', filters.type);
      if (filters.status) params.append('status', filters.status);
      if (filters.search) params.append('search', filters.search);
      if (filters.tags?.length) params.append('tags', filters.tags.join(','));
      if (filters.startDateFrom) params.append('startDateFrom', filters.startDateFrom.toISOString());
      if (filters.startDateTo) params.append('startDateTo', filters.startDateTo.toISOString());
      if (filters.endDateFrom) params.append('endDateFrom', filters.endDateFrom.toISOString());
      if (filters.endDateTo) params.append('endDateTo', filters.endDateTo.toISOString());

      const response = await fetch(`${API_BASE_URL}/projects?${params}`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ 
          message: 'Failed to fetch projects' 
        }));
        throw new ApiError(
          errorData.error?.message || 'Failed to fetch projects',
          errorData.error?.type || 'FETCH_ERROR',
          response.status
        );
      }

      const data: ApiResponse<Project[]> = await response.json();
      
      setProjects(data.data);
      setPagination(data.pagination || null);
    } catch (err) {
      const apiError = err instanceof ApiError ? err : new ApiError(
        err instanceof Error ? err.message : 'Failed to fetch projects',
        'FETCH_ERROR',
        0
      );
      setError(apiError);
      console.error('Failed to fetch projects:', apiError);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  // Fetch single project by ID
  const fetchProject = useCallback(async (projectId: string) => {
    setLoading(true);
    setError(null);

    try {
      const projectData = await apiRequest<Project>(`/projects/${projectId}`);
      setProject(projectData);
    } catch (err) {
      const apiError = err instanceof ApiError ? err : new ApiError(
        err instanceof Error ? err.message : 'Failed to fetch project',
        'FETCH_ERROR',
        0
      );
      setError(apiError);
      setProject(null);
      console.error('Failed to fetch project:', apiError);
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  // Fetch project statistics
  const fetchProjectStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const statsData = await apiRequest<ProjectStats>('/projects/stats');
      setStats(statsData);
    } catch (err) {
      const apiError = err instanceof ApiError ? err : new ApiError(
        err instanceof Error ? err.message : 'Failed to fetch project statistics',
        'FETCH_ERROR',
        0
      );
      setError(apiError);
      console.error('Failed to fetch project stats:', apiError);
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  // Search projects
  const searchProjects = useCallback(async (
    searchTerm: string,
    filters: Omit<ProjectFilters, 'search'> & PaginationOptions = { page: 1, limit: 10 }
  ) => {
    return fetchProjects({ ...filters, search: searchTerm });
  }, [fetchProjects]);

  // Refresh current projects list
  const refreshProjects = useCallback(() => {
    // Re-fetch with last used parameters (stored in component state)
    const currentPage = pagination?.page || 1;
    const currentLimit = pagination?.limit || 10;
    
    fetchProjects({ page: currentPage, limit: currentLimit });
  }, [fetchProjects, pagination]);

  // Clear error state
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Reset all state
  const reset = useCallback(() => {
    setProjects([]);
    setProject(null);
    setStats(null);
    setLoading(false);
    setError(null);
    setPagination(null);
  }, []);

  // Get project by ID from current projects list
  const getProjectById = useCallback((projectId: string): Project | null => {
    return projects.find(p => p.id === projectId) || null;
  }, [projects]);

  // Filter projects in memory (useful for client-side filtering)
  const filterProjects = useCallback((filterFn: (project: Project) => boolean): Project[] => {
    return projects.filter(filterFn);
  }, [projects]);

  // Sort projects in memory
  const sortProjects = useCallback((
    sortFn: (a: Project, b: Project) => number
  ): Project[] => {
    return [...projects].sort(sortFn);
  }, [projects]);

  // Get projects by status
  const getProjectsByStatus = useCallback((status: Project['status']): Project[] => {
    return projects.filter(p => p.status === status);
  }, [projects]);

  // Get projects by type
  const getProjectsByType = useCallback((type: Project['type']): Project[] => {
    return projects.filter(p => p.type === type);
  }, [projects]);

  // Check if project list is empty
  const isEmpty = projects.length === 0 && !loading;

  // Check if we have data
  const hasData = projects.length > 0;

  // Check if we're on the first page
  const isFirstPage = (pagination?.page || 1) === 1;

  // Check if we're on the last page
  const isLastPage = (pagination?.page || 1) === (pagination?.totalPages || 1);

  return {
    // State
    projects,
    project,
    stats,
    loading,
    error,
    pagination,

    // Actions
    fetchProjects,
    fetchProject,
    fetchProjectStats,
    searchProjects,
    refreshProjects,
    clearError,
    reset,

    // Utilities
    getProjectById,
    filterProjects,
    sortProjects,
    getProjectsByStatus,
    getProjectsByType,

    // Computed properties
    isEmpty,
    hasData,
    isFirstPage,
    isLastPage,
  };
};

// Custom API error class
class ApiError extends Error {
  constructor(
    message: string,
    public type: string,
    public statusCode: number,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export default useProjectApi;