const express = require("express");
const { auth } = require("../middleware/auth");
const validateRequest = require("../middleware/validation");
const responseHandler = require("../utils/response.handler");
const apiKeyService = require("../services/apiKey.service");
const { body, param } = require("express-validator");

const router = express.Router();

// Reusable validations
const providers = ["openai", "anthropic", "google-ai", "mistral", "cohere"];

const providerValidation = [
  param("provider").isIn(providers).withMessage("Invalid provider"),
];

const saveApiKeyValidation = [
  body("provider").isIn(providers).withMessage("Invalid provider"),
  body("apiKey").notEmpty().withMessage("API key is required"),
  body("keyName").optional().isString(),
];

const saveApiKeysValidation = [
  body("keys")
    .isArray({ min: 1 })
    .withMessage("keys must be a non-empty array"),
  body("keys.*.provider")
    .isIn(providers)
    .withMessage("Invalid provider in keys array"),
  body("keys.*.apiKey")
    .notEmpty()
    .withMessage("API key is required for each provider"),
  body("keys.*.keyName").optional().isString(),
];
// ----------------------------
// Validate API key without saving
// ----------------------------
router.post(
  "/validate",
  auth,
  saveApiKeyValidation,
  validateRequest,
  async (req, res) => {
    try {
      const { provider, apiKey } = req.body;
      const result = await apiKeyService.validateApiKey(provider, apiKey);
      return responseHandler.success(
        res,
        result,
        "API key validated successfully"
      );
    } catch (error) {
      console.error("API key validation error:", error);
      return responseHandler.error(
        res,
        error.message || "Failed to validate API key",
        400,
        error
      );
    }
  }
);

// ----------------------------
// Save new API key (both )
// ----------------------------
router.post(
  "/",
  auth,
  saveApiKeysValidation,
  validateRequest,
  async (req, res) => {
    try {
      const { keys } = req.body;
      const userId = req.user._id;

      const results = [];

      for (const k of keys) {
        const saved = await apiKeyService.saveApiKey(
          userId,
          k.provider,
          k.apiKey,
          k.keyName
        );
        results.push({ provider: k.provider, result: saved });
      }

      return responseHandler.created(
        res,
        results,
        "API keys saved and verified successfully"
      );
    } catch (error) {
      console.error("Save multiple API keys error:", error);
      return responseHandler.error(
        res,
        error.message || "Failed to save API keys",
        400,
        error
      );
    }
  }
);

// ----------------------------
// Get all API keys (masked)
// ----------------------------
router.get("/", auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const apiKeys = await apiKeyService.getUserApiKeys(userId);

    return responseHandler.success(
      res,
      {
        apiKeys: apiKeys,
        count: apiKeys.length,
      },
      "API keys retrieved successfully"
    );
  } catch (error) {
    console.error("Get API keys error:", error);
    return responseHandler.error(res, "Failed to fetch API keys", 500, error);
  }
});

// ----------------------------
// Get API key for specific provider (masked)
// ----------------------------
router.get(
  "/:provider",
  auth,
  providerValidation,
  validateRequest,
  async (req, res) => {
    try {
      const userId = req.user._id;
      const { provider } = req.params;

      const apiKey = await apiKeyService.getUserApiKeyForProvider(
        userId,
        provider
      );

      if (!apiKey) {
        return responseHandler.error(
          res,
          `No API key found for ${provider}`,
          404
        );
      }

      const masked = apiKey.apiKey ? `${apiKey.apiKey.slice(0, 4)}****` : null;

      return responseHandler.success(
        res,
        {
          provider: apiKey.provider,
          keyName: apiKey.keyName,
          maskedKey: masked,
          createdAt: apiKey.createdAt,
        },
        `API key for ${provider} retrieved`
      );
    } catch (error) {
      console.error("Get API key error:", error);
      return responseHandler.error(res, "Failed to fetch API key", 500, error);
    }
  }
);

// ----------------------------
// Test API key for provider
// ----------------------------
router.post(
  "/:provider/test",
  auth,
  providerValidation,
  validateRequest,
  async (req, res) => {
    try {
      const userId = req.user._id;
      const { provider } = req.params;

      const result = await apiKeyService.testApiKey(userId, provider);

      return responseHandler.success(
        res,
        result,
        `${provider} API key tested successfully`
      );
    } catch (error) {
      console.error("Test API key error:", error);
      return responseHandler.error(
        res,
        error.message || "Failed to test API key",
        500,
        error
      );
    }
  }
);

// ----------------------------
// Update API key (replaces old one)
// ----------------------------
router.put(
  "/:provider",
  auth,
  [
    ...providerValidation,
    body("apiKey").notEmpty().withMessage("API key is required"),
    body("keyName").optional().isString(),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const userId = req.user._id;
      const { provider } = req.params;
      const { apiKey, keyName } = req.body;

      const result = await apiKeyService.saveApiKey(
        userId,
        provider,
        apiKey,
        keyName
      );

      return responseHandler.success(
        res,
        result,
        `${provider} API key updated successfully`
      );
    } catch (error) {
      console.error("Update API key error:", error);
      return responseHandler.error(
        res,
        error.message || "Failed to update API key",
        400,
        error
      );
    }
  }
);

// ----------------------------
// Delete API key
// ----------------------------
router.delete(
  "/:provider",
  auth,
  providerValidation,
  validateRequest,
  async (req, res) => {
    try {
      const userId = req.user._id;
      const { provider } = req.params;

      await apiKeyService.deleteApiKey(userId, provider);

      return responseHandler.success(
        res,
        null,
        `${provider} API key deleted successfully`
      );
    } catch (error) {
      console.error("Delete API key error:", error);
      return responseHandler.error(
        res,
        error.message || "Failed to delete API key",
        500,
        error
      );
    }
  }
);

module.exports = router;
