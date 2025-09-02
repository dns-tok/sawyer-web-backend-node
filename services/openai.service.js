const axios = require('axios');
const ApiKey = require('../models/ApiKey');
const encryptionService = require('./encryption.service');

class OpenAIService {
  constructor() {
    this.baseURL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1';
  }

  // Verify OpenAI API key
  async verifyApiKey(apiKey) {
    try {
      const response = await axios.get(`${this.baseURL}/models`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 seconds timeout
      });

      const rawModels = response.data.data || [];
      const processedModels = this.processModels(rawModels);

      // If we get here, the API key is valid
      return {
        valid: true,
        organizationId: response.headers['openai-organization'] || null,
        models: processedModels,
        permissions: this.extractPermissions(rawModels)
      };
    } catch (error) {
      console.error('OpenAI API key verification error:', error.response?.data || error.message);
      
      if (error.response?.status === 401) {
        return {
          valid: false,
          error: 'Invalid API key. Please check your OpenAI API key.'
        };
      } else if (error.response?.status === 429) {
        return {
          valid: false,
          error: 'Rate limit exceeded. Please try again later.'
        };
      } else if (error.response?.status === 403) {
        return {
          valid: false,
          error: 'API key does not have sufficient permissions.'
        };
      } else if (error.code === 'ECONNABORTED') {
        return {
          valid: false,
          error: 'Request timeout. Please check your internet connection.'
        };
      } else {
        return {
          valid: false,
          error: 'Failed to verify API key. Please try again.'
        };
      }
    }
  }

  // Process raw OpenAI models into structured format
  processModels(rawModels) {
    // Filter to only chat completion models and format them
    const chatModels = rawModels
      .filter(model => {
        // Include GPT models that support chat completions
        return model.id.includes('gpt') && 
               !model.id.includes('instruct') && // Exclude instruct models
               !model.id.includes('edit') &&    // Exclude edit models
               !model.id.includes('search') &&  // Exclude search models
               !model.id.includes('similarity') && // Exclude similarity models
               !model.id.includes('embedding') && // Exclude embedding models
               !model.id.includes('whisper') && // Exclude audio models
               !model.id.includes('tts') && // Exclude text-to-speech models
               !model.id.includes('dall-e'); // Exclude image models
      })
      .map(model => ({
        id: model.id,
        name: this.formatModelName(model.id),
        provider: 'openai',
        context: this.getModelContext(model.id),
        created: model.created,
        owned_by: model.owned_by
      }))
      .sort((a, b) => {
        // Sort by context size (larger first), then by name
        if (a.context !== b.context) {
          return b.context - a.context;
        }
        return a.name.localeCompare(b.name);
      });

    return chatModels;
  }

  // Format model ID into a human-readable name
  formatModelName(modelId) {
    const nameMap = {
      'gpt-4': 'GPT-4',
      'gpt-4-32k': 'GPT-4 32K',
      'gpt-4-0125-preview': 'GPT-4 Turbo Preview (0125)',
      'gpt-4-1106-preview': 'GPT-4 Turbo Preview (1106)',
      'gpt-4-turbo-preview': 'GPT-4 Turbo Preview',
      'gpt-3.5-turbo': 'GPT-3.5 Turbo',
      'gpt-3.5-turbo-16k': 'GPT-3.5 Turbo 16K',
      'gpt-3.5-turbo-1106': 'GPT-3.5 Turbo (1106)',
      'gpt-3.5-turbo-0125': 'GPT-3.5 Turbo (0125)'
    };

    return nameMap[modelId] || modelId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  // Get context window size for model
  getModelContext(modelId) {
    const contextMap = {
      'gpt-4': 8192,
      'gpt-4-32k': 32768,
      'gpt-4-0125-preview': 128000,
      'gpt-4-1106-preview': 128000,
      'gpt-4-turbo-preview': 128000,
      'gpt-3.5-turbo': 4096,
      'gpt-3.5-turbo-16k': 16384,
      'gpt-3.5-turbo-1106': 16384,
      'gpt-3.5-turbo-0125': 16384
    };

    return contextMap[modelId] || 4096;
  }

  // Extract permissions from available models
  extractPermissions(models) {
    const permissions = [];
    
    if (models.some(model => model.id.includes('gpt'))) {
      permissions.push('text-generation');
    }
    
    if (models.some(model => model.id.includes('dall-e'))) {
      permissions.push('image-generation');
    }
    
    if (models.some(model => model.id.includes('whisper'))) {
      permissions.push('audio-transcription');
    }
    
    if (models.some(model => model.id.includes('tts'))) {
      permissions.push('text-to-speech');
    }
    
    if (models.some(model => model.id.includes('embedding'))) {
      permissions.push('embeddings');
    }

    return permissions;
  }

  // Save API key for user
  async saveApiKey(userId, apiKey, keyName = 'Default OpenAI Key') {
    try {
      // First verify the API key
      const verification = await this.verifyApiKey(apiKey);
      
      if (!verification.valid) {
        throw new Error(verification.error || 'Invalid API key');
      }

      // Deactivate any existing API keys for this user and provider
      await ApiKey.deactivateForUserAndProvider(userId, 'openai');

      // Encrypt the API key
      const encryptedApiKey = encryptionService.encryptApiKey(apiKey);
      
      // Generate key prefix for identification (first 7 characters + "...")
      const keyPrefix = apiKey.substring(0, 7) + '...';

      // Create new API key record
      const apiKeyRecord = new ApiKey({
        userId,
        provider: 'openai',
        keyName,
        encryptedApiKey,
        keyPrefix,
        isVerified: true,
        verifiedAt: new Date(),
        metadata: {
          organizationId: verification.organizationId,
          permissions: verification.permissions,
          models: verification.models,
          lastValidation: new Date()
        }
      });

      const savedApiKey = await apiKeyRecord.save();

      return {
        success: true,
        apiKey: savedApiKey,
        verification: {
          organizationId: verification.organizationId,
          permissions: verification.permissions,
          modelCount: verification.models.length
        }
      };
    } catch (error) {
      console.error('Error saving API key:', error);
      throw new Error(error.message || 'Failed to save API key');
    }
  }

  // Get user's active API key
  async getUserApiKey(userId) {
    try {
      const apiKey = await ApiKey.findActiveByUserAndProvider(userId, 'openai');
      return apiKey;
    } catch (error) {
      console.error('Error fetching user API key:', error);
      throw new Error('Failed to fetch API key');
    }
  }

  // Get decrypted API key for making API calls
  async getDecryptedApiKey(userId) {
    try {
      const apiKeyRecord = await ApiKey.findOne({
        userId,
        provider: 'openai',
        isActive: true,
        isVerified: true
      }).select('+encryptedApiKey');

      if (!apiKeyRecord) {
        throw new Error('No active verified OpenAI API key found');
      }

      return encryptionService.decryptApiKey(apiKeyRecord.encryptedApiKey);
    } catch (error) {
      console.error('Error getting decrypted API key:', error);
      throw new Error('Failed to get API key');
    }
  }

  // Make authenticated API call to OpenAI
  async makeOpenAIApiCall(userId, endpoint, method = 'GET', data = null) {
    try {
      const apiKey = await this.getDecryptedApiKey(userId);
      
      const config = {
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 seconds timeout
      };

      if (data && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
        config.data = data;
      }

      const response = await axios(config);
      
      // Update last used timestamp
      const apiKeyRecord = await ApiKey.findOne({
        userId,
        provider: 'openai',
        isActive: true
      });
      if (apiKeyRecord) {
        await apiKeyRecord.updateLastUsed();
      }

      return response.data;
    } catch (error) {
      console.error('OpenAI API call error:', error.response?.data || error.message);
      
      // Record error in API key record
      const apiKeyRecord = await ApiKey.findOne({
        userId,
        provider: 'openai',
        isActive: true
      });
      if (apiKeyRecord) {
        await apiKeyRecord.recordValidationError(error.response?.data || error.message);
      }

      throw new Error(`OpenAI API error: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // Test API key connection
  async testConnection(userId) {
    try {
      const models = await this.makeOpenAIApiCall(userId, '/models');
      return {
        connected: true,
        modelCount: models.data?.length || 0,
        organization: models.headers?.['openai-organization'] || null
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }

  // Validate existing API key
  async validateApiKey(userId) {
    try {
      const apiKeyRecord = await ApiKey.findOne({
        userId,
        provider: 'openai',
        isActive: true
      }).select('+encryptedApiKey');

      if (!apiKeyRecord) {
        return {
          valid: false,
          error: 'No API key found'
        };
      }

      const decryptedKey = encryptionService.decryptApiKey(apiKeyRecord.encryptedApiKey);
      const verification = await this.verifyApiKey(decryptedKey);

      if (verification.valid) {
        // Update verification status
        await apiKeyRecord.markAsVerified({
          organizationId: verification.organizationId,
          permissions: verification.permissions
        });
      } else {
        // Record validation error
        await apiKeyRecord.recordValidationError(verification.error);
      }

      return verification;
    } catch (error) {
      console.error('Error validating API key:', error);
      return {
        valid: false,
        error: error.message || 'Failed to validate API key'
      };
    }
  }

  // Delete API key
  async deleteApiKey(userId) {
    try {
      const apiKeyRecord = await ApiKey.findOne({
        userId,
        provider: 'openai',
        isActive: true
      });

      if (apiKeyRecord) {
        await apiKeyRecord.deactivate();
      }

      return { success: true };
    } catch (error) {
      console.error('Error deleting API key:', error);
      throw new Error('Failed to delete API key');
    }
  }

  // Get available models
  async getModels(userId) {
    try {
      return await this.makeOpenAIApiCall(userId, '/models');
    } catch (error) {
      throw new Error('Failed to fetch models');
    }
  }

  // Generate text completion
  async generateCompletion(userId, prompt, options = {}) {
    try {
      const data = {
        model: options.model || 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: options.maxTokens || 150,
        temperature: options.temperature || 0.7,
        ...options
      };

      return await this.makeOpenAIApiCall(userId, '/chat/completions', 'POST', data);
    } catch (error) {
      throw new Error('Failed to generate completion');
    }
  }
}

module.exports = new OpenAIService();
