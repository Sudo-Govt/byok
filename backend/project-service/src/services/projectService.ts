import { db, QueryResult } from '../../shared/src/utils/database';
import { cache, cacheUtils } from '../../shared/src/utils/cache';
import { logger } from '../../shared/src/utils/logger';
import { metrics } from '../../shared/src/utils/metrics';
import { ApiError, ErrorFactory } from '../../shared/src/utils/ApiError';

// Project interfaces
export interface Project {
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

export interface CreateProjectData {
  name: string;
  description?: string;
  type: 'web' | 'mobile' | 'desktop' | 'api';
  status?: 'planning' | 'active' | 'completed' | 'cancelled';
  startDate?: Date;
  endDate?: Date;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface UpdateProjectData {
  name?: string;
  description?: string;
  type?: 'web' | 'mobile' | 'desktop' | 'api';
  status?: 'planning' | 'active' | 'completed' | 'cancelled';
  startDate?: Date;
  endDate?: Date;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface ProjectFilters {
  type?: 'web' | 'mobile' | 'desktop' | 'api';
  status?: 'planning' | 'active' | 'completed' | 'cancelled';
  tags?: string[];
  search?: string;
  ownerId?: string;
  startDateFrom?: Date;
  startDateTo?: Date;
  endDateFrom?: Date;
  endDateTo?: Date;
}

export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Project service class
export class ProjectService {
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly CACHE_PREFIX = 'project';

  // Create a new project
  async createProject(ownerId: string, projectData: CreateProjectData): Promise<Project> {
    const startTime = Date.now();
    
    try {
      logger.info('Creating new project', {
        ownerId,
        projectName: projectData.name,
        projectType: projectData.type,
      });

      const project = await db.transaction(async (trx) => {
        // Check if project name already exists for this user
        const existingProject = await trx.query(
          'SELECT id FROM projects WHERE name = $1 AND owner_id = $2',
          [projectData.name, ownerId]
        );

        if (existingProject.rowCount > 0) {
          throw ErrorFactory.conflictError(
            'A project with this name already exists'
          );
        }

        // Insert new project
        const result = await trx.query<Project>(
          `INSERT INTO projects (
            id, name, description, type, status, owner_id, 
            start_date, end_date, tags, metadata, created_at, updated_at
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()
          ) RETURNING *`,
          [
            projectData.name,
            projectData.description || null,
            projectData.type,
            projectData.status || 'planning',
            ownerId,
            projectData.startDate || null,
            projectData.endDate || null,
            JSON.stringify(projectData.tags || []),
            JSON.stringify(projectData.metadata || {}),
          ]
        );

        return result.rows[0];
      });

      // Invalidate user's project cache
      await this.invalidateUserProjectsCache(ownerId);

      const duration = Date.now() - startTime;
      
      logger.info('Project created successfully', {
        projectId: project.id,
        ownerId,
        duration,
      });

      metrics.counter('projects.created', 1, { type: project.type });
      metrics.timer('projects.create.duration', duration);

      return this.formatProject(project);
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Failed to create project', error, {
        ownerId,
        projectData,
        duration,
      });

      metrics.counter('projects.create.errors', 1);
      metrics.timer('projects.create.duration', duration, { error: 'true' });

      if (error instanceof ApiError) {
        throw error;
      }

      throw ErrorFactory.databaseError(
        'create_project',
        'Failed to create project',
        { ownerId, projectData }
      );
    }
  }

  // Get project by ID
  async getProjectById(projectId: string, userId?: string): Promise<Project | null> {
    const startTime = Date.now();
    const cacheKey = cacheUtils.generateKey(this.CACHE_PREFIX, 'id', projectId);

    try {
      // Try to get from cache first
      const cached = await cache.get<Project>(cacheKey);
      if (cached) {
        metrics.counter('projects.get.cache_hit', 1);
        return cached;
      }

      const result = await db.query<Project>(
        'SELECT * FROM projects WHERE id = $1',
        [projectId]
      );

      if (result.rowCount === 0) {
        metrics.counter('projects.get.not_found', 1);
        return null;
      }

      const project = this.formatProject(result.rows[0]);

      // Cache the result
      await cache.set(cacheKey, project, this.CACHE_TTL);

      const duration = Date.now() - startTime;
      
      logger.debug('Project retrieved by ID', {
        projectId,
        userId,
        duration,
      });

      metrics.counter('projects.get.success', 1);
      metrics.timer('projects.get.duration', duration);

      return project;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Failed to get project by ID', error, {
        projectId,
        userId,
        duration,
      });

