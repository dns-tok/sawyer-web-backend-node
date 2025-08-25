const crypto = require('crypto');

class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyString = process.env.ENCRYPTION_KEY || 'swayer_encryption_key_32_chars_long!';
    
    // Ensure key is exactly 32 bytes for AES-256
    this.key = Buffer.from(this.keyString.padEnd(32, '0').slice(0, 32), 'utf8');
    
    // If no encryption key is set, warn
    if (!process.env.ENCRYPTION_KEY) {
      console.warn('No ENCRYPTION_KEY found in environment. Using default key.');
      console.warn('Set ENCRYPTION_KEY in .env for production security.');
    }
  }

  encrypt(text) {
    if (!text) return null;
    
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      // Return as JSON string for database storage
      return JSON.stringify({
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
      });
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  decrypt(encryptedData) {
    if (!encryptedData) return null;
    
    // Handle backwards compatibility - if it's just a plain string, return it as-is
    if (typeof encryptedData === 'string') {
      try {
        // Try to parse as JSON first (new format)
        const parsed = JSON.parse(encryptedData);
        if (parsed.encrypted && parsed.iv && parsed.authTag) {
          // This is our new encrypted format
          const iv = Buffer.from(parsed.iv, 'hex');
          const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
          decipher.setAuthTag(Buffer.from(parsed.authTag, 'hex'));
          
          let decrypted = decipher.update(parsed.encrypted, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
          
          return decrypted;
        }
      } catch (parseError) {
        // If JSON parsing fails, treat as unencrypted legacy data
        console.warn('Found unencrypted data, consider re-encrypting for security');
        return encryptedData;
      }
    }
    
    // Handle object format (shouldn't happen anymore but just in case)
    if (typeof encryptedData === 'object' && encryptedData.encrypted) {
      try {
        const iv = Buffer.from(encryptedData.iv, 'hex');
        const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
        decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
        
        let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
      } catch (error) {
        console.error('Decryption error:', error);
        throw new Error('Failed to decrypt data');
      }
    }
    
    return null;
  }

  // Simple hash for non-sensitive data
  hash(text) {
    if (!text) return null;
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  // Generate secure random tokens
  generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  // Compare hashed values securely
  compareHash(text, hash) {
    if (!text || !hash) return false;
    const textHash = this.hash(text);
    return crypto.timingSafeEqual(Buffer.from(textHash), Buffer.from(hash));
  }
}

module.exports = new EncryptionService();
