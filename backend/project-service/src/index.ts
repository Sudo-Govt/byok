import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import dotenv from 'dotenv';

// Import shared middleware and utilities
import { errorHandler, notFoundHandler, initializeErrorHandling } from '../shared/src/middleware/errorHandler';
import { rateLimiterMiddleware } from '../shared/src/middleware/rateLimiter';
import { logger } from '../shared/src/utils/logger';
import { metrics, startSystemMetricsCollection } from '../shared/src/utils/metrics';

// Import routes
import projectRoutes from './routes/projectRoutes';

// Load environment variables
dotenv.config();

// Create Express application
const app = express();
const PORT = process.env.PORT || 3001;

// Initialize error handling
initializeErrorHandling();

// Start system metrics collection
startSystemMetricsCollection();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
}));

// Compression middleware
app.use(compression());

// Request logging
app.use(morgan('combined', { stream: logger.stream }));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
app.use(rateLimiterMiddleware.global);

// Request ID middleware
app.use((req, res, next) => {
  req.headers['x-request-id'] = req.headers['x-request-id'] || require('uuid').v4();
  res.setHeader('X-Request-ID', req.headers['x-request-id']);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'project-service',
      version: '1.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    },
  });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  const summary = metrics.getSummary();
  res.status(200).json({
    success: true,
    data: summary,
  });
});

// API routes
app.use('/api/projects', projectRoutes);

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
  logger.info(`Project service started on port ${PORT}`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
  });
});

// Graceful shutdown
const gracefulShutdown = (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully`);
  
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Close database connections, caches, etc.
    Promise.all([
      // db.close(),
      // cache.disconnect(),
      // queueManager.close(),
    ]).then(() => {
      logger.info('All connections closed, exiting process');
      process.exit(0);
    }).catch((error) => {
      logger.error('Error during shutdown', error);
      process.exit(1);
    });
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;