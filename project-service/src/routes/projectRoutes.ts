import { Router } from 'express';
import { ProjectController } from '../controllers/projectController';
import { createAuthMiddleware, Permissions } from '../../shared/src/middleware/auth';
import { validate, commonRules } from '../../shared/src/middleware/validator';
import { rateLimitPresets } from '../../shared/src/middleware/rateLimiter';
import { projectValidationSchemas } from '../validators/projectSchemas';

export function createProjectRoutes(
  projectController: ProjectController,
  authSecretKey: string
): Router {
  const router = Router();
  const auth = createAuthMiddleware({ secretKey: authSecretKey });

  // Apply rate limiting to all project routes
  router.use(rateLimitPresets.api());

  /**
   * POST /api/projects
   * Create a new project
   */
  router.post(
    '/',
    auth.authenticate(),
    auth.requirePermissions([Permissions.CREATE_PROJECT]),
    validate.body(projectValidationSchemas.createProject),
    projectController.createProject
  );

  /**
   * GET /api/projects
   * List projects with filtering, sorting, and pagination
   */
  router.get(
    '/',
    auth.optionalAuth(),
    validate.query([
      commonRules.offset(),
      commonRules.limit(),
      commonRules.sort(['name', 'createdAt', 'updatedAt', 'priority', 'status']),
      {
        field: 'status',
        required: false,
        type: 'string',
        custom: (value: string) => {
          if (!value) return true;
          const validStatuses = ['draft', 'active', 'completed', 'archived', 'cancelled'];
          return validStatuses.includes(value) || `Status must be one of: ${validStatuses.join(', ')}`;
        }
      },
      {
        field: 'priority',
        required: false,
        type: 'string',
        custom: (value: string) => {
          if (!value) return true;
          const validPriorities = ['low', 'medium', 'high', 'critical'];
          return validPriorities.includes(value) || `Priority must be one of: ${validPriorities.join(', ')}`;
        }
      },
      {
        field: 'userId',
        required: false,
        type: 'uuid'
      },
      {
        field: 'tags',
        required: false,
        type: 'array'
      },
      commonRules.search()
    ]),
    projectController.listProjects
  );

  /**
   * GET /api/projects/search
   * Search projects by name or description
   */
  router.get(
    '/search',
    auth.optionalAuth(),
    validate.query([
      {
        field: 'q',
        required: true,
        type: 'string',
        minLength: 2,
        maxLength: 255,
        sanitize: (value: string) => value?.trim()
      },
      commonRules.offset(),
      commonRules.limit()
    ]),
    projectController.searchProjects
  );

  /**
   * GET /api/projects/stats
   * Get project statistics
   */
  router.get(
    '/stats',
    auth.authenticate(),
    projectController.getProjectStats
  );

  /**
   * GET /api/projects/:id
   * Get project by ID
   */
  router.get(
    '/:id',
    auth.optionalAuth(),
    validate.params([commonRules.id()]),
    projectController.getProject
  );

  /**
   * PUT /api/projects/:id
   * Update project
   */
  router.put(
    '/:id',
    auth.authenticate(),
    auth.requirePermissions([Permissions.UPDATE_PROJECT]),
    validate.params([commonRules.id()]),
    validate.body(projectValidationSchemas.updateProject),
    projectController.updateProject
  );

  /**
   * DELETE /api/projects/:id
   * Delete project
   */
  router.delete(
    '/:id',
    auth.authenticate(),
    auth.requirePermissions([Permissions.DELETE_PROJECT]),
    validate.params([commonRules.id()]),
    projectController.deleteProject
  );

  return router;
}

export function createUserProjectRoutes(
  projectController: ProjectController,
  authSecretKey: string
): Router {
  const router = Router();
  const auth = createAuthMiddleware({ secretKey: authSecretKey });

  // Apply rate limiting
  router.use(rateLimitPresets.api());

  /**
   * GET /api/users/:userId/projects
   * Get projects for a specific user
   */
  router.get(
    '/:userId/projects',
    auth.authenticate(),
    validate.params([
      {
        field: 'userId',
        required: true,
        type: 'uuid'
      }
    ]),
    validate.query([
      commonRules.offset(),
      commonRules.limit(),
      commonRules.sort(['name', 'createdAt', 'updatedAt', 'priority', 'status']),
      {
        field: 'status',
        required: false,
        type: 'string',
        custom: (value: string) => {
          if (!value) return true;
          const validStatuses = ['draft', 'active', 'completed', 'archived', 'cancelled'];
          return validStatuses.includes(value) || `Status must be one of: ${validStatuses.join(', ')}`;
        }
      },
      {
        field: 'priority',
        required: false,
        type: 'string',
        custom: (value: string) => {
          if (!value) return true;
          const validPriorities = ['low', 'medium', 'high', 'critical'];
          return validPriorities.includes(value) || `Priority must be one of: ${validPriorities.join(', ')}`;
        }
      },
      {
        field: 'tags',
        required: false,
        type: 'array'
      },
      commonRules.search()
    ]),
    projectController.getUserProjects
  );

  return router;
}

/**
 * Create all project-related routes
 */
export function createAllProjectRoutes(
  projectController: ProjectController,
  authSecretKey: string
): { projectRoutes: Router; userProjectRoutes: Router } {
  return {
    projectRoutes: createProjectRoutes(projectController, authSecretKey),
    userProjectRoutes: createUserProjectRoutes(projectController, authSecretKey)
  };
}

/**
 * Route configuration for project endpoints
 */
export const PROJECT_ROUTES = {
  // Project CRUD operations
  CREATE_PROJECT: 'POST /api/projects',
  LIST_PROJECTS: 'GET /api/projects',
  GET_PROJECT: 'GET /api/projects/:id',
  UPDATE_PROJECT: 'PUT /api/projects/:id',
  DELETE_PROJECT: 'DELETE /api/projects/:id',
  
  // Search and statistics
  SEARCH_PROJECTS: 'GET /api/projects/search',
  PROJECT_STATS: 'GET /api/projects/stats',
  
  // User-specific project routes
  USER_PROJECTS: 'GET /api/users/:userId/projects'
} as const;