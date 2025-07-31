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

// API response types
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

interface ApiError {
  message: string;
  type: string;
  statusCode: number;
  context?: Record<string, any>;
}

// Action states
interface ActionState {
  loading: boolean;
  error: ApiError | null;
  success: boolean;
}

// Custom hook for project actions (create, update, delete)
export const useProjectActions = () => {
  // Individual action states
  const [createProjectState, setCreateProjectState] = useState<ActionState>({
    loading: false,
    error: null,
    success: false,
  });

  const [updateProjectState, setUpdateProjectState] = useState<ActionState>({
    loading: false,
    error: null,
    success: false,
  });

  const [deleteProjectState, setDeleteProjectState] = useState<ActionState & { projectId?: string }>({
    loading: false,
    error: null,
    success: false,
    projectId: undefined,
  });

  const [bulkDeleteState, setBulkDeleteState] = useState<ActionState>({
    loading: false,
    error: null,
    success: false,
  });

  const [duplicateProjectState, setDuplicateProjectState] = useState<ActionState>({
    loading: false,
    error: null,
    success: false,
  });

  // Request cancellation refs
  const createAbortControllerRef = useRef<AbortController | null>(null);
  const updateAbortControllerRef = useRef<AbortController | null>(null);
  const deleteAbortControllerRef = useRef<AbortController | null>(null);

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
    options: RequestInit = {},
    abortController?: AbortController
  ): Promise<T> => {
    try {
      const response = await fetch(`${API_BASE_URL}${url}`, {
        headers: getAuthHeaders(),
        signal: abortController?.signal,
        ...options,
      });

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
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ApiError('Request was cancelled', 'REQUEST_CANCELLED', 0);
      }
      
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

  // Create project
  const createProject = useCallback(async (projectData: CreateProjectData): Promise<Project> => {
    // Cancel any ongoing create request
    if (createAbortControllerRef.current) {
      createAbortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    createAbortControllerRef.current = abortController;

    setCreateProjectState({
      loading: true,
      error: null,
      success: false,
    });

    try {
      const project = await apiRequest<Project>(
        '/projects',
        {
          method: 'POST',
          body: JSON.stringify(projectData),
        },
        abortController
      );

      setCreateProjectState({
        loading: false,
        error: null,
        success: true,
      });

      // Clear success state after a delay
      setTimeout(() => {
        setCreateProjectState(prev => ({ ...prev, success: false }));
      }, 3000);

      return project;
    } catch (error) {
      const apiError = error instanceof ApiError ? error : new ApiError(
        error instanceof Error ? error.message : 'Failed to create project',
        'CREATE_ERROR',
        0
      );

      setCreateProjectState({
        loading: false,
        error: apiError,
        success: false,
      });

      throw apiError;
    } finally {
      createAbortControllerRef.current = null;
    }
  }, [apiRequest]);

  // Update project
  const updateProject = useCallback(async (
    projectId: string, 
    updateData: UpdateProjectData
  ): Promise<Project> => {
    // Cancel any ongoing update request
    if (updateAbortControllerRef.current) {
      updateAbortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    updateAbortControllerRef.current = abortController;

    setUpdateProjectState({
      loading: true,
      error: null,
      success: false,
    });

    try {
      const project = await apiRequest<Project>(
        `/projects/${projectId}`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData),
        },
        abortController
      );

      setUpdateProjectState({
        loading: false,
        error: null,
        success: true,
      });

      // Clear success state after a delay
      setTimeout(() => {
        setUpdateProjectState(prev => ({ ...prev, success: false }));
      }, 3000);

      return project;
    } catch (error) {
      const apiError = error instanceof ApiError ? error : new ApiError(
        error instanceof Error ? error.message : 'Failed to update project',
        'UPDATE_ERROR',
        0
      );

      setUpdateProjectState({
        loading: false,
        error: apiError,
        success: false,
      });

      throw apiError;
    } finally {
      updateAbortControllerRef.current = null;
    }
  }, [apiRequest]);

  // Delete project
  const deleteProject = useCallback(async (projectId: string): Promise<void> => {
    // Cancel any ongoing delete request
    if (deleteAbortControllerRef.current) {
      deleteAbortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    deleteAbortControllerRef.current = abortController;

    setDeleteProjectState({
      loading: true,
      error: null,
      success: false,
      projectId,
    });

    try {
      await apiRequest<void>(
        `/projects/${projectId}`,
        {
          method: 'DELETE',
        },
        abortController
      );

      setDeleteProjectState({
        loading: false,
        error: null,
        success: true,
        projectId: undefined,
      });

      // Clear success state after a delay
      setTimeout(() => {
        setDeleteProjectState(prev => ({ ...prev, success: false }));
      }, 3000);
    } catch (error) {
      const apiError = error instanceof ApiError ? error : new ApiError(
        error instanceof Error ? error.message : 'Failed to delete project',
        'DELETE_ERROR',
        0
      );

      setDeleteProjectState({
        loading: false,
        error: apiError,
        success: false,
        projectId: undefined,
      });

      throw apiError;
    } finally {
      deleteAbortControllerRef.current = null;
    }
  }, [apiRequest]);

  // Bulk delete projects
  const bulkDeleteProjects = useCallback(async (projectIds: string[]): Promise<void> => {
    setBulkDeleteState({
      loading: true,
      error: null,
      success: false,
    });

    try {
      // Delete projects sequentially to avoid overwhelming the server
      const results = await Promise.allSettled(
        projectIds.map(id => apiRequest<void>(`/projects/${id}`, { method: 'DELETE' }))
      );

      // Check if any deletions failed
      const failures = results.filter(result => result.status === 'rejected');
      
      if (failures.length > 0) {
        const failedCount = failures.length;
        const successCount = projectIds.length - failedCount;
        
        throw new ApiError(
          `Failed to delete ${failedCount} project(s). ${successCount} project(s) were deleted successfully.`,
          'BULK_DELETE_PARTIAL_FAILURE',
          207 // Multi-Status
        );
      }

      setBulkDeleteState({
        loading: false,
        error: null,
        success: true,
      });

      // Clear success state after a delay
      setTimeout(() => {
        setBulkDeleteState(prev => ({ ...prev, success: false }));
      }, 3000);
    } catch (error) {
      const apiError = error instanceof ApiError ? error : new ApiError(
        error instanceof Error ? error.message : 'Failed to delete projects',
        'BULK_DELETE_ERROR',
        0
      );

      setBulkDeleteState({
        loading: false,
        error: apiError,
        success: false,
      });

      throw apiError;
    }
  }, [apiRequest]);

  // Duplicate project
  const duplicateProject = useCallback(async (
    projectId: string,
    options: {
      namePrefix?: string;
      copyMetadata?: boolean;
      resetDates?: boolean;
      newStatus?: Project['status'];
    } = {}
  ): Promise<Project> => {
    setDuplicateProjectState({
      loading: true,
      error: null,
      success: false,
    });

    try {
      const project = await apiRequest<Project>(
        `/projects/${projectId}/duplicate`,
        {
          method: 'POST',
          body: JSON.stringify(options),
        }
      );

      setDuplicateProjectState({
        loading: false,
        error: null,
        success: true,
      });

      // Clear success state after a delay
      setTimeout(() => {
        setDuplicateProjectState(prev => ({ ...prev, success: false }));
      }, 3000);

      return project;
    } catch (error) {
      const apiError = error instanceof ApiError ? error : new ApiError(
        error instanceof Error ? error.message : 'Failed to duplicate project',
        'DUPLICATE_ERROR',
        0
      );

      setDuplicateProjectState({
        loading: false,
        error: apiError,
        success: false,
      });

      throw apiError;
    }
  }, [apiRequest]);

  // Archive project (soft delete)
  const archiveProject = useCallback(async (
    projectId: string,
    reason?: string
  ): Promise<void> => {
    try {
      await apiRequest<void>(
        `/projects/${projectId}/archive`,
        {
          method: 'POST',
          body: JSON.stringify({ reason }),
        }
      );
    } catch (error) {
      const apiError = error instanceof ApiError ? error : new ApiError(
        error instanceof Error ? error.message : 'Failed to archive project',
        'ARCHIVE_ERROR',
        0
      );
      throw apiError;
    }
  }, [apiRequest]);

  // Restore archived project
  const restoreProject = useCallback(async (projectId: string): Promise<void> => {
    try {
      await apiRequest<void>(
        `/projects/${projectId}/restore`,
        {
          method: 'POST',
        }
      );
    } catch (error) {
      const apiError = error instanceof ApiError ? error : new ApiError(
        error instanceof Error ? error.message : 'Failed to restore project',
        'RESTORE_ERROR',
        0
      );
      throw apiError;
    }
  }, [apiRequest]);

  // Update project status only
  const updateProjectStatus = useCallback(async (
    projectId: string,
    status: Project['status']
  ): Promise<Project> => {
    return updateProject(projectId, { status });
  }, [updateProject]);

  // Cancel ongoing operations
  const cancelCreate = useCallback(() => {
    if (createAbortControllerRef.current) {
      createAbortControllerRef.current.abort();
      createAbortControllerRef.current = null;
    }
    setCreateProjectState({
      loading: false,
      error: null,
      success: false,
    });
  }, []);

  const cancelUpdate = useCallback(() => {
    if (updateAbortControllerRef.current) {
      updateAbortControllerRef.current.abort();
      updateAbortControllerRef.current = null;
    }
    setUpdateProjectState({
      loading: false,
      error: null,
      success: false,
    });
  }, []);

  const cancelDelete = useCallback(() => {
    if (deleteAbortControllerRef.current) {
      deleteAbortControllerRef.current.abort();
      deleteAbortControllerRef.current = null;
    }
    setDeleteProjectState({
      loading: false,
      error: null,
      success: false,
      projectId: undefined,
    });
  }, []);

  // Clear error states
  const clearCreateError = useCallback(() => {
    setCreateProjectState(prev => ({ ...prev, error: null }));
  }, []);

  const clearUpdateError = useCallback(() => {
    setUpdateProjectState(prev => ({ ...prev, error: null }));
  }, []);

  const clearDeleteError = useCallback(() => {
    setDeleteProjectState(prev => ({ ...prev, error: null }));
  }, []);

  const clearBulkDeleteError = useCallback(() => {
    setBulkDeleteState(prev => ({ ...prev, error: null }));
  }, []);

  const clearDuplicateError = useCallback(() => {
    setDuplicateProjectState(prev => ({ ...prev, error: null }));
  }, []);

  // Clear all errors
  const clearAllErrors = useCallback(() => {
    clearCreateError();
    clearUpdateError();
    clearDeleteError();
    clearBulkDeleteError();
    clearDuplicateError();
  }, [clearCreateError, clearUpdateError, clearDeleteError, clearBulkDeleteError, clearDuplicateError]);

  // Check if any operation is loading
  const isAnyLoading = createProjectState.loading || 
                      updateProjectState.loading || 
                      deleteProjectState.loading || 
                      bulkDeleteState.loading || 
                      duplicateProjectState.loading;

  // Check if any operation has an error
  const hasAnyError = !!(createProjectState.error || 
                         updateProjectState.error || 
                         deleteProjectState.error || 
                         bulkDeleteState.error || 
                         duplicateProjectState.error);

  return {
    // Actions
    createProject,
    updateProject,
    deleteProject,
    bulkDeleteProjects,
    duplicateProject,
    archiveProject,
    restoreProject,
    updateProjectStatus,

    // Loading states
    createProjectLoading: createProjectState.loading,
    updateProjectLoading: updateProjectState.loading,
    deleteProjectLoading: deleteProjectState.projectId,
    bulkDeleteLoading: bulkDeleteState.loading,
    duplicateProjectLoading: duplicateProjectState.loading,

    // Error states
    createProjectError: createProjectState.error,
    updateProjectError: updateProjectState.error,
    deleteProjectError: deleteProjectState.error,
    bulkDeleteError: bulkDeleteState.error,
    duplicateProjectError: duplicateProjectState.error,

    // Success states
    createProjectSuccess: createProjectState.success,
    updateProjectSuccess: updateProjectState.success,
    deleteProjectSuccess: deleteProjectState.success,
    bulkDeleteSuccess: bulkDeleteState.success,
    duplicateProjectSuccess: duplicateProjectState.success,

    // Cancellation
    cancelCreate,
    cancelUpdate,
    cancelDelete,

    // Error clearing
    clearCreateError,
    clearUpdateError,
    clearDeleteError,
    clearBulkDeleteError,
    clearDuplicateError,
    clearAllErrors,

    // Computed states
    isAnyLoading,
    hasAnyError,
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

export default useProjectActions;