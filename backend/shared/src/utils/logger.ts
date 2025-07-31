import winston from 'winston';

// Define log levels
const logLevels = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
};

// Define colors for each log level
const logColors = {
  fatal: 'red',
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue',
  trace: 'gray',
};

// Add colors to winston
winston.addColors(logColors);

// Create the logger
export const logger = winston.createLogger({
  levels: logLevels,
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.colorize({ all: true })
  ),
  defaultMeta: { service: 'byok-api' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: winston.format.json(),
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: winston.format.json(),
    }),
  ],
});

// Create a stream object for HTTP request logging
logger.stream = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};

// Helper functions for different log levels
export const logInfo = (message: string, meta?: any) => {
  logger.info(message, meta);
};

export const logError = (message: string, error?: Error, meta?: any) => {
  logger.error(message, { error: error?.stack || error, ...meta });
};

export const logWarn = (message: string, meta?: any) => {
  logger.warn(message, meta);
};

export const logDebug = (message: string, meta?: any) => {
  logger.debug(message, meta);
};

export const logFatal = (message: string, error?: Error, meta?: any) => {
  logger.log('fatal', message, { error: error?.stack || error, ...meta });
};

// Performance logging helper
export const logPerformance = (operation: string, duration: number, meta?: any) => {
  logger.info(`Performance: ${operation} completed in ${duration}ms`, meta);
};

// Request logging helper
export const logRequest = (method: string, url: string, statusCode: number, duration: number, userId?: string) => {
  logger.info('HTTP Request', {
    method,
    url,
    statusCode,
    duration,
    userId,
    type: 'http_request'
  });
};

export default logger;