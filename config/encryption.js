const crypto = require('crypto');

class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-cbc';
    this.secretKey = process.env.ENCRYPTION_KEY || 'default_32_character_key_here!';
    // Ensure the key is exactly 32 bytes
    this.key = Buffer.from(this.secretKey.padEnd(32, '0').slice(0, 32), 'utf8');
  }

  // Simple encrypt for API keys (using AES-256-CBC)
  encryptApiKey(apiKey) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
      
      let encrypted = cipher.update(apiKey, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      throw new Error('API key encryption failed: ' + error.message);
    }
  }

  decryptApiKey(encryptedApiKey) {
    try {
      const textParts = encryptedApiKey.split(':');
      const iv = Buffer.from(textParts.shift(), 'hex');
      const encryptedText = textParts.join(':');
      
      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      throw new Error('API key decryption failed: ' + error.message);
    }
  }

  hashPassword(password) {
    return crypto.pbkdf2Sync(password, this.key, 10000, 64, 'sha512').toString('hex');
  }

  verifyPassword(password, hashedPassword) {
    const hash = this.hashPassword(password);
    return hash === hashedPassword;
  }
}

module.exports = new EncryptionService();
