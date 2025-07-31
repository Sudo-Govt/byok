import { useState, useCallback } from 'react';
import { useProjectApi } from './useProjectApi';
import { Project } from '../components/Project/ProjectList';
import { ProjectFormData } from '../components/Project/ProjectForm';

export interface ProjectActionState {
  isLoading: boolean;
  error: string | null;
  lastAction: string | null;
}

export interface CreateProjectData {
  name: string;
  description?: string;
  status?: 'draft' | 'active' | 'completed' | 'archived' | 'cancelled';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface UpdateProjectData {
  name?: string;
  description?: string;
  status?: 'draft' | 'active' | 'completed' | 'archived' | 'cancelled';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  tags?: string[];
  metadata?: Record<string, any>;
}

export const useProjectActions = () => {
  const [actionState, setActionState] = useState<ProjectActionState>({
    isLoading: false,
    error: null,
    lastAction: null
  });

  const { createProject, updateProject, deleteProject } = useProjectApi();

  // Helper to set loading state
  const setLoading = useCallback((action: string, loading: boolean) => {
    setActionState(prev => ({
      ...prev,
      isLoading: loading,
      lastAction: loading ? action : prev.lastAction,
      error: loading ? null : prev.error
    }));
  }, []);

  // Helper to set error state
  const setError = useCallback((error: string | null) => {
    setActionState(prev => ({
      ...prev,
      isLoading: false,
      error
    }));
  }, []);

  // Validate project data
  const validateProjectData = useCallback((data: CreateProjectData | UpdateProjectData): string[] => {
    const errors: string[] = [];

    if ('name' in data && data.name !== undefined) {
      if (!data.name || data.name.trim().length === 0) {
        errors.push('Project name is required');
      } else if (data.name.trim().length < 3) {
        errors.push('Project name must be at least 3 characters long');
      } else if (data.name.length > 255) {
        errors.push('Project name cannot exceed 255 characters');
      }
    }

    if (data.description && data.description.length > 2000) {
      errors.push('Description cannot exceed 2000 characters');
    }

    if (data.tags) {
      if (data.tags.length > 20) {
        errors.push('Maximum 20 tags allowed');
      }
      
      for (const tag of data.tags) {
        if (tag.length === 0) {
          errors.push('Tags cannot be empty');
        } else if (tag.length > 50) {
          errors.push('Each tag must be 50 characters or less');
        } else if (!/^[a-zA-Z0-9\-_\s]+$/.test(tag)) {
          errors.push('Tags can only contain letters, numbers, hyphens, underscores, and spaces');
        }
      }

      // Check for duplicate tags
      const uniqueTags = new Set(data.tags.map(tag => tag.toLowerCase()));
      if (uniqueTags.size !== data.tags.length) {
        errors.push('Duplicate tags are not allowed');
      }
    }

    return errors;
  }, []);

  // Validate status transitions
  const validateStatusTransition = useCallback((currentStatus: string, newStatus: string): string | null => {
    const validTransitions: Record<string, string[]> = {
      draft: ['active', 'cancelled'],
      active: ['completed', 'archived', 'cancelled'],
      completed: ['archived'],
      archived: ['active'], // Allow reactivation from archive
      cancelled: [] // No transitions from cancelled
    };

    const allowedStatuses = validTransitions[currentStatus] || [];
    
    if (!allowedStatuses.includes(newStatus)) {
      return `Cannot transition from ${currentStatus} to ${newStatus}. Allowed transitions: ${allowedStatuses.join(', ') || 'none'}`;
    }

    return null;
  }, []);

  // Create a new project
  const handleCreateProject = useCallback(async (data: CreateProjectData): Promise<Project | null> => {
    setLoading('create', true);

    try {
      // Validate data
      const validationErrors = validateProjectData(data);
      if (validationErrors.length > 0) {
        throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
      }

      // Prepare project data
      const projectData = {
        name: data.name.trim(),
        description: data.description?.trim() || '',
        status: data.status || 'draft',
        priority: data.priority || 'medium',
        tags: data.tags ? [...new Set(data.tags.map(tag => tag.trim()).filter(tag => tag.length > 0))] : [],
        metadata: data.metadata || {}
      };

      const newProject = await createProject(projectData);
      
      setActionState(prev => ({
        ...prev,
        isLoading: false,
        error: null,
        lastAction: 'create'
      }));

      return newProject;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create project';
      setError(errorMessage);
      return null;
    }
  }, [createProject, validateProjectData, setLoading, setError]);

  // Update an existing project
  const handleUpdateProject = useCallback(async (
    projectId: string, 
    data: UpdateProjectData,
    currentProject?: Project
  ): Promise<Project | null> => {
    setLoading('update', true);

    try {
      // Validate data
      const validationErrors = validateProjectData(data);
      if (validationErrors.length > 0) {
        throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
      }

      // Validate status transition if status is being changed
      if (data.status && currentProject && data.status !== currentProject.status) {
        const transitionError = validateStatusTransition(currentProject.status, data.status);
        if (transitionError) {
          throw new Error(transitionError);
        }
      }

      // Prepare update data
      const updateData: UpdateProjectData = {};
      
      if (data.name !== undefined) {
        updateData.name = data.name.trim();
      }
      if (data.description !== undefined) {
        updateData.description = data.description.trim();
      }
      if (data.status !== undefined) {
        updateData.status = data.status;
      }
      if (data.priority !== undefined) {
        updateData.priority = data.priority;
      }
      if (data.tags !== undefined) {
        updateData.tags = [...new Set(data.tags.map(tag => tag.trim()).filter(tag => tag.length > 0))];
      }
      if (data.metadata !== undefined) {
        updateData.metadata = data.metadata;
      }

      const updatedProject = await updateProject(projectId, updateData);
      
      setActionState(prev => ({
        ...prev,
        isLoading: false,
        error: null,
        lastAction: 'update'
      }));

      return updatedProject;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update project';
      setError(errorMessage);
      return null;
    }
  }, [updateProject, validateProjectData, validateStatusTransition, setLoading, setError]);

  // Delete a project
  const handleDeleteProject = useCallback(async (projectId: string): Promise<boolean> => {
    setLoading('delete', true);

    try {
      await deleteProject(projectId);
      
      setActionState(prev => ({
        ...prev,
        isLoading: false,
        error: null,
        lastAction: 'delete'
      }));

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete project';
      setError(errorMessage);
      return false;
    }
  }, [deleteProject, setLoading, setError]);

  // Bulk update projects
  const handleBulkUpdateProjects = useCallback(async (
    projectIds: string[],
    updates: UpdateProjectData
  ): Promise<{ successful: string[]; failed: { id: string; error: string }[] }> => {
    setLoading('bulk_update', true);

    const results = {
      successful: [] as string[],
      failed: [] as { id: string; error: string }[]
    };

    try {
      // Process updates sequentially to avoid overwhelming the API
      for (const projectId of projectIds) {
        try {
          await updateProject(projectId, updates);
          results.successful.push(projectId);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          results.failed.push({ id: projectId, error: errorMessage });
        }
      }

      setActionState(prev => ({
        ...prev,
        isLoading: false,
        error: results.failed.length > 0 ? `${results.failed.length} updates failed` : null,
        lastAction: 'bulk_update'
      }));

      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Bulk update failed';
      setError(errorMessage);
      return results;
    }
  }, [updateProject, setLoading, setError]);

  // Bulk delete projects
  const handleBulkDeleteProjects = useCallback(async (
    projectIds: string[]
  ): Promise<{ successful: string[]; failed: { id: string; error: string }[] }> => {
    setLoading('bulk_delete', true);

    const results = {
      successful: [] as string[],
      failed: [] as { id: string; error: string }[]
    };

    try {
      // Process deletes sequentially to avoid overwhelming the API
      for (const projectId of projectIds) {
        try {
          await deleteProject(projectId);
          results.successful.push(projectId);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          results.failed.push({ id: projectId, error: errorMessage });
        }
      }

      setActionState(prev => ({
        ...prev,
        isLoading: false,
        error: results.failed.length > 0 ? `${results.failed.length} deletions failed` : null,
        lastAction: 'bulk_delete'
      }));

      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Bulk delete failed';
      setError(errorMessage);
      return results;
    }
  }, [deleteProject, setLoading, setError]);

  // Duplicate a project
  const handleDuplicateProject = useCallback(async (
    sourceProject: Project,
    nameOverride?: string
  ): Promise<Project | null> => {
    setLoading('duplicate', true);

    try {
      const duplicateData: CreateProjectData = {
        name: nameOverride || `Copy of ${sourceProject.name}`,
        description: sourceProject.description,
        status: 'draft', // Always start duplicates as draft
        priority: sourceProject.priority,
        tags: sourceProject.tags ? [...sourceProject.tags] : [],
        metadata: sourceProject.metadata ? { ...sourceProject.metadata } : {}
      };

      const newProject = await handleCreateProject(duplicateData);
      
      setActionState(prev => ({
        ...prev,
        lastAction: 'duplicate'
      }));

      return newProject;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to duplicate project';
      setError(errorMessage);
      return null;
    }
  }, [handleCreateProject, setLoading, setError]);

  // Archive a project
  const handleArchiveProject = useCallback(async (projectId: string, currentProject?: Project): Promise<Project | null> => {
    return handleUpdateProject(projectId, { status: 'archived' }, currentProject);
  }, [handleUpdateProject]);

  // Activate a project
  const handleActivateProject = useCallback(async (projectId: string, currentProject?: Project): Promise<Project | null> => {
    return handleUpdateProject(projectId, { status: 'active' }, currentProject);
  }, [handleUpdateProject]);

  // Complete a project
  const handleCompleteProject = useCallback(async (projectId: string, currentProject?: Project): Promise<Project | null> => {
    return handleUpdateProject(projectId, { status: 'completed' }, currentProject);
  }, [handleUpdateProject]);

  // Clear error state
  const clearError = useCallback(() => {
    setError(null);
  }, [setError]);

  // Reset action state
  const resetActionState = useCallback(() => {
    setActionState({
      isLoading: false,
      error: null,
      lastAction: null
    });
  }, []);

  return {
    // State
    isLoading: actionState.isLoading,
    error: actionState.error,
    lastAction: actionState.lastAction,

    // CRUD Actions
    handleCreateProject,
    handleUpdateProject,
    handleDeleteProject,

    // Bulk Actions
    handleBulkUpdateProjects,
    handleBulkDeleteProjects,

    // Convenience Actions
    handleDuplicateProject,
    handleArchiveProject,
    handleActivateProject,
    handleCompleteProject,

    // Utilities
    clearError,
    resetActionState,
    validateProjectData,
    validateStatusTransition
  };
};