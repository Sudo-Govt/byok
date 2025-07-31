export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  poolSize?: number;
  timeout?: number;
}

export interface QueryOptions {
  timeout?: number;
  retries?: number;
}

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  fields?: any[];
}

export interface Transaction {
  query<T = any>(sql: string, params?: any[], options?: QueryOptions): Promise<QueryResult<T>>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface ConnectionPoolStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
}

export abstract class DatabaseConnection {
  protected config: DatabaseConfig;
  protected isConnected = false;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract query<T = any>(sql: string, params?: any[], options?: QueryOptions): Promise<QueryResult<T>>;
  abstract beginTransaction(): Promise<Transaction>;
  abstract getPoolStats(): ConnectionPoolStats;

  public isHealthy(): boolean {
    return this.isConnected;
  }

  public getConfig(): Omit<DatabaseConfig, 'password'> {
    const { password, ...safeConfig } = this.config;
    return safeConfig;
  }
}

// Mock implementation for demonstration
export class MockDatabaseConnection extends DatabaseConnection {
  private mockData = new Map<string, any[]>();
  private transactionLevel = 0;

  async connect(): Promise<void> {
    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 100));
    this.isConnected = true;
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
  }

  async query<T = any>(sql: string, params: any[] = [], options: QueryOptions = {}): Promise<QueryResult<T>> {
    if (!this.isConnected) {
      throw new Error('Database not connected');
    }

    // Simulate query delay
    await new Promise(resolve => setTimeout(resolve, 50));

    // Mock implementation - in reality this would execute actual SQL
    const normalizedSql = sql.toLowerCase().trim();
    
    if (normalizedSql.startsWith('select')) {
      return this.mockSelect<T>(sql, params);
    } else if (normalizedSql.startsWith('insert')) {
      return this.mockInsert<T>(sql, params);
    } else if (normalizedSql.startsWith('update')) {
      return this.mockUpdate<T>(sql, params);
    } else if (normalizedSql.startsWith('delete')) {
      return this.mockDelete<T>(sql, params);
    }

    return { rows: [] as T[], rowCount: 0 };
  }

  async beginTransaction(): Promise<Transaction> {
    this.transactionLevel++;
    
    return {
      query: async <T = any>(sql: string, params?: any[], options?: QueryOptions): Promise<QueryResult<T>> => {
        return this.query<T>(sql, params, options);
      },
      commit: async (): Promise<void> => {
        if (this.transactionLevel > 0) {
          this.transactionLevel--;
        }
      },
      rollback: async (): Promise<void> => {
        if (this.transactionLevel > 0) {
          this.transactionLevel--;
        }
      }
    };
  }

  getPoolStats(): ConnectionPoolStats {
    return {
      totalConnections: 10,
      activeConnections: 2,
      idleConnections: 8,
      waitingRequests: 0
    };
  }

  private mockSelect<T>(sql: string, params: any[]): QueryResult<T> {
    // Extract table name from SQL (very basic parsing)
    const tableMatch = sql.match(/from\s+(\w+)/i);
    const tableName = tableMatch ? tableMatch[1] : 'unknown';
    
    const data = this.mockData.get(tableName) || [];
    return {
      rows: data as T[],
      rowCount: data.length
    };
  }

  private mockInsert<T>(sql: string, params: any[]): QueryResult<T> {
    const tableMatch = sql.match(/insert\s+into\s+(\w+)/i);
    const tableName = tableMatch ? tableMatch[1] : 'unknown';
    
    if (!this.mockData.has(tableName)) {
      this.mockData.set(tableName, []);
    }
    
    const data = this.mockData.get(tableName)!;
    const newRecord = { id: data.length + 1, ...params };
    data.push(newRecord);
    
    return {
      rows: [newRecord] as T[],
      rowCount: 1
    };
  }

  private mockUpdate<T>(sql: string, params: any[]): QueryResult<T> {
    return {
      rows: [] as T[],
      rowCount: 1 // Mock affected rows
    };
  }

  private mockDelete<T>(sql: string, params: any[]): QueryResult<T> {
    return {
      rows: [] as T[],
      rowCount: 1 // Mock affected rows
    };
  }
}

export class DatabaseManager {
  private static instance: DatabaseManager;
  private connections = new Map<string, DatabaseConnection>();

  private constructor() {}

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  /**
   * Register a database connection
   */
  public registerConnection(name: string, connection: DatabaseConnection): void {
    this.connections.set(name, connection);
  }

  /**
   * Get a database connection by name
   */
  public getConnection(name: string): DatabaseConnection | undefined {
    return this.connections.get(name);
  }

  /**
   * Connect all registered databases
   */
  public async connectAll(): Promise<void> {
    const connectionPromises = Array.from(this.connections.values()).map(conn => conn.connect());
    await Promise.all(connectionPromises);
  }

  /**
   * Disconnect all databases
   */
  public async disconnectAll(): Promise<void> {
    const disconnectionPromises = Array.from(this.connections.values()).map(conn => conn.disconnect());
    await Promise.all(disconnectionPromises);
  }

  /**
   * Health check for all connections
   */
  public getHealthStatus(): Record<string, boolean> {
    const health: Record<string, boolean> = {};
    for (const [name, connection] of this.connections.entries()) {
      health[name] = connection.isHealthy();
    }
    return health;
  }

  /**
   * Get pool statistics for all connections
   */
  public getAllPoolStats(): Record<string, ConnectionPoolStats> {
    const stats: Record<string, ConnectionPoolStats> = {};
    for (const [name, connection] of this.connections.entries()) {
      stats[name] = connection.getPoolStats();
    }
    return stats;
  }
}

export const databaseManager = DatabaseManager.getInstance();