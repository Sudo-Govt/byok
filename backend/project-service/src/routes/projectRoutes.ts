import { Router } from 'express';
import { projectController } from '../controllers/projectController';
import { authenticate, authorize, adminOnly } from '../../shared/src/middleware/auth';
import { validateBody, validateQuery, validateParams } from '../../shared/src/middleware/validator';
import { rateLimiterMiddleware } from '../../shared/src/middleware/rateLimiter';
import { projectValidators } from '../validators/projectValidator';

// Create router instance
const router = Router();

// Apply authentication middleware to all routes
router.use(authenticate({ required: true }));

// Apply rate limiting
router.use(rateLimiterMiddleware.perUser);

// Project routes

/**
 * POST /projects
 * Create a new project
 * - Requires authentication
 * - Validates request body
 * - Rate limited per user
 */
router.post(
  '/',
  validateBody(projectValidators.create),
  projectController.createProject
);

/**
 * GET /projects
 * Get user's projects with pagination and filtering
 * - Requires authentication
 * - Validates query parameters
 * - Supports filtering by type, status, search, tags, dates
 * - Supports pagination and sorting
 */
router.get(
  '/',
  validateQuery(projectValidators.search),
  projectController.getUserProjects
);

/**
 * GET /projects/stats
 * Get project statistics for the current user
 * - Requires authentication
 * - Returns total count and breakdowns by status/type
 */
router.get(
  '/stats',
  projectController.getUserProjectStats
);

/**
 * GET /projects/:id
 * Get a specific project by ID
 * - Requires authentication
 * - Validates project ID parameter
 * - Only owner or admin can access
 */
router.get(
  '/:id',
  validateParams(projectValidators.projectId),
  projectController.getProject
);

/**
 * PUT /projects/:id
 * Update a specific project
 * - Requires authentication
 * - Validates project ID parameter
 * - Validates request body
 * - Only owner can update
 */
router.put(
  '/:id',
  validateParams(projectValidators.projectId),
  validateBody(projectValidators.update),
  projectController.updateProject
);

/**
 * PATCH /projects/:id
 * Partially update a specific project
 * - Same as PUT but allows partial updates
 * - Requires authentication
 * - Validates project ID parameter
 * - Validates request body
 * - Only owner can update
 */
router.patch(
  '/:id',
  validateParams(projectValidators.projectId),
  validateBody(projectValidators.update),
  projectController.updateProject
);

/**
 * DELETE /projects/:id
 * Delete a specific project
 * - Requires authentication
 * - Validates project ID parameter
 * - Only owner can delete
 */
router.delete(
  '/:id',
  validateParams(projectValidators.projectId),
  projectController.deleteProject
);

// Admin-only routes

/**
 * GET /projects/admin/all
 * Get all projects across all users (admin only)
 * - Requires admin authentication
 * - Validates query parameters
 * - Supports filtering and pagination
 * - Admin can filter by owner ID
 */
router.get(
  '/admin/all',
  adminOnly(),
  validateQuery(projectValidators.adminSearch),
  rateLimiterMiddleware.strict, // More restrictive rate limiting for admin operations
  projectController.getAllProjects
);

/**
 * GET /projects/admin/search
 * Search projects across all users (admin only)
 * - Requires admin authentication
 * - Validates search query parameters
 * - Returns projects matching search criteria
 */
router.get(
  '/admin/search',
  adminOnly(),
  validateQuery(projectValidators.adminSearch),
  rateLimiterMiddleware.strict,
  projectController.searchProjects
);

// Health check route

/**
 * GET /projects/health
 * Health check endpoint for the project service
 * - No authentication required
 * - Returns service status and connectivity info
 */
router.get(
  '/health',
  projectController.healthCheck
);

// Specific permission-based routes

/**
 * GET /projects/user/:userId
 * Get projects for a specific user (admin or user with special permission)
 * - Requires authentication
 * - Requires 'projects:read:all' permission or admin role
 * - Validates user ID parameter
 */
router.get(
  '/user/:userId',
  authorize(['projects:read:all']),
  validateParams(projectValidators.userId),
  validateQuery(projectValidators.search),
  rateLimiterMiddleware.strict,
  async (req, res, next) => {
    // Override the user ID for this specific route
    req.query.ownerId = req.params.userId;
    return projectController.getAllProjects(req, res, next);
  }
);

/**
 * POST /projects/bulk
 * Create multiple projects at once
 * - Requires authentication
 * - Requires 'projects:write:bulk' permission
 * - Validates array of project data
 * - Rate limited more strictly
 */
