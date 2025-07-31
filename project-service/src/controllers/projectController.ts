import { Request, Response, NextFunction } from 'express';
import { ProjectService, CreateProjectData, UpdateProjectData, ProjectFilters, ProjectSortOptions, PaginationOptions } from '../services/projectService';
import { AuthenticatedRequest } from '../../shared/src/middleware/auth';
import { ApiError } from '../../shared/src/utils/ApiError';
import { logger } from '../../shared/src/utils/logger';
import { metrics } from '../../shared/src/utils/metrics';

export class ProjectController {
  private projectService: ProjectService;

  constructor(projectService: ProjectService) {
    this.projectService = projectService;
  }

  /**
   * Create a new project
   * POST /api/projects
   */
  public createProject = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const timer = Date.now();
      metrics.counter('project.create.attempts').increment();

      if (!req.user) {
        throw ApiError.unauthorized('Authentication required');
      }

      const createData: CreateProjectData = {
        ...req.body,
        userId: req.user.userId
      };

      const project = await this.projectService.createProject(createData);

      metrics.counter('project.create.success').increment();
      metrics.histogram('project.create.duration').record(Date.now() - timer);

      logger.info('Project created via API', {
        projectId: project.id,
        userId: req.user.userId,
        projectName: project.name
      });

      res.status(201).json({
        success: true,
        data: project
      });
    } catch (error) {
      metrics.counter('project.create.errors').increment();
      next(error);
    }
  };

  /**
   * Get project by ID
   * GET /api/projects/:id
   */
  public getProject = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const timer = Date.now();
      metrics.counter('project.get.attempts').increment();

      const { id } = req.params;
      const userId = req.user?.userId;

      const project = await this.projectService.getProjectById(id, userId);

      metrics.counter('project.get.success').increment();
      metrics.histogram('project.get.duration').record(Date.now() - timer);

      res.json({
        success: true,
        data: project
      });
    } catch (error) {
      metrics.counter('project.get.errors').increment();
      next(error);
    }
  };

  /**
   * Update project
   * PUT /api/projects/:id
   */
  public updateProject = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const timer = Date.now();
      metrics.counter('project.update.attempts').increment();

      if (!req.user) {
        throw ApiError.unauthorized('Authentication required');
      }

      const { id } = req.params;
      const updateData: UpdateProjectData = req.body;

      const project = await this.projectService.updateProject(id, updateData, req.user.userId);

      metrics.counter('project.update.success').increment();
      metrics.histogram('project.update.duration').record(Date.now() - timer);

      logger.info('Project updated via API', {
        projectId: id,
        userId: req.user.userId
      });

      res.json({
        success: true,
        data: project
      });
    } catch (error) {
      metrics.counter('project.update.errors').increment();
      next(error);
    }
  };

  /**
   * Delete project
   * DELETE /api/projects/:id
   */
  public deleteProject = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const timer = Date.now();
      metrics.counter('project.delete.attempts').increment();

      if (!req.user) {
        throw ApiError.unauthorized('Authentication required');
      }

      const { id } = req.params;

      await this.projectService.deleteProject(id, req.user.userId);

      metrics.counter('project.delete.success').increment();
      metrics.histogram('project.delete.duration').record(Date.now() - timer);

      logger.info('Project deleted via API', {
        projectId: id,
        userId: req.user.userId
      });

      res.status(204).send();
    } catch (error) {
      metrics.counter('project.delete.errors').increment();
      next(error);
    }
  };

  /**
   * List projects with filtering, sorting, and pagination
   * GET /api/projects
   */
  public listProjects = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const timer = Date.now();
      metrics.counter('project.list.attempts').increment();

      // Extract query parameters
      const filters: ProjectFilters = {
        status: req.query.status as any,
        priority: req.query.priority as any,
        userId: req.query.userId as string,
        tags: req.query.tags ? (Array.isArray(req.query.tags) ? req.query.tags as string[] : [req.query.tags as string]) : undefined,
        search: req.query.search as string
      };

      // If not admin, filter by current user
      if (req.user && req.user.role !== 'admin') {
        filters.userId = req.user.userId;
      }

      const sort: ProjectSortOptions = {
        field: (req.query.sortBy as any) || 'createdAt',
        direction: (req.query.sortOrder as any) || 'desc'
      };

      const pagination: PaginationOptions = {
        offset: parseInt(req.query.offset as string) || 0,
        limit: Math.min(parseInt(req.query.limit as string) || 10, 100) // Max 100 items
      };

      const result = await this.projectService.listProjects(filters, sort, pagination);

      metrics.counter('project.list.success').increment();
      metrics.histogram('project.list.duration').record(Date.now() - timer);
      metrics.gauge('project.list.result_count').set(result.projects.length);

      res.json({
        success: true,
        data: result.projects,
        pagination: {
          total: result.total,
          offset: result.offset,
          limit: result.limit,
          hasMore: result.offset + result.limit < result.total
        }
      });
    } catch (error) {
      metrics.counter('project.list.errors').increment();
      next(error);
    }
  };

  /**
   * Get user's projects
   * GET /api/users/:userId/projects
   */
  public getUserProjects = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const timer = Date.now();
      metrics.counter('project.user_projects.attempts').increment();

      const { userId } = req.params;

      // Check if user can access other user's projects
      if (req.user && req.user.userId !== userId && req.user.role !== 'admin') {
        throw ApiError.forbidden('You can only access your own projects');
      }

      const filters: Omit<ProjectFilters, 'userId'> = {
        status: req.query.status as any,
        priority: req.query.priority as any,
        tags: req.query.tags ? (Array.isArray(req.query.tags) ? req.query.tags as string[] : [req.query.tags as string]) : undefined,
        search: req.query.search as string
      };

      const sort: ProjectSortOptions = {
        field: (req.query.sortBy as any) || 'createdAt',
        direction: (req.query.sortOrder as any) || 'desc'
      };

      const pagination: PaginationOptions = {
        offset: parseInt(req.query.offset as string) || 0,
        limit: Math.min(parseInt(req.query.limit as string) || 10, 100)
      };

      const result = await this.projectService.getProjectsByUserId(userId, filters, sort, pagination);

      metrics.counter('project.user_projects.success').increment();
      metrics.histogram('project.user_projects.duration').record(Date.now() - timer);

      res.json({
        success: true,
        data: result.projects,
        pagination: {
          total: result.total,
          offset: result.offset,
          limit: result.limit,
          hasMore: result.offset + result.limit < result.total
        }
      });
    } catch (error) {
      metrics.counter('project.user_projects.errors').increment();
      next(error);
    }
  };

  /**
   * Search projects
   * GET /api/projects/search
   */
  public searchProjects = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const timer = Date.now();
      metrics.counter('project.search.attempts').increment();

      const { q: searchTerm } = req.query;

      if (!searchTerm || typeof searchTerm !== 'string') {
        throw ApiError.badRequest('Search term is required');
      }

      if (searchTerm.length < 2) {
        throw ApiError.badRequest('Search term must be at least 2 characters long');
      }

      const pagination: PaginationOptions = {
        offset: parseInt(req.query.offset as string) || 0,
        limit: Math.min(parseInt(req.query.limit as string) || 10, 100)
      };

      // If not admin, only search user's projects
      const userId = req.user && req.user.role !== 'admin' ? req.user.userId : undefined;

      const result = await this.projectService.searchProjects(searchTerm, userId, pagination);

      metrics.counter('project.search.success').increment();
      metrics.histogram('project.search.duration').record(Date.now() - timer);
      metrics.gauge('project.search.result_count').set(result.projects.length);

      logger.info('Project search performed', {
        searchTerm,
        userId: req.user?.userId,
        resultCount: result.projects.length
      });

      res.json({
        success: true,
        data: result.projects,
        pagination: {
          total: result.total,
          offset: result.offset,
          limit: result.limit,
          hasMore: result.offset + result.limit < result.total
        },
        query: {
          searchTerm
        }
      });
    } catch (error) {
      metrics.counter('project.search.errors').increment();
      next(error);
    }
  };

  /**
   * Get project statistics
   * GET /api/projects/stats
   */
  public getProjectStats = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const timer = Date.now();
      metrics.counter('project.stats.attempts').increment();

      // Only allow authenticated users to view stats
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required');
      }

      // If not admin, only show user's project stats
      const userId = req.user.role !== 'admin' ? req.user.userId : undefined;

      // Get projects by status
      const statusCounts = {
        draft: 0,
        active: 0,
        completed: 0,
        archived: 0,
        cancelled: 0
      };

      const priorityCounts = {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0
      };

      // This is a simplified implementation - in a real scenario, you'd do this with database aggregation
      for (const status of Object.keys(statusCounts)) {
        const result = await this.projectService.listProjects(
          { status: status as any, userId },
          { field: 'createdAt', direction: 'desc' },
          { offset: 0, limit: 1 }
        );
        (statusCounts as any)[status] = result.total;
      }

      for (const priority of Object.keys(priorityCounts)) {
        const result = await this.projectService.listProjects(
          { priority: priority as any, userId },
          { field: 'createdAt', direction: 'desc' },
          { offset: 0, limit: 1 }
        );
        (priorityCounts as any)[priority] = result.total;
      }

      const totalProjects = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);

      metrics.counter('project.stats.success').increment();
      metrics.histogram('project.stats.duration').record(Date.now() - timer);

      res.json({
        success: true,
        data: {
          total: totalProjects,
          byStatus: statusCounts,
          byPriority: priorityCounts,
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      metrics.counter('project.stats.errors').increment();
      next(error);
    }
  };
}