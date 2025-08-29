const axios = require("axios");
const ApiKey = require("../models/ApiKey");
const encryptionService = require("../config/encryption");

class ApiKeyService {
  constructor() {
    this.providers = {
      openai: {
        baseURL: "https://api.openai.com/v1",
        verifyEndpoint: "/models",
        authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
      },
      anthropic: {
        baseURL: "https://api.anthropic.com/v1",
        verifyEndpoint: "/messages",
        authHeader: (key) => ({
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        }),
      },
      "google-ai": {
        baseURL: "https://generativelanguage.googleapis.com/v1beta",
        verifyEndpoint: "/models",
        authHeader: (key) => ({}),
        queryParam: (key) => ({ key }),
      },
      mistral: {
        baseURL: "https://api.mistral.ai/v1",
        verifyEndpoint: "/models",
        authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
      },
      cohere: {
        baseURL: "https://api.cohere.ai/v1",
        verifyEndpoint: "/models",
        authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
      },
    };
  }

  // Verify API key for any provider
  async verifyApiKey(provider, apiKey) {
    const providerConfig = this.providers[provider];
    if (!providerConfig) {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    try {
      let verification;

      switch (provider) {
        case "openai":
          verification = await this.verifyOpenAI(apiKey);
          break;
        case "anthropic":
          verification = await this.verifyAnthropic(apiKey);
          break;
        case "google-ai":
          verification = await this.verifyGoogleAI(apiKey);
          break;
        case "mistral":
          verification = await this.verifyMistral(apiKey);
          break;
        case "cohere":
          verification = await this.verifyCohere(apiKey);
          break;
        default:
          throw new Error(
            `Verification not implemented for provider: ${provider}`
          );
      }

      return verification;
    } catch (error) {
      console.error(`${provider} API key verification error:`, error.message);
      throw error;
    }
  }

  // OpenAI verification
  async verifyOpenAI(apiKey) {
    try {
      const response = await axios.get("https://api.openai.com/v1/models", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      });

      const models = response.data.data || [];
      const gptModels = models.filter((m) => m.id.includes("gpt"));

      return {
        valid: true,
        organizationId: response.headers["openai-organization"] || null,
        models: gptModels.map((m) => ({
          id: m.id,
          name: m.id,
          provider: "openai",
        })),
        permissions: this.extractOpenAIPermissions(models),
      };
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error("Invalid OpenAI API key");
      } else if (error.response?.status === 429) {
        throw new Error("Rate limit exceeded. Please try again later.");
      }
      throw new Error("Failed to verify OpenAI API key");
    }
  }

  // Anthropic verification
  async verifyAnthropic(apiKey) {
    try {
      // Test with a minimal message request
      const response = await axios.post(
        "https://api.anthropic.com/v1/messages",
        {
          model: "claude-3-haiku-20240307",
          messages: [{ role: "user", content: "Test" }],
          max_tokens: 1,
        },
        {
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          timeout: 10000,
        }
      );

      // If we get here or get a 400 (bad request but auth worked), key is valid
      return {
        valid: true,
        models: [
          {
            id: "claude-3-opus-20240229",
            name: "Claude 3 Opus",
            provider: "anthropic",
          },
          {
            id: "claude-3-sonnet-20240229",
            name: "Claude 3 Sonnet",
            provider: "anthropic",
          },
          {
            id: "claude-3-haiku-20240307",
            name: "Claude 3 Haiku",
            provider: "anthropic",
          },
        ],
        permissions: ["chat", "completion"],
      };
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error("Invalid Anthropic API key");
      } else if (error.response?.status === 400) {
        // Bad request likely means key is valid but request format is wrong
        return {
          valid: true,
          models: [
            {
              id: "claude-3-opus-20240229",
              name: "Claude 3 Opus",
              provider: "anthropic",
            },
            {
              id: "claude-3-sonnet-20240229",
              name: "Claude 3 Sonnet",
              provider: "anthropic",
            },
            {
              id: "claude-3-haiku-20240307",
              name: "Claude 3 Haiku",
              provider: "anthropic",
            },
          ],
          permissions: ["chat", "completion"],
        };
      }
      throw new Error("Failed to verify Anthropic API key");
    }
  }

  // Google AI verification
  async verifyGoogleAI(apiKey) {
    try {
      const response = await axios.get(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        { timeout: 10000 }
      );

      const models = response.data.models || [];
      const geminiModels = models.filter((m) => m.name.includes("gemini"));

      return {
        valid: true,
        models: geminiModels.map((m) => ({
          id: m.name,
          name: m.displayName || m.name,
          provider: "google-ai",
        })),
        permissions: ["chat", "completion"],
      };
    } catch (error) {
      if (error.response?.status === 400 || error.response?.status === 401) {
        throw new Error("Invalid Google AI API key");
      }
      throw new Error("Failed to verify Google AI API key");
    }
  }

  // Mistral verification
  async verifyMistral(apiKey) {
    try {
      const response = await axios.get("https://api.mistral.ai/v1/models", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      });

      const models = response.data.data || [];

      return {
        valid: true,
        models: models.map((m) => ({
          id: m.id,
          name: m.id,
          provider: "mistral",
        })),
        permissions: ["chat", "completion"],
      };
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error("Invalid Mistral API key");
      }
      throw new Error("Failed to verify Mistral API key");
    }
  }

  // Cohere verification
  async verifyCohere(apiKey) {
    try {
      const response = await axios.get("https://api.cohere.ai/v1/models", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      });

      const models = response.data.models || [];

      return {
        valid: true,
        models: models.map((m) => ({
          id: m.name,
          name: m.name,
          provider: "cohere",
        })),
        permissions: ["chat", "completion", "embed"],
      };
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error("Invalid Cohere API key");
      }
      throw new Error("Failed to verify Cohere API key");
    }
  }

  // Extract OpenAI permissions from models
  extractOpenAIPermissions(models) {
    const permissions = [];

    if (models.some((model) => model.id.includes("gpt"))) {
      permissions.push("chat", "completion");
    }
    if (models.some((model) => model.id.includes("dall-e"))) {
      permissions.push("image-generation");
    }
    if (models.some((model) => model.id.includes("whisper"))) {
      permissions.push("audio-transcription");
    }
    if (models.some((model) => model.id.includes("tts"))) {
      permissions.push("text-to-speech");
    }
    if (models.some((model) => model.id.includes("embedding"))) {
      permissions.push("embeddings");
    }

    return permissions;
  }

  // Save API key for user (one per provider)
  async saveApiKey(userId, provider, apiKey, keyName = null) {
    try {
      // Verify the API key first
      const verification = await this.verifyApiKey(provider, apiKey);

      if (!verification.valid) {
        throw new Error(verification.error || "Invalid API key");
      }

      // Deactivate any existing API keys for this user and provider
      await ApiKey.deactivateForUserAndProvider(userId, provider);

      // Encrypt the API key
      const encryptedApiKey = encryptionService.encryptApiKey(apiKey);

      // Generate key prefix for identification
      const keyPrefix = apiKey.substring(0, 7) + "...";

      // Use provider name as default key name if not provided
      const finalKeyName =
        keyName ||
        `${provider.charAt(0).toUpperCase() + provider.slice(1)} API Key`;

      // Create new API key record
      const apiKeyRecord = new ApiKey({
        userId,
        provider,
        keyName: finalKeyName,
        encryptedApiKey,
        keyPrefix,
        isVerified: true,
        verifiedAt: new Date(),
        metadata: {
          organizationId: verification.organizationId,
          permissions: verification.permissions,
          models: verification.models,
          lastValidation: new Date(),
        },
      });

      const savedApiKey = await apiKeyRecord.save();

      return {
        success: true,
        apiKey: {
          _id: savedApiKey._id,
          provider: savedApiKey.provider,
          keyName: savedApiKey.keyName,
          keyPrefix: savedApiKey.keyPrefix,
          isVerified: savedApiKey.isVerified,
          createdAt: savedApiKey.createdAt,
        },
        verification: {
          models: verification.models,
          permissions: verification.permissions,
        },
      };
    } catch (error) {
      console.error("Error saving API key:", error);
      throw error;
    }
  }

  // Get all API keys for user
  // Get all API keys for user (decrypted)
  async getUserApiKeys(userId) {
    try {
      // Fetch all active keys including the encrypted key
      const apiKeys = await ApiKey.find({
        userId,
        isActive: true,
      }).select("+encryptedApiKey"); // include encryptedApiKey

      // Decrypt each key before returning
      const decryptedKeys = apiKeys.map((k) => ({
        provider: k.provider,
        keyName: k.keyName,
        apiKey: encryptionService.decryptApiKey(k.encryptedApiKey), // decrypt
        createdAt: k.createdAt,
      }));

      return decryptedKeys;
    } catch (error) {
      console.error("Error fetching user API keys:", error);
      throw new Error("Failed to fetch API keys");
    }
  }

  // Get API key for specific provider
  async getUserApiKeyForProvider(userId, provider) {
    try {
      const apiKey = await ApiKey.findOne({
        userId,
        provider,
        isActive: true,
      }).select("-encryptedApiKey");

      return apiKey;
    } catch (error) {
      console.error("Error fetching API key:", error);
      throw new Error("Failed to fetch API key");
    }
  }

  // Test API key connection
  async testApiKey(userId, provider) {
    try {
      const apiKeyRecord = await ApiKey.findOne({
        userId,
        provider,
        isActive: true,
      }).select("+encryptedApiKey");

      if (!apiKeyRecord) {
        throw new Error("No API key found for this provider");
      }

      const decryptedKey = encryptionService.decryptApiKey(
        apiKeyRecord.encryptedApiKey
      );
      const verification = await this.verifyApiKey(provider, decryptedKey);

      // Update verification status
      if (verification.valid) {
        await apiKeyRecord.markAsVerified({
          models: verification.models,
          permissions: verification.permissions,
        });
        await apiKeyRecord.updateLastUsed();
      } else {
        await apiKeyRecord.recordValidationError(verification.error);
      }

      return {
        valid: verification.valid,
        message: verification.valid
          ? "API key is working correctly"
          : verification.error,
        models: verification.models,
      };
    } catch (error) {
      console.error("Error testing API key:", error);
      return {
        valid: false,
        message: error.message || "Failed to test API key",
      };
    }
  }

  // Delete API key
  async deleteApiKey(userId, provider) {
    try {
      const apiKeyRecord = await ApiKey.findOne({
        userId,
        provider,
        isActive: true,
      });

      if (apiKeyRecord) {
        await apiKeyRecord.deactivate();
      }

      return { success: true };
    } catch (error) {
      console.error("Error deleting API key:", error);
      throw new Error("Failed to delete API key");
    }
  }

  // Validate API key (for validation endpoint)
  async validateApiKey(provider, apiKey) {
    try {
      const verification = await this.verifyApiKey(provider, apiKey);
      return {
        isValid: verification.valid,
        message: verification.valid
          ? `${provider} API key is valid`
          : "Invalid API key",
        models: verification.models || [],
      };
    } catch (error) {
      return {
        isValid: false,
        message: error.message || "Failed to validate API key",
        models: [],
      };
    }
  }
}

module.exports = new ApiKeyService();