router.post(
  '/bulk',
  authorize(['projects:write:bulk']),
  validateBody(projectValidators.bulkCreate),
  rateLimiterMiddleware.strict,
  async (req, res, next) => {
    // Implement bulk create logic here
    // This would need to be added to the controller
    res.status(501).json({
      success: false,
      error: {
        message: 'Bulk create not implemented yet',
        type: 'NOT_IMPLEMENTED',
      },
    });
  }
);

/**
 * POST /projects/:id/duplicate
 * Duplicate an existing project
 * - Requires authentication
 * - Validates project ID parameter
 * - Owner can duplicate their own projects
 * - Creates a copy with "(Copy)" suffix
 */
router.post(
  '/:id/duplicate',
  validateParams(projectValidators.projectId),
  async (req, res, next) => {
    // Implement duplicate logic here
    // This would need to be added to the controller
    res.status(501).json({
      success: false,
      error: {
        message: 'Project duplication not implemented yet',
        type: 'NOT_IMPLEMENTED',
      },
    });
  }
);

/**
 * POST /projects/:id/archive
 * Archive a project (soft delete)
 * - Requires authentication
 * - Validates project ID parameter
 * - Only owner can archive
 * - Sets status to 'archived' instead of deleting
 */
router.post(
  '/:id/archive',
  validateParams(projectValidators.projectId),
  async (req, res, next) => {
    // Implement archive logic here
    // This would update the project status to 'archived'
    res.status(501).json({
      success: false,
      error: {
        message: 'Project archiving not implemented yet',
        type: 'NOT_IMPLEMENTED',
      },
    });
  }
);

/**
 * POST /projects/:id/restore
 * Restore an archived project
 * - Requires authentication
 * - Validates project ID parameter
 * - Only owner can restore
 * - Sets status back to 'active' or previous status
 */
router.post(
  '/:id/restore',
  validateParams(projectValidators.projectId),
  async (req, res, next) => {
    // Implement restore logic here
    res.status(501).json({
      success: false,
      error: {
        message: 'Project restoration not implemented yet',
        type: 'NOT_IMPLEMENTED',
      },
    });
  }
);

// Export router
export default router;

// Named exports for specific route groups
export const projectRoutes = router;
export const adminProjectRoutes = Router();

// Admin routes can be mounted separately
adminProjectRoutes.use(adminOnly());
adminProjectRoutes.get('/all', projectController.getAllProjects);
adminProjectRoutes.get('/search', projectController.searchProjects);

// Public routes (no authentication required)
export const publicProjectRoutes = Router();
publicProjectRoutes.get('/health', projectController.healthCheck);

// Route documentation
export const routeDocumentation = {
  '/projects': {
    POST: {
      description: 'Create a new project',
      authentication: 'required',
      permissions: [],
      rateLimit: 'perUser',
      body: 'CreateProjectData',
    },
    GET: {
      description: 'Get user projects with pagination and filtering',
      authentication: 'required',
      permissions: [],
      rateLimit: 'perUser',
      query: 'ProjectSearchQuery',
    },
  },
  '/projects/stats': {
    GET: {
      description: 'Get project statistics for current user',
      authentication: 'required',
      permissions: [],
      rateLimit: 'perUser',
    },
  },
  '/projects/:id': {
    GET: {
      description: 'Get specific project by ID',
      authentication: 'required',
      permissions: [],
      rateLimit: 'perUser',
      params: 'ProjectId',
    },
    PUT: {
      description: 'Update specific project',
      authentication: 'required',
      permissions: [],
      rateLimit: 'perUser',
      params: 'ProjectId',
      body: 'UpdateProjectData',
    },
    PATCH: {
      description: 'Partially update specific project',
      authentication: 'required',
      permissions: [],
      rateLimit: 'perUser',
      params: 'ProjectId',
      body: 'UpdateProjectData',
    },
    DELETE: {
      description: 'Delete specific project',
      authentication: 'required',
      permissions: [],
      rateLimit: 'perUser',
      params: 'ProjectId',
    },
  },
  '/projects/admin/all': {
    GET: {
      description: 'Get all projects across all users (admin only)',
      authentication: 'required',
      permissions: ['admin'],
      rateLimit: 'strict',
      query: 'AdminProjectSearchQuery',
    },
  },
  '/projects/admin/search': {
    GET: {
      description: 'Search projects across all users (admin only)',
      authentication: 'required',
      permissions: ['admin'],
      rateLimit: 'strict',
      query: 'AdminProjectSearchQuery',
    },
  },
  '/projects/health': {
    GET: {
      description: 'Health check for project service',
      authentication: 'none',
      permissions: [],
      rateLimit: 'none',
    },
  },
};