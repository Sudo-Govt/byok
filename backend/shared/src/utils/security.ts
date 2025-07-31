import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { logger } from './logger';

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

// Security configuration
export const securityConfig = {
  jwt: {
    secret: JWT_SECRET,
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'byok-api',
    audience: 'byok-client'
  },
  bcrypt: {
    rounds: BCRYPT_ROUNDS
  },
  encryption: {
    algorithm: ENCRYPTION_ALGORITHM
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100
  },
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true
  }
};

// Password utilities
export const passwordUtils = {
  // Hash password
  async hash(password: string): Promise<string> {
    try {
      return await bcrypt.hash(password, BCRYPT_ROUNDS);
    } catch (error) {
      logger.error('Password hashing failed', error);
      throw new Error('Password hashing failed');
    }
  },

  // Verify password
  async verify(password: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      logger.error('Password verification failed', error);
      return false;
    }
  },

  // Generate random password
  generateRandom(length: number = 12): string {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
  },

  // Check password strength
  checkStrength(password: string): { score: number; requirements: string[] } {
    const requirements = [];
    let score = 0;

    if (password.length >= 8) score += 1;
    else requirements.push('At least 8 characters');

    if (/[a-z]/.test(password)) score += 1;
    else requirements.push('At least one lowercase letter');

    if (/[A-Z]/.test(password)) score += 1;
    else requirements.push('At least one uppercase letter');

    if (/\d/.test(password)) score += 1;
    else requirements.push('At least one number');

    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 1;
    else requirements.push('At least one special character');

    return { score, requirements };
  }
};

// JWT utilities
export const jwtUtils = {
  // Generate JWT token
  sign(payload: object, options?: jwt.SignOptions): string {
    try {
      return jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
        issuer: securityConfig.jwt.issuer,
        audience: securityConfig.jwt.audience,
        ...options
      });
    } catch (error) {
      logger.error('JWT signing failed', error);
      throw new Error('Token generation failed');
    }
  },

  // Verify JWT token
  verify(token: string): any {
    try {
      return jwt.verify(token, JWT_SECRET, {
        issuer: securityConfig.jwt.issuer,
        audience: securityConfig.jwt.audience
      });
    } catch (error) {
      logger.error('JWT verification failed', error);
      throw new Error('Invalid token');
    }
  },

  // Decode JWT token without verification
  decode(token: string): any {
    try {
      return jwt.decode(token);
    } catch (error) {
      logger.error('JWT decoding failed', error);
      return null;
    }
  },

  // Extract token from Authorization header
  extractFromHeader(authHeader?: string): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }
};

// Encryption utilities
export const encryptionUtils = {
  // Generate encryption key
  generateKey(): string {
    return crypto.randomBytes(32).toString('hex');
  },

  // Encrypt data
  encrypt(text: string, key: string): { encrypted: string; iv: string; tag: string } {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher(ENCRYPTION_ALGORITHM, key);
      cipher.setAAD(Buffer.from('byok-encryption'));
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex')
      };
    } catch (error) {
      logger.error('Encryption failed', error);
      throw new Error('Encryption failed');
    }
  },

  // Decrypt data
  decrypt(encrypted: string, key: string, iv: string, tag: string): string {
    try {
      const decipher = crypto.createDecipher(ENCRYPTION_ALGORITHM, key);
      decipher.setAAD(Buffer.from('byok-encryption'));
      decipher.setAuthTag(Buffer.from(tag, 'hex'));
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      logger.error('Decryption failed', error);
      throw new Error('Decryption failed');
    }
  }
};

// Hashing utilities
export const hashUtils = {
  // Generate hash
  hash(data: string, algorithm: string = 'sha256'): string {
    return crypto.createHash(algorithm).update(data).digest('hex');
  },

  // Generate HMAC
  hmac(data: string, key: string, algorithm: string = 'sha256'): string {
    return crypto.createHmac(algorithm, key).update(data).digest('hex');
  },

  // Generate random hash
  randomHash(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }
};

// Random generation utilities
export const randomUtils = {
  // Generate random string
  string(length: number = 32, charset?: string): string {
    const defaultCharset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const chars = charset || defaultCharset;
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  // Generate random number
  number(min: number = 0, max: number = 100): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  // Generate UUID
  uuid(): string {
    return crypto.randomUUID();
  },

  // Generate random bytes
  bytes(size: number = 32): Buffer {
    return crypto.randomBytes(size);
  }
};

// Input sanitization utilities
export const sanitizeUtils = {
  // Sanitize HTML
  html(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  },

  // Sanitize SQL (basic)
  sql(input: string): string {
    return input.replace(/['";\\]/g, '');
  },

  // Remove non-alphanumeric characters
  alphanumeric(input: string): string {
    return input.replace(/[^a-zA-Z0-9]/g, '');
  },

  // Remove non-printable characters
  printable(input: string): string {
    return input.replace(/[^\x20-\x7E]/g, '');
  }
};

// Security validation utilities
export const validationUtils = {
  // Validate email format
  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  // Validate URL format
  isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },

  // Validate IP address
  isValidIP(ip: string): boolean {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  },

  // Check for SQL injection patterns
  hasSQLInjection(input: string): boolean {
    const patterns = [
      /('|(\\')|(;)|(\\;))|(\b(select|union|insert|update|delete|drop|create|alter|exec|execute)\b)/gi
    ];
    return patterns.some(pattern => pattern.test(input));
  },

  // Check for XSS patterns
  hasXSS(input: string): boolean {
    const patterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /<iframe[^>]*>.*?<\/iframe>/gi,
      /javascript:/gi,
      /onload=/gi,
      /onerror=/gi
    ];
    return patterns.some(pattern => pattern.test(input));
  }
};

// Rate limiting utilities
export const rateLimitUtils = {
  // Create rate limit key
  createKey(identifier: string, action: string): string {
    return `rate_limit:${action}:${identifier}`;
  },

  // Check if rate limit is exceeded
  isExceeded(requests: number, limit: number): boolean {
    return requests >= limit;
  },

  // Calculate reset time
  getResetTime(windowMs: number): Date {
    return new Date(Date.now() + windowMs);
  }
};

export default {
  securityConfig,
  passwordUtils,
  jwtUtils,
  encryptionUtils,
  hashUtils,
  randomUtils,
  sanitizeUtils,
  validationUtils,
  rateLimitUtils
};