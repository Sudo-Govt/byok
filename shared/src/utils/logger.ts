export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.INFO;

  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  public debug(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  public info(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  public warn(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  public error(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, metadata);
  }

  private log(level: LogLevel, message: string, metadata?: Record<string, any>): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      metadata
    };

    if (this.shouldLog(level)) {
      console.log(JSON.stringify(entry));
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }
}

export const logger = Logger.getInstance();