      metrics.counter('projects.get.errors', 1);
      metrics.timer('projects.get.duration', duration, { error: 'true' });

      throw ErrorFactory.databaseError(
        'get_project',
        'Failed to retrieve project',
        { projectId, userId }
      );
    }
  }

  // Update project
  async updateProject(projectId: string, ownerId: string, updateData: UpdateProjectData): Promise<Project> {
    const startTime = Date.now();

    try {
      logger.info('Updating project', {
        projectId,
        ownerId,
        updateData,
      });

      const project = await db.transaction(async (trx) => {
        // Check if project exists and user owns it
        const existingProject = await trx.query(
          'SELECT * FROM projects WHERE id = $1 AND owner_id = $2',
          [projectId, ownerId]
        );

        if (existingProject.rowCount === 0) {
          throw ErrorFactory.notFoundError('Project');
        }

        // Check for name conflicts if name is being updated
        if (updateData.name) {
          const nameConflict = await trx.query(
            'SELECT id FROM projects WHERE name = $1 AND owner_id = $2 AND id != $3',
            [updateData.name, ownerId, projectId]
          );

          if (nameConflict.rowCount > 0) {
            throw ErrorFactory.conflictError(
              'A project with this name already exists'
            );
          }
        }

        // Build update query dynamically
        const updateFields: string[] = [];
        const updateValues: any[] = [];
        let paramIndex = 1;

        if (updateData.name !== undefined) {
          updateFields.push(`name = $${paramIndex++}`);
          updateValues.push(updateData.name);
        }

        if (updateData.description !== undefined) {
          updateFields.push(`description = $${paramIndex++}`);
          updateValues.push(updateData.description);
        }

        if (updateData.type !== undefined) {
          updateFields.push(`type = $${paramIndex++}`);
          updateValues.push(updateData.type);
        }

        if (updateData.status !== undefined) {
          updateFields.push(`status = $${paramIndex++}`);
          updateValues.push(updateData.status);
        }

        if (updateData.startDate !== undefined) {
          updateFields.push(`start_date = $${paramIndex++}`);
          updateValues.push(updateData.startDate);
        }

        if (updateData.endDate !== undefined) {
          updateFields.push(`end_date = $${paramIndex++}`);
          updateValues.push(updateData.endDate);
        }

        if (updateData.tags !== undefined) {
          updateFields.push(`tags = $${paramIndex++}`);
          updateValues.push(JSON.stringify(updateData.tags));
        }

        if (updateData.metadata !== undefined) {
          updateFields.push(`metadata = $${paramIndex++}`);
          updateValues.push(JSON.stringify(updateData.metadata));
        }

        // Always update the updated_at timestamp
        updateFields.push(`updated_at = NOW()`);

        // Add WHERE clause parameters
        updateValues.push(projectId, ownerId);

        const query = `
          UPDATE projects 
          SET ${updateFields.join(', ')} 
          WHERE id = $${paramIndex++} AND owner_id = $${paramIndex++}
          RETURNING *
        `;

        const result = await trx.query<Project>(query, updateValues);
        return result.rows[0];
      });

      // Invalidate cache
      await this.invalidateProjectCache(projectId);
      await this.invalidateUserProjectsCache(ownerId);

      const duration = Date.now() - startTime;
      
      logger.info('Project updated successfully', {
        projectId,
        ownerId,
        duration,
      });

      metrics.counter('projects.updated', 1);
      metrics.timer('projects.update.duration', duration);

      return this.formatProject(project);
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Failed to update project', error, {
        projectId,
        ownerId,
        updateData,
        duration,
      });

      metrics.counter('projects.update.errors', 1);
      metrics.timer('projects.update.duration', duration, { error: 'true' });

      if (error instanceof ApiError) {
        throw error;
      }

      throw ErrorFactory.databaseError(
        'update_project',
        'Failed to update project',
        { projectId, ownerId, updateData }
      );
    }
  }

  // Delete project
  async deleteProject(projectId: string, ownerId: string): Promise<void> {
    const startTime = Date.now();

    try {
      logger.info('Deleting project', {
        projectId,
        ownerId,
      });

      await db.transaction(async (trx) => {
        // Check if project exists and user owns it
        const existingProject = await trx.query(
          'SELECT * FROM projects WHERE id = $1 AND owner_id = $2',
          [projectId, ownerId]
        );

        if (existingProject.rowCount === 0) {
          throw ErrorFactory.notFoundError('Project');
        }

        // Delete the project
        await trx.query(
          'DELETE FROM projects WHERE id = $1 AND owner_id = $2',
          [projectId, ownerId]
        );
      });

      // Invalidate cache
      await this.invalidateProjectCache(projectId);
      await this.invalidateUserProjectsCache(ownerId);

      const duration = Date.now() - startTime;
      
      logger.info('Project deleted successfully', {
        projectId,
        ownerId,
        duration,
      });

      metrics.counter('projects.deleted', 1);
      metrics.timer('projects.delete.duration', duration);
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Failed to delete project', error, {
        projectId,
        ownerId,
        duration,
      });

      metrics.counter('projects.delete.errors', 1);
      metrics.timer('projects.delete.duration', duration, { error: 'true' });

      if (error instanceof ApiError) {
        throw error;
      }

      throw ErrorFactory.databaseError(
        'delete_project',
        'Failed to delete project',
        { projectId, ownerId }
      );
    }
  }

  // Get projects for user with pagination and filtering
  async getUserProjects(
    ownerId: string,
    filters: ProjectFilters = {},
    pagination: PaginationOptions = { page: 1, limit: 10 }
  ): Promise<PaginatedResult<Project>> {
    const startTime = Date.now();
    const cacheKey = cacheUtils.generateKey(
      this.CACHE_PREFIX,
      'user',
      ownerId,
      JSON.stringify(filters),
      JSON.stringify(pagination)
    );

    try {
      // Try to get from cache first
      const cached = await cache.get<PaginatedResult<Project>>(cacheKey);
      if (cached) {
        metrics.counter('projects.list.cache_hit', 1);
        return cached;
      }

      // Build query with filters
      const { query, params } = this.buildFilterQuery(ownerId, filters, pagination);
      
      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM projects WHERE owner_id = $1${this.buildWhereClause(filters)}`;
      const countParams = [ownerId, ...this.buildFilterParams(filters)];
      const countResult = await db.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].total);

      // Get paginated data
      const result = await db.query<Project>(query, params);
      const projects = result.rows.map(project => this.formatProject(project));

      const paginatedResult: PaginatedResult<Project> = {
        data: projects,
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.ceil(total / pagination.limit),
      };

      // Cache the result
      await cache.set(cacheKey, paginatedResult, this.CACHE_TTL);

      const duration = Date.now() - startTime;
      
      logger.debug('User projects retrieved', {
        ownerId,
        total,
        page: pagination.page,
        duration,
      });

      metrics.counter('projects.list.success', 1);
      metrics.timer('projects.list.duration', duration);

      return paginatedResult;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Failed to get user projects', error, {
        ownerId,
        filters,
        pagination,
        duration,
      });

      metrics.counter('projects.list.errors', 1);
      metrics.timer('projects.list.duration', duration, { error: 'true' });

      throw ErrorFactory.databaseError(
        'get_user_projects',
        'Failed to retrieve user projects',
        { ownerId, filters, pagination }
      );
    }
  }

  // Get project statistics for user
  async getUserProjectStats(ownerId: string): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
  }> {
    const startTime = Date.now();
    const cacheKey = cacheUtils.generateKey(this.CACHE_PREFIX, 'stats', ownerId);

    try {
      // Try to get from cache first
      const cached = await cache.get(cacheKey);
      if (cached) {
        metrics.counter('projects.stats.cache_hit', 1);
        return cached;
      }

      const [totalResult, statusResult, typeResult] = await Promise.all([
        db.query('SELECT COUNT(*) as total FROM projects WHERE owner_id = $1', [ownerId]),
        db.query(
          'SELECT status, COUNT(*) as count FROM projects WHERE owner_id = $1 GROUP BY status',
          [ownerId]
        ),
        db.query(
          'SELECT type, COUNT(*) as count FROM projects WHERE owner_id = $1 GROUP BY type',
          [ownerId]
        ),
      ]);

      const stats = {
        total: parseInt(totalResult.rows[0].total),
        byStatus: statusResult.rows.reduce((acc, row) => {
          acc[row.status] = parseInt(row.count);
          return acc;
        }, {} as Record<string, number>),
        byType: typeResult.rows.reduce((acc, row) => {
          acc[row.type] = parseInt(row.count);
          return acc;
        }, {} as Record<string, number>),
      };

      // Cache the result
      await cache.set(cacheKey, stats, this.CACHE_TTL);

      const duration = Date.now() - startTime;
      
      logger.debug('User project stats retrieved', {
        ownerId,
        stats,
        duration,
      });

      metrics.counter('projects.stats.success', 1);
      metrics.timer('projects.stats.duration', duration);

      return stats;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Failed to get user project stats', error, {
        ownerId,
        duration,
      });

      metrics.counter('projects.stats.errors', 1);
      metrics.timer('projects.stats.duration', duration, { error: 'true' });

      throw ErrorFactory.databaseError(
        'get_project_stats',
        'Failed to retrieve project statistics',
        { ownerId }
      );
    }
  }

  // Helper methods
  private formatProject(project: any): Project {
    return {
      ...project,
      tags: typeof project.tags === 'string' ? JSON.parse(project.tags) : project.tags,
      metadata: typeof project.metadata === 'string' ? JSON.parse(project.metadata) : project.metadata,
      createdAt: new Date(project.created_at || project.createdAt),
      updatedAt: new Date(project.updated_at || project.updatedAt),
      startDate: project.start_date ? new Date(project.start_date) : undefined,
      endDate: project.end_date ? new Date(project.end_date) : undefined,
    };
  }

  private buildFilterQuery(ownerId: string, filters: ProjectFilters, pagination: PaginationOptions) {
    const whereClause = this.buildWhereClause(filters);
    const orderClause = this.buildOrderClause(pagination);
    const limitClause = `LIMIT $${this.getNextParamIndex(ownerId, filters)} OFFSET $${this.getNextParamIndex(ownerId, filters) + 1}`;

    const query = `
      SELECT * FROM projects 
      WHERE owner_id = $1${whereClause}
      ${orderClause}
      ${limitClause}
    `;

    const params = [
      ownerId,
      ...this.buildFilterParams(filters),
      pagination.limit,
      (pagination.page - 1) * pagination.limit,
    ];

    return { query, params };
  }

  private buildWhereClause(filters: ProjectFilters): string {
    const conditions: string[] = [];
    let paramIndex = 2; // Start at 2 because $1 is owner_id

    if (filters.type) {
      conditions.push(`type = $${paramIndex++}`);
    }

    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
    }

    if (filters.search) {
      conditions.push(`(name ILIKE $${paramIndex++} OR description ILIKE $${paramIndex++})`);
    }

    if (filters.startDateFrom) {
      conditions.push(`start_date >= $${paramIndex++}`);
    }

    if (filters.startDateTo) {
      conditions.push(`start_date <= $${paramIndex++}`);
    }

    if (filters.endDateFrom) {
      conditions.push(`end_date >= $${paramIndex++}`);
    }

    if (filters.endDateTo) {
      conditions.push(`end_date <= $${paramIndex++}`);
    }

    return conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : '';
  }

  private buildFilterParams(filters: ProjectFilters): any[] {
    const params: any[] = [];

    if (filters.type) params.push(filters.type);
    if (filters.status) params.push(filters.status);
    if (filters.search) {
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }
    if (filters.startDateFrom) params.push(filters.startDateFrom);
    if (filters.startDateTo) params.push(filters.startDateTo);
    if (filters.endDateFrom) params.push(filters.endDateFrom);
    if (filters.endDateTo) params.push(filters.endDateTo);

    return params;
  }

  private buildOrderClause(pagination: PaginationOptions): string {
    const sortBy = pagination.sortBy || 'created_at';
    const sortOrder = pagination.sortOrder || 'desc';
    return `ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;
  }

  private getNextParamIndex(ownerId: string, filters: ProjectFilters): number {
    return 1 + this.buildFilterParams(filters).length + 1;
  }

  private async invalidateProjectCache(projectId: string): Promise<void> {
    const cacheKey = cacheUtils.generateKey(this.CACHE_PREFIX, 'id', projectId);
    await cache.del(cacheKey);
  }

  private async invalidateUserProjectsCache(ownerId: string): Promise<void> {
    const pattern = cacheUtils.generateKey(this.CACHE_PREFIX, 'user', ownerId, '*');
    await cacheUtils.invalidatePattern(pattern);
    
    const statsKey = cacheUtils.generateKey(this.CACHE_PREFIX, 'stats', ownerId);
    await cache.del(statsKey);
  }
}

// Export singleton instance
export const projectService = new ProjectService();