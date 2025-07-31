import crypto from 'crypto';

export interface EncryptionResult {
  encryptedData: string;
  iv: string;
  tag?: string;
}

export interface HashingOptions {
  algorithm?: string;
  salt?: string;
  iterations?: number;
  keyLength?: number;
}

export class SecurityUtils {
  private static readonly DEFAULT_ALGORITHM = 'aes-256-gcm';
  private static readonly DEFAULT_HASH_ALGORITHM = 'pbkdf2';
  private static readonly DEFAULT_ITERATIONS = 100000;
  private static readonly DEFAULT_KEY_LENGTH = 64;

  /**
   * Generates a secure random string
   */
  public static generateSecureRandom(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generates a cryptographically secure salt
   */
  public static generateSalt(length: number = 16): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Hashes a password with salt using PBKDF2
   */
  public static async hashPassword(
    password: string,
    options: HashingOptions = {}
  ): Promise<{ hash: string; salt: string }> {
    const salt = options.salt || this.generateSalt();
    const iterations = options.iterations || this.DEFAULT_ITERATIONS;
    const keyLength = options.keyLength || this.DEFAULT_KEY_LENGTH;

    return new Promise((resolve, reject) => {
      crypto.pbkdf2(password, salt, iterations, keyLength, 'sha512', (err, derivedKey) => {
        if (err) reject(err);
        else resolve({
          hash: derivedKey.toString('hex'),
          salt
        });
      });
    });
  }

  /**
   * Verifies a password against a hash
   */
  public static async verifyPassword(
    password: string,
    hash: string,
    salt: string,
    options: HashingOptions = {}
  ): Promise<boolean> {
    const iterations = options.iterations || this.DEFAULT_ITERATIONS;
    const keyLength = options.keyLength || this.DEFAULT_KEY_LENGTH;

    return new Promise((resolve, reject) => {
      crypto.pbkdf2(password, salt, iterations, keyLength, 'sha512', (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey.toString('hex') === hash);
      });
    });
  }

  /**
   * Encrypts data using AES-256-GCM
   */
  public static encrypt(data: string, key: string): EncryptionResult {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(this.DEFAULT_ALGORITHM, key);
    cipher.setAAD(Buffer.from('additional_data'));

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
      encryptedData: encrypted,
      iv: iv.toString('hex'),
      tag: cipher.getAuthTag().toString('hex')
    };
  }

  /**
   * Decrypts data using AES-256-GCM
   */
  public static decrypt(encryptedData: string, key: string, iv: string, tag: string): string {
    const decipher = crypto.createDecipher(this.DEFAULT_ALGORITHM, key);
    decipher.setAAD(Buffer.from('additional_data'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Creates a SHA-256 hash
   */
  public static createHash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Creates an HMAC signature
   */
  public static createHMAC(data: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  /**
   * Verifies an HMAC signature
   */
  public static verifyHMAC(data: string, signature: string, secret: string): boolean {
    const expectedSignature = this.createHMAC(data, secret);
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  }

  /**
   * Sanitizes input to prevent XSS
   */
  public static sanitizeInput(input: string): string {
    return input
      .replace(/[<>\"']/g, function(match) {
        switch(match) {
          case '<': return '&lt;';
          case '>': return '&gt;';
          case '"': return '&quot;';
          case "'": return '&#x27;';
          default: return match;
        }
      });
  }

  /**
   * Validates if a string is a valid UUID
   */
  public static isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Generates a UUID v4
   */
  public static generateUUID(): string {
    return crypto.randomUUID();
  }
}