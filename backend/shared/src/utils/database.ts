import { Pool, PoolClient, PoolConfig } from 'pg';
import { logger } from './logger';
import { metrics } from './metrics';

// Database configuration
export interface DatabaseConfig extends PoolConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean | object;
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
  max?: number;
  min?: number;
  statement_timeout?: number;
  query_timeout?: number;
}

// Query result interface
export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  command: string;
  fields: any[];
}

// Transaction interface
export interface Transaction {
  query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

// Database connection class
export class Database {
  private pool: Pool;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
    this.pool = new Pool({
      ...config,
      max: config.max || 20,
      min: config.min || 5,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis || 10000,
      statement_timeout: config.statement_timeout || 30000,
      query_timeout: config.query_timeout || 30000,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.pool.on('connect', (client) => {
      logger.debug('Database client connected');
      metrics.counter('db.connections', 1, { status: 'connected' });
    });

    this.pool.on('acquire', (client) => {
      logger.debug('Database client acquired from pool');
      metrics.counter('db.pool.acquire', 1);
    });

    this.pool.on('remove', (client) => {
      logger.debug('Database client removed from pool');
      metrics.counter('db.pool.remove', 1);
    });

    this.pool.on('error', (error, client) => {
      logger.error('Database pool error', error);
      metrics.counter('db.errors', 1, { type: 'pool_error' });
    });
  }

  // Execute a query
  async query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const start = Date.now();
    const client = await this.pool.connect();

    try {
      logger.debug('Executing query', { query: text, params });
      
      const result = await client.query(text, params);
      const duration = Date.now() - start;

      logger.debug('Query executed successfully', {
        query: text,
        rowCount: result.rowCount,
        duration
      });

      metrics.timer('db.query.duration', duration, { 
        command: result.command?.toLowerCase() || 'unknown' 
      });
      metrics.counter('db.queries', 1, { 
        command: result.command?.toLowerCase() || 'unknown',
        status: 'success' 
      });

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      
      logger.error('Query execution failed', error, {
        query: text,
        params,
        duration
      });

      metrics.timer('db.query.duration', duration, { 
        command: 'unknown',
        error: 'true' 
      });
      metrics.counter('db.queries', 1, { 
        command: 'unknown',
        status: 'error' 
      });

      throw error;
    } finally {
      client.release();
    }
  }

  // Execute multiple queries in a transaction
  async transaction<T>(callback: (trx: Transaction) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const start = Date.now();

    try {
      await client.query('BEGIN');
      logger.debug('Transaction started');

      const transaction: Transaction = {
        query: async <U = any>(text: string, params?: any[]): Promise<QueryResult<U>> => {
          const queryStart = Date.now();
          try {
            const result = await client.query(text, params);
            const queryDuration = Date.now() - queryStart;

            metrics.timer('db.transaction.query.duration', queryDuration, {
              command: result.command?.toLowerCase() || 'unknown'
            });

            return result;
          } catch (error) {
            const queryDuration = Date.now() - queryStart;
            metrics.timer('db.transaction.query.duration', queryDuration, {
              command: 'unknown',
              error: 'true'
            });
            throw error;
          }
        },

        commit: async (): Promise<void> => {
          await client.query('COMMIT');
          logger.debug('Transaction committed');
        },

        rollback: async (): Promise<void> => {
          await client.query('ROLLBACK');
          logger.debug('Transaction rolled back');
        }
      };

      const result = await callback(transaction);
      await transaction.commit();

      const duration = Date.now() - start;
      logger.info('Transaction completed successfully', { duration });
      metrics.timer('db.transaction.duration', duration, { status: 'committed' });
      metrics.counter('db.transactions', 1, { status: 'committed' });

      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      const duration = Date.now() - start;

      logger.error('Transaction failed and rolled back', error, { duration });
      metrics.timer('db.transaction.duration', duration, { status: 'rolled_back' });
      metrics.counter('db.transactions', 1, { status: 'rolled_back' });

      throw error;
    } finally {
      client.release();
    }
  }

  // Get a client from the pool for multiple operations
  async getClient(): Promise<PoolClient> {
    return await this.pool.connect();
  }

  // Check database health
  async healthCheck(): Promise<{
    healthy: boolean;
    poolSize: number;
    idleCount: number;
    waitingCount: number;
    error?: string;
  }> {
    try {
      const start = Date.now();
      await this.query('SELECT 1 as health_check');
      const duration = Date.now() - start;

      const poolInfo = {
        poolSize: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount,
      };

      logger.debug('Database health check passed', { ...poolInfo, duration });

      return {
        healthy: true,
        ...poolInfo,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Database health check failed', error);

      return {
        healthy: false,
        poolSize: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount,
        error: errorMessage,
      };
    }
  }

  // Close the database connection pool
  async close(): Promise<void> {
    try {
      await this.pool.end();
      logger.info('Database connection pool closed');
    } catch (error) {
      logger.error('Error closing database connection pool', error);
      throw error;
    }
  }

  // Get pool statistics
  getStats(): {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  } {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }
}

// Query builder utility
export class QueryBuilder {
  private queryText: string = '';
  private params: any[] = [];
  private paramIndex: number = 1;

  select(columns: string[] | string): QueryBuilder {
    const cols = Array.isArray(columns) ? columns.join(', ') : columns;
    this.queryText = `SELECT ${cols}`;
    return this;
  }

  from(table: string): QueryBuilder {
    this.queryText += ` FROM ${table}`;
    return this;
  }

