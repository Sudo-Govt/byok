import { DatabaseConnection, QueryResult } from '../../shared/src/utils/database';
import { ApiError } from '../../shared/src/utils/ApiError';
import { logger } from '../../shared/src/utils/logger';
import { cacheManager } from '../../shared/src/utils/cache';

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  tags?: string[];
  metadata?: Record<string, any>;
}

export enum ProjectStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  ARCHIVED = 'archived',
  CANCELLED = 'cancelled'
}

export enum ProjectPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface CreateProjectData {
  name: string;
  description?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  userId: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface UpdateProjectData {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface ProjectFilters {
  status?: ProjectStatus;
  priority?: ProjectPriority;
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

export interface ProjectListResult {
  projects: Project[];
  total: number;
  offset: number;
  limit: number;
}

export class ProjectService {
  private db: DatabaseConnection;
  private cache = cacheManager.getCache<Project>('projects', { ttl: 300 }); // 5 minutes TTL

  constructor(database: DatabaseConnection) {
    this.db = database;
  }

  /**
   * Create a new project
   */
  async createProject(data: CreateProjectData): Promise<Project> {
    try {
      logger.info('Creating new project', { projectName: data.name, userId: data.userId });

      const projectId = this.generateId();
      const now = new Date();

      const project: Project = {
        id: projectId,
        name: data.name,
        description: data.description,
        status: data.status || ProjectStatus.DRAFT,
        priority: data.priority || ProjectPriority.MEDIUM,
        userId: data.userId,
        createdAt: now,
        updatedAt: now,
        tags: data.tags || [],
        metadata: data.metadata || {}
      };

      const result = await this.db.query(
        'INSERT INTO projects (id, name, description, status, priority, user_id, created_at, updated_at, tags, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          project.id,
          project.name,
          project.description,
          project.status,
          project.priority,
          project.userId,
          project.createdAt,
          project.updatedAt,
          JSON.stringify(project.tags),
          JSON.stringify(project.metadata)
        ]
      );

      // Cache the new project
      this.cache.set(`project:${project.id}`, project);
      this.invalidateUserProjectsCache(project.userId);

      logger.info('Project created successfully', { projectId: project.id });
      return project;
    } catch (error) {
      logger.error('Failed to create project', { error: error.message, data });
      throw ApiError.internalServerError('Failed to create project');
    }
  }

  /**
   * Get project by ID
   */
  async getProjectById(id: string, userId?: string): Promise<Project> {
    try {
      // Check cache first
      const cacheKey = `project:${id}`;
      let project = this.cache.get(cacheKey);

      if (!project) {
        const result = await this.db.query<Project>(
          'SELECT * FROM projects WHERE id = ?',
          [id]
        );

        if (result.rows.length === 0) {
          throw ApiError.notFound('Project not found');
        }

        project = this.mapDatabaseRowToProject(result.rows[0]);
        this.cache.set(cacheKey, project);
      }

      // Check ownership if userId is provided
      if (userId && project.userId !== userId) {
        throw ApiError.forbidden('You do not have access to this project');
      }

      return project;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      logger.error('Failed to get project', { error: error.message, projectId: id });
      throw ApiError.internalServerError('Failed to retrieve project');
    }
  }

  /**
   * Update project
   */
  async updateProject(id: string, data: UpdateProjectData, userId?: string): Promise<Project> {
    try {
      // First check if project exists and user has access
      const existingProject = await this.getProjectById(id, userId);

      const updatedProject: Project = {
        ...existingProject,
        ...data,
        updatedAt: new Date()
      };

      await this.db.query(
        'UPDATE projects SET name = ?, description = ?, status = ?, priority = ?, tags = ?, metadata = ?, updated_at = ? WHERE id = ?',
        [
          updatedProject.name,
          updatedProject.description,
          updatedProject.status,
          updatedProject.priority,
          JSON.stringify(updatedProject.tags),
          JSON.stringify(updatedProject.metadata),
          updatedProject.updatedAt,
          id
        ]
      );

      // Update cache
      this.cache.set(`project:${id}`, updatedProject);
      this.invalidateUserProjectsCache(updatedProject.userId);

      logger.info('Project updated successfully', { projectId: id });
      return updatedProject;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      logger.error('Failed to update project', { error: error.message, projectId: id });
      throw ApiError.internalServerError('Failed to update project');
    }
  }

  /**
   * Delete project
   */
  async deleteProject(id: string, userId?: string): Promise<void> {
    try {
      // First check if project exists and user has access
      const project = await this.getProjectById(id, userId);

      await this.db.query('DELETE FROM projects WHERE id = ?', [id]);

      // Remove from cache
      this.cache.delete(`project:${id}`);
      this.invalidateUserProjectsCache(project.userId);

      logger.info('Project deleted successfully', { projectId: id });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      logger.error('Failed to delete project', { error: error.message, projectId: id });
      throw ApiError.internalServerError('Failed to delete project');
    }
  }

  /**
   * List projects with filtering, sorting, and pagination
   */
  async listProjects(
    filters: ProjectFilters = {},
    sort: ProjectSortOptions = { field: 'createdAt', direction: 'desc' },
    pagination: PaginationOptions = { offset: 0, limit: 10 }
  ): Promise<ProjectListResult> {
    try {
      const cacheKey = `projects:list:${JSON.stringify({ filters, sort, pagination })}`;
      let result = this.cache.get(cacheKey);

      if (!result) {
        const { whereClause, params } = this.buildWhereClause(filters);
        const orderClause = `ORDER BY ${sort.field} ${sort.direction.toUpperCase()}`;
        const limitClause = `LIMIT ${pagination.limit} OFFSET ${pagination.offset}`;

        // Get total count
        const countResult = await this.db.query<{ count: number }>(
          `SELECT COUNT(*) as count FROM projects ${whereClause}`,
          params
        );
        const total = countResult.rows[0].count;

        // Get projects
        const projectsResult = await this.db.query<Project>(
          `SELECT * FROM projects ${whereClause} ${orderClause} ${limitClause}`,
          params
        );

        const projects = projectsResult.rows.map(row => this.mapDatabaseRowToProject(row));

        result = {
          projects,
          total,
          offset: pagination.offset,
          limit: pagination.limit
        };

        // Cache for 1 minute
        this.cache.set(cacheKey, result, 60);
      }

      return result;
    } catch (error) {
      logger.error('Failed to list projects', { error: error.message, filters });
      throw ApiError.internalServerError('Failed to retrieve projects');
    }
  }

  /**
   * Get projects by user ID
   */
  async getProjectsByUserId(
    userId: string,
    filters: Omit<ProjectFilters, 'userId'> = {},
    sort: ProjectSortOptions = { field: 'createdAt', direction: 'desc' },
    pagination: PaginationOptions = { offset: 0, limit: 10 }
  ): Promise<ProjectListResult> {
    return this.listProjects({ ...filters, userId }, sort, pagination);
  }

  /**
   * Search projects by name or description
   */
  async searchProjects(
    searchTerm: string,
    userId?: string,
    pagination: PaginationOptions = { offset: 0, limit: 10 }
  ): Promise<ProjectListResult> {
    const filters: ProjectFilters = { search: searchTerm };
    if (userId) {
      filters.userId = userId;
    }

    return this.listProjects(filters, { field: 'name', direction: 'asc' }, pagination);
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Map database row to Project object
   */
  private mapDatabaseRowToProject(row: any): Project {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      priority: row.priority,
      userId: row.user_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      tags: row.tags ? JSON.parse(row.tags) : [],
      metadata: row.metadata ? JSON.parse(row.metadata) : {}
    };
  }

  /**
   * Build WHERE clause for filtering
   */
  private buildWhereClause(filters: ProjectFilters): { whereClause: string; params: any[] } {
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.userId) {
      conditions.push('user_id = ?');
      params.push(filters.userId);
    }

    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }

    if (filters.priority) {
      conditions.push('priority = ?');
      params.push(filters.priority);
    }

    if (filters.search) {
      conditions.push('(name LIKE ? OR description LIKE ?)');
      const searchPattern = `%${filters.search}%`;
      params.push(searchPattern, searchPattern);
    }

    if (filters.tags && filters.tags.length > 0) {
      const tagConditions = filters.tags.map(() => 'tags LIKE ?');
      conditions.push(`(${tagConditions.join(' OR ')})`);
      filters.tags.forEach(tag => params.push(`%"${tag}"%`));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, params };
  }

  /**
   * Invalidate user projects cache
   */
  private invalidateUserProjectsCache(userId: string): void {
    // This is a simplified approach - in production, you'd want more sophisticated cache invalidation
    const keys = this.cache.keys();
    keys.forEach(key => {
      if (key.includes('projects:list') && key.includes(userId)) {
        this.cache.delete(key);
      }
    });
  }
}