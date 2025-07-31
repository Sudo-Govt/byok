import { useState, useCallback } from 'react';
import { Project } from '../components/Project/ProjectList';

export interface ProjectFilters {
  status?: string;
  priority?: string;
  userId?: string;
  tags?: string[];
  search?: string;
}

export interface ProjectSortOptions {
  field: 'name' | 'createdAt' | 'updatedAt' | 'priority' | 'status';
  direction: 'asc' | 'desc';
}

export interface PaginationOptions {
  offset: number;
  limit: number;
}

export interface PaginationResult {
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface ProjectApiError {
  message: string;
  type?: string;
  details?: any;
}

export interface ProjectApiResponse<T> {
  success: boolean;
  data: T;
  pagination?: PaginationResult;
}

// Mock API base URL - replace with actual API URL
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

export const useProjectApi = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationResult | null>(null);

  // Helper function to get auth headers
  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('authToken');
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` })
    };
  }, []);

  // Helper function to handle API responses
  const handleApiResponse = async <T,>(response: Response): Promise<T> => {
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  };

  // Fetch multiple projects with filtering, sorting, and pagination
  const fetchProjects = useCallback(async (
    filters: ProjectFilters = {},
    sort: ProjectSortOptions = { field: 'createdAt', direction: 'desc' },
    paginationOptions: PaginationOptions = { offset: 0, limit: 10 }
  ) => {
    setLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams();
      
      // Add filters
      if (filters.status) queryParams.append('status', filters.status);
      if (filters.priority) queryParams.append('priority', filters.priority);
      if (filters.userId) queryParams.append('userId', filters.userId);
      if (filters.search) queryParams.append('search', filters.search);
      if (filters.tags && filters.tags.length > 0) {
        filters.tags.forEach(tag => queryParams.append('tags', tag));
      }

      // Add sorting
      queryParams.append('sortBy', sort.field);
      queryParams.append('sortOrder', sort.direction);

      // Add pagination
      queryParams.append('offset', paginationOptions.offset.toString());
      queryParams.append('limit', paginationOptions.limit.toString());

      const response = await fetch(`${API_BASE_URL}/projects?${queryParams}`, {
        method: 'GET',
        headers: getAuthHeaders()
      });

      const result: ProjectApiResponse<Project[]> = await handleApiResponse(response);
      
      setProjects(result.data);
      setPagination(result.pagination || null);
      
      return result.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch projects';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  // Fetch a single project by ID
  const fetchProject = useCallback(async (projectId: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/projects/${projectId}`, {
        method: 'GET',
        headers: getAuthHeaders()
      });

      const result: ProjectApiResponse<Project> = await handleApiResponse(response);
      
      setProject(result.data);
      return result.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch project';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  // Search projects
  const searchProjects = useCallback(async (
    searchTerm: string,
    paginationOptions: PaginationOptions = { offset: 0, limit: 10 },
    userId?: string
  ) => {
    setLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams();
      queryParams.append('q', searchTerm);
      queryParams.append('offset', paginationOptions.offset.toString());
      queryParams.append('limit', paginationOptions.limit.toString());
      
      if (userId) {
        queryParams.append('userId', userId);
      }

      const response = await fetch(`${API_BASE_URL}/projects/search?${queryParams}`, {
        method: 'GET',
        headers: getAuthHeaders()
      });

      const result: ProjectApiResponse<Project[]> = await handleApiResponse(response);
      
      setProjects(result.data);
      setPagination(result.pagination || null);
      
      return result.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to search projects';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  // Get projects for a specific user
  const fetchUserProjects = useCallback(async (
    userId: string,
    filters: Omit<ProjectFilters, 'userId'> = {},
    sort: ProjectSortOptions = { field: 'createdAt', direction: 'desc' },
    paginationOptions: PaginationOptions = { offset: 0, limit: 10 }
  ) => {
    setLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams();
      
      // Add filters
      if (filters.status) queryParams.append('status', filters.status);
      if (filters.priority) queryParams.append('priority', filters.priority);
      if (filters.search) queryParams.append('search', filters.search);
      if (filters.tags && filters.tags.length > 0) {
        filters.tags.forEach(tag => queryParams.append('tags', tag));
      }

      // Add sorting
      queryParams.append('sortBy', sort.field);
      queryParams.append('sortOrder', sort.direction);

      // Add pagination
      queryParams.append('offset', paginationOptions.offset.toString());
      queryParams.append('limit', paginationOptions.limit.toString());

      const response = await fetch(`${API_BASE_URL}/users/${userId}/projects?${queryParams}`, {
        method: 'GET',
        headers: getAuthHeaders()
      });

      const result: ProjectApiResponse<Project[]> = await handleApiResponse(response);
      
      setProjects(result.data);
      setPagination(result.pagination || null);
      
      return result.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch user projects';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  // Get project statistics
  const fetchProjectStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/projects/stats`, {
        method: 'GET',
        headers: getAuthHeaders()
      });

      const result = await handleApiResponse(response);
      return result.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch project statistics';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  // Create a new project
  const createProject = useCallback(async (projectData: Omit<Project, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/projects`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(projectData)
      });

      const result: ProjectApiResponse<Project> = await handleApiResponse(response);
      
      // Add to local state
      setProjects(prev => [result.data, ...prev]);
      
      return result.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create project';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  // Update a project
  const updateProject = useCallback(async (projectId: string, updates: Partial<Project>) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/projects/${projectId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(updates)
      });

      const result: ProjectApiResponse<Project> = await handleApiResponse(response);
      
      // Update local state
      setProjects(prev => prev.map(p => p.id === projectId ? result.data : p));
      if (project && project.id === projectId) {
        setProject(result.data);
      }
      
      return result.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update project';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, project]);

  // Delete a project
  const deleteProject = useCallback(async (projectId: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/projects/${projectId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      await handleApiResponse(response);
      
      // Remove from local state
      setProjects(prev => prev.filter(p => p.id !== projectId));
      if (project && project.id === projectId) {
        setProject(null);
      }
      
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete project';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, project]);

  // Clear error state
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Reset all state
  const reset = useCallback(() => {
    setProjects([]);
    setProject(null);
    setLoading(false);
    setError(null);
    setPagination(null);
  }, []);

  return {
    // State
    projects,
    project,
    loading,
    error,
    pagination,

    // Actions
    fetchProjects,
    fetchProject,
    searchProjects,
    fetchUserProjects,
    fetchProjectStats,
    createProject,
    updateProject,
    deleteProject,

    // Utilities
    clearError,
    reset
  };
};