  where(condition: string, value?: any): QueryBuilder {
    const prefix = this.queryText.includes('WHERE') ? ' AND' : ' WHERE';
    
    if (value !== undefined) {
      this.queryText += `${prefix} ${condition} = $${this.paramIndex}`;
      this.params.push(value);
      this.paramIndex++;
    } else {
      this.queryText += `${prefix} ${condition}`;
    }
    
    return this;
  }

  whereIn(column: string, values: any[]): QueryBuilder {
    if (values.length === 0) return this;

    const prefix = this.queryText.includes('WHERE') ? ' AND' : ' WHERE';
    const placeholders = values.map(() => `$${this.paramIndex++}`).join(', ');
    
    this.queryText += `${prefix} ${column} IN (${placeholders})`;
    this.params.push(...values);
    
    return this;
  }

  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): QueryBuilder {
    const prefix = this.queryText.includes('ORDER BY') ? ', ' : ' ORDER BY ';
    this.queryText += `${prefix}${column} ${direction}`;
    return this;
  }

  limit(count: number): QueryBuilder {
    this.queryText += ` LIMIT $${this.paramIndex}`;
    this.params.push(count);
    this.paramIndex++;
    return this;
  }

  offset(count: number): QueryBuilder {
    this.queryText += ` OFFSET $${this.paramIndex}`;
    this.params.push(count);
    this.paramIndex++;
    return this;
  }

  join(table: string, condition: string): QueryBuilder {
    this.queryText += ` JOIN ${table} ON ${condition}`;
    return this;
  }

  leftJoin(table: string, condition: string): QueryBuilder {
    this.queryText += ` LEFT JOIN ${table} ON ${condition}`;
    return this;
  }

  build(): { text: string; params: any[] } {
    return {
      text: this.queryText,
      params: this.params,
    };
  }

  // Execute the built query
  async execute<T = any>(db: Database): Promise<QueryResult<T>> {
    const { text, params } = this.build();
    return await db.query<T>(text, params);
  }

  // Reset the builder
  reset(): QueryBuilder {
    this.queryText = '';
    this.params = [];
    this.paramIndex = 1;
    return this;
  }
}

// Database migration utilities
export class Migration {
  constructor(private db: Database) {}

  // Create migrations table
  async createMigrationsTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    await this.db.query(query);
    logger.info('Migrations table created or already exists');
  }

  // Check if migration has been executed
  async hasBeenExecuted(migrationName: string): Promise<boolean> {
    const result = await this.db.query(
      'SELECT 1 FROM migrations WHERE name = $1',
      [migrationName]
    );
    return result.rowCount > 0;
  }

  // Mark migration as executed
  async markAsExecuted(migrationName: string): Promise<void> {
    await this.db.query(
      'INSERT INTO migrations (name) VALUES ($1)',
      [migrationName]
    );
    logger.info(`Migration ${migrationName} marked as executed`);
  }

  // Get executed migrations
  async getExecutedMigrations(): Promise<string[]> {
    const result = await this.db.query(
      'SELECT name FROM migrations ORDER BY executed_at'
    );
    return result.rows.map(row => row.name);
  }
}

// Create database instance with default configuration
const defaultConfig: DatabaseConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'byok',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: parseInt(process.env.DB_POOL_MAX || '20'),
  min: parseInt(process.env.DB_POOL_MIN || '5'),
};

// Default database instance
export const db = new Database(defaultConfig);

// Database utilities
export const dbUtils = {
  // Create a new query builder
  createQueryBuilder(): QueryBuilder {
    return new QueryBuilder();
  },

  // Create migration utility
  createMigration(): Migration {
    return new Migration(db);
  },

  // Execute raw SQL file
  async executeSqlFile(sqlContent: string): Promise<void> {
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);

    await db.transaction(async (trx) => {
      for (const statement of statements) {
        await trx.query(statement);
      }
    });
  },

  // Backup table data
  async backupTable(tableName: string): Promise<any[]> {
    const result = await db.query(`SELECT * FROM ${tableName}`);
    return result.rows;
  },

  // Check if table exists
  async tableExists(tableName: string): Promise<boolean> {
    const result = await db.query(
      `SELECT 1 FROM information_schema.tables 
       WHERE table_name = $1 AND table_schema = 'public'`,
      [tableName]
    );
    return result.rowCount > 0;
  },

  // Get table columns
  async getTableColumns(tableName: string): Promise<string[]> {
    const result = await db.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = $1 AND table_schema = 'public'
       ORDER BY ordinal_position`,
      [tableName]
    );
    return result.rows.map(row => row.column_name);
  },

  // Create index if not exists
  async createIndexIfNotExists(
    indexName: string,
    tableName: string,
    columns: string[],
    unique: boolean = false
  ): Promise<void> {
    const uniqueKeyword = unique ? 'UNIQUE' : '';
    const columnsStr = columns.join(', ');
    
    const query = `
      CREATE ${uniqueKeyword} INDEX IF NOT EXISTS ${indexName}
      ON ${tableName} (${columnsStr})
    `;
    
    await db.query(query);
    logger.info(`Index ${indexName} created or already exists`);
  },

  // Paginated query
  async paginatedQuery<T = any>(
    baseQuery: string,
    params: any[],
    page: number = 1,
    limit: number = 10
  ): Promise<{
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * limit;
    
    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM (${baseQuery}) as count_query`;
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);
    
    // Get paginated data
    const dataQuery = `${baseQuery} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const dataResult = await db.query<T>(dataQuery, [...params, limit, offset]);
    
    return {
      data: dataResult.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },
};

export default db;