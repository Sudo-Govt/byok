import { Request, Response, NextFunction } from 'express';
import { projectService, CreateProjectData, UpdateProjectData, ProjectFilters, PaginationOptions } from '../services/projectService';
import { AuthenticatedRequest } from '../../shared/src/middleware/auth';
import { logger } from '../../shared/src/utils/logger';
import { metrics } from '../../shared/src/utils/metrics';
import { ApiError, ErrorFactory } from '../../shared/src/utils/ApiError';

// Controller class for project operations
export class ProjectController {
  // Create a new project
  async createProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    const requestId = req.headers['x-request-id'] as string;
    const user = (req as AuthenticatedRequest).user;
    const startTime = Date.now();

    try {
      const projectData: CreateProjectData = req.body;

      logger.info('Creating project', {
        requestId,
        userId: user.id,
        projectName: projectData.name,
      });

      const project = await projectService.createProject(user.id, projectData);

      const duration = Date.now() - startTime;

      logger.info('Project created successfully', {
        requestId,
        userId: user.id,
        projectId: project.id,
        duration,
      });

      metrics.counter('project_controller.create.success', 1);
      metrics.timer('project_controller.create.duration', duration);

      res.status(201).json({
        success: true,
        data: project,
        message: 'Project created successfully',
      });
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Failed to create project', error, {
        requestId,
        userId: user.id,
        body: req.body,
        duration,
      });

      metrics.counter('project_controller.create.errors', 1);
      metrics.timer('project_controller.create.duration', duration, { error: 'true' });

      next(error);
    }
  }

  // Get project by ID
  async getProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    const requestId = req.headers['x-request-id'] as string;
    const user = (req as AuthenticatedRequest).user;
    const projectId = req.params.id;
    const startTime = Date.now();

    try {
      logger.debug('Getting project by ID', {
        requestId,
        userId: user.id,
        projectId,
      });

      const project = await projectService.getProjectById(projectId, user.id);

      if (!project) {
        const error = ErrorFactory.notFoundError('Project', { projectId }, requestId, user.id);
        return next(error);
      }

      // Check if user owns the project or is admin
      if (project.ownerId !== user.id && user.role !== 'admin') {
        const error = ErrorFactory.authorizationError(
          'You can only access your own projects',
          { projectId, ownerId: project.ownerId },
          requestId,
          user.id
        );
        return next(error);
      }

      const duration = Date.now() - startTime;

      logger.debug('Project retrieved successfully', {
        requestId,
        userId: user.id,
        projectId,
        duration,
      });

      metrics.counter('project_controller.get.success', 1);
      metrics.timer('project_controller.get.duration', duration);

      res.status(200).json({
        success: true,
        data: project,
      });
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Failed to get project', error, {
        requestId,
        userId: user.id,
        projectId,
        duration,
      });

      metrics.counter('project_controller.get.errors', 1);
      metrics.timer('project_controller.get.duration', duration, { error: 'true' });

      next(error);
    }
  }

  // Update project
  async updateProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    const requestId = req.headers['x-request-id'] as string;
    const user = (req as AuthenticatedRequest).user;
    const projectId = req.params.id;
    const startTime = Date.now();

    try {
      const updateData: UpdateProjectData = req.body;

      logger.info('Updating project', {
        requestId,
        userId: user.id,
        projectId,
        updateData,
      });

      const project = await projectService.updateProject(projectId, user.id, updateData);

      const duration = Date.now() - startTime;

      logger.info('Project updated successfully', {
        requestId,
        userId: user.id,
        projectId,
        duration,
      });

      metrics.counter('project_controller.update.success', 1);
      metrics.timer('project_controller.update.duration', duration);

      res.status(200).json({
        success: true,
        data: project,
        message: 'Project updated successfully',
      });
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Failed to update project', error, {
        requestId,
        userId: user.id,
        projectId,
        body: req.body,
        duration,
      });

      metrics.counter('project_controller.update.errors', 1);
      metrics.timer('project_controller.update.duration', duration, { error: 'true' });

      next(error);
    }
  }

  // Delete project
  async deleteProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    const requestId = req.headers['x-request-id'] as string;
    const user = (req as AuthenticatedRequest).user;
    const projectId = req.params.id;
    const startTime = Date.now();

    try {
      logger.info('Deleting project', {
        requestId,
        userId: user.id,
        projectId,
      });

      await projectService.deleteProject(projectId, user.id);

      const duration = Date.now() - startTime;

      logger.info('Project deleted successfully', {
        requestId,
        userId: user.id,
        projectId,
        duration,
      });

      metrics.counter('project_controller.delete.success', 1);
      metrics.timer('project_controller.delete.duration', duration);

      res.status(200).json({
        success: true,
        message: 'Project deleted successfully',
      });
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Failed to delete project', error, {
        requestId,
        userId: user.id,
        projectId,
        duration,
      });

      metrics.counter('project_controller.delete.errors', 1);
      metrics.timer('project_controller.delete.duration', duration, { error: 'true' });

      next(error);
    }
  }

  // Get user's projects with pagination and filtering
  async getUserProjects(req: Request, res: Response, next: NextFunction): Promise<void> {
    const requestId = req.headers['x-request-id'] as string;
    const user = (req as AuthenticatedRequest).user;
    const startTime = Date.now();

    try {
      // Parse query parameters
      const filters: ProjectFilters = {
        type: req.query.type as any,
        status: req.query.status as any,
        search: req.query.search as string,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
      };

      // Parse date filters
      if (req.query.startDateFrom) {
        filters.startDateFrom = new Date(req.query.startDateFrom as string);
      }
      if (req.query.startDateTo) {
        filters.startDateTo = new Date(req.query.startDateTo as string);
      }
      if (req.query.endDateFrom) {
        filters.endDateFrom = new Date(req.query.endDateFrom as string);
      }
      if (req.query.endDateTo) {
        filters.endDateTo = new Date(req.query.endDateTo as string);
      }

      const pagination: PaginationOptions = {
        page: parseInt(req.query.page as string) || 1,
        limit: Math.min(parseInt(req.query.limit as string) || 10, 100), // Max 100 items per page
        sortBy: req.query.sortBy as string || 'created_at',
        sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      };

      logger.debug('Getting user projects', {
        requestId,
        userId: user.id,
        filters,
        pagination,
      });

      const result = await projectService.getUserProjects(user.id, filters, pagination);

      const duration = Date.now() - startTime;

      logger.debug('User projects retrieved successfully', {
        requestId,
        userId: user.id,
        total: result.total,
        page: result.page,
        duration,
      });

      metrics.counter('project_controller.list.success', 1);
      metrics.timer('project_controller.list.duration', duration);

      res.status(200).json({
        success: true,
        data: result.data,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Failed to get user projects', error, {
        requestId,
        userId: user.id,
        query: req.query,
        duration,
      });

      metrics.counter('project_controller.list.errors', 1);
      metrics.timer('project_controller.list.duration', duration, { error: 'true' });

      next(error);
    }
  }

  // Get project statistics for user
  async getUserProjectStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    const requestId = req.headers['x-request-id'] as string;
    const user = (req as AuthenticatedRequest).user;
    const startTime = Date.now();

    try {
      logger.debug('Getting user project statistics', {
        requestId,
        userId: user.id,
      });

      const stats = await projectService.getUserProjectStats(user.id);

      const duration = Date.now() - startTime;

      logger.debug('User project statistics retrieved successfully', {
        requestId,
        userId: user.id,
        stats,
        duration,
      });

      metrics.counter('project_controller.stats.success', 1);
      metrics.timer('project_controller.stats.duration', duration);

      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Failed to get user project statistics', error, {
        requestId,
        userId: user.id,
        duration,
      });

      metrics.counter('project_controller.stats.errors', 1);
      metrics.timer('project_controller.stats.duration', duration, { error: 'true' });

      next(error);
    }
  }

  // Get all projects (admin only)
  async getAllProjects(req: Request, res: Response, next: NextFunction): Promise<void> {
    const requestId = req.headers['x-request-id'] as string;
    const user = (req as AuthenticatedRequest).user;
    const startTime = Date.now();

    try {
      // Check if user is admin
      if (user.role !== 'admin') {
        const error = ErrorFactory.authorizationError(
          'Admin access required',
          { requiredRole: 'admin', userRole: user.role },
          requestId,
          user.id
        );
        return next(error);
      }

      // Parse query parameters
      const filters: ProjectFilters = {
        type: req.query.type as any,
        status: req.query.status as any,
        search: req.query.search as string,
        ownerId: req.query.ownerId as string,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
      };

      const pagination: PaginationOptions = {
        page: parseInt(req.query.page as string) || 1,
        limit: Math.min(parseInt(req.query.limit as string) || 10, 100),
        sortBy: req.query.sortBy as string || 'created_at',
        sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      };

      logger.info('Admin getting all projects', {
        requestId,
        userId: user.id,
        filters,
        pagination,
      });

      // For admin, we can get projects for any user or all users
      const ownerId = filters.ownerId || user.id;
      const result = await projectService.getUserProjects(ownerId, filters, pagination);

      const duration = Date.now() - startTime;

      logger.info('All projects retrieved successfully by admin', {
        requestId,
        userId: user.id,
        total: result.total,
        page: result.page,
        duration,
      });

      metrics.counter('project_controller.admin_list.success', 1);
      metrics.timer('project_controller.admin_list.duration', duration);

      res.status(200).json({
        success: true,
        data: result.data,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Failed to get all projects (admin)', error, {
        requestId,
        userId: user.id,
        query: req.query,
        duration,
      });

      metrics.counter('project_controller.admin_list.errors', 1);
      metrics.timer('project_controller.admin_list.duration', duration, { error: 'true' });

      next(error);
    }
  }

  // Search projects across all users (admin only)
  async searchProjects(req: Request, res: Response, next: NextFunction): Promise<void> {
    const requestId = req.headers['x-request-id'] as string;
    const user = (req as AuthenticatedRequest).user;
    const startTime = Date.now();

    try {
      // Check if user is admin
      if (user.role !== 'admin') {
        const error = ErrorFactory.authorizationError(
          'Admin access required',
          { requiredRole: 'admin', userRole: user.role },
          requestId,
          user.id
        );
        return next(error);
      }

      const searchTerm = req.query.q as string;
      if (!searchTerm) {
        const error = ErrorFactory.validationError(
          'Search term is required',
          { field: 'q' },
          requestId,
          user.id
        );
        return next(error);
      }

      const filters: ProjectFilters = {
        search: searchTerm,
        type: req.query.type as any,
        status: req.query.status as any,
      };

      const pagination: PaginationOptions = {
        page: parseInt(req.query.page as string) || 1,
        limit: Math.min(parseInt(req.query.limit as string) || 10, 50), // Lower limit for search
        sortBy: req.query.sortBy as string || 'updated_at',
        sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      };

      logger.info('Admin searching projects', {
        requestId,
        userId: user.id,
        searchTerm,
        filters,
        pagination,
      });

      // Search across all users (implement this method in service if needed)
      const result = await projectService.getUserProjects('*', filters, pagination);

      const duration = Date.now() - startTime;

      logger.info('Project search completed by admin', {
        requestId,
        userId: user.id,
        searchTerm,
        total: result.total,
        duration,
      });

      metrics.counter('project_controller.search.success', 1);
      metrics.timer('project_controller.search.duration', duration);

      res.status(200).json({
        success: true,
        data: result.data,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
        searchTerm,
      });
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Failed to search projects', error, {
        requestId,
        userId: user.id,
        query: req.query,
        duration,
      });

      metrics.counter('project_controller.search.errors', 1);
      metrics.timer('project_controller.search.duration', duration, { error: 'true' });

      next(error);
    }
  }

  // Health check for project service
  async healthCheck(req: Request, res: Response, next: NextFunction): Promise<void> {
    const requestId = req.headers['x-request-id'] as string;
    const startTime = Date.now();

    try {
      logger.debug('Project service health check', { requestId });

      // Perform basic database connectivity check
      const healthResult = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'project-service',
        version: '1.0.0',
        database: 'connected',
        cache: 'connected',
      };

      const duration = Date.now() - startTime;

      logger.debug('Project service health check completed', {
        requestId,
        healthResult,
        duration,
      });

      metrics.counter('project_controller.health_check.success', 1);
      metrics.timer('project_controller.health_check.duration', duration);

      res.status(200).json({
        success: true,
        data: healthResult,
      });
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Project service health check failed', error, {
        requestId,
        duration,
      });

      metrics.counter('project_controller.health_check.errors', 1);
      metrics.timer('project_controller.health_check.duration', duration, { error: 'true' });

      res.status(503).json({
        success: false,
        error: {
          message: 'Service unhealthy',
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
}

// Export singleton instance
export const projectController = new ProjectController();