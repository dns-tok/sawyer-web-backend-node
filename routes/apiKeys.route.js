const express = require('express');
const { auth } = require('../middleware/auth');
const validateRequest = require('../middleware/validation');
const responseHandler = require('../utils/response.handler');
const apiKeyService = require('../services/apiKey.service');
const { body, param } = require('express-validator');

const router = express.Router();

// Validation rules
const saveApiKeyValidation = [
  body('provider').isIn(['openai', 'anthropic', 'google-ai', 'mistral', 'cohere']).withMessage('Invalid provider'),
  body('apiKey').notEmpty().withMessage('API key is required'),
  body('keyName').optional().isString()
];

const providerValidation = [
  param('provider').isIn(['openai', 'anthropic', 'google-ai', 'mistral', 'cohere']).withMessage('Invalid provider')
];

// @route   POST /api/api-keys/validate
// @desc    Validate an API key without saving
// @access  Private
router.post('/validate', auth, [
  body('provider').isIn(['openai', 'anthropic', 'google-ai', 'mistral', 'cohere']).withMessage('Invalid provider'),
  body('apiKey').notEmpty().withMessage('API key is required')
], validateRequest, async (req, res) => {
  try {
    const { provider, apiKey } = req.body;

    const result = await apiKeyService.validateApiKey(provider, apiKey);

    return responseHandler.success(res, result, 'API key validated successfully');
  } catch (error) {
    console.error('API key validation error:', error);
    return responseHandler.error(res, error.message || 'Failed to validate API key', 400, error);
  }
});

// @route   POST /api/api-keys
// @desc    Save API key for a provider (one per provider)
// @access  Private
router.post('/', auth, saveApiKeyValidation, validateRequest, async (req, res) => {
  try {
    const { provider, apiKey, keyName } = req.body;
    const userId = req.user._id;

    const result = await apiKeyService.saveApiKey(userId, provider, apiKey, keyName);

    return responseHandler.created(res, result, `${provider} API key saved and verified successfully`);
  } catch (error) {
    console.error('Save API key error:', error);
    return responseHandler.error(res, error.message || 'Failed to save API key', 400, error);
  }
});

// @route   GET /api/api-keys
// @desc    Get all user's API keys
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const apiKeys = await apiKeyService.getUserApiKeys(userId);

    return responseHandler.success(res, {
      apiKeys,
      count: apiKeys.length
    }, 'API keys retrieved successfully');
  } catch (error) {
    console.error('Get API keys error:', error);
    return responseHandler.error(res, 'Failed to fetch API keys', 500, error);
  }
});

// @route   GET /api/api-keys/:provider
// @desc    Get API key for specific provider
// @access  Private
router.get('/:provider', auth, providerValidation, validateRequest, async (req, res) => {
  try {
    const userId = req.user._id;
    const { provider } = req.params;
    
    const apiKey = await apiKeyService.getUserApiKeyForProvider(userId, provider);
    
    if (!apiKey) {
      return res.status(404).json({
        status: 'error',
        message: `No API key found for ${provider}`
      });
    }

    res.json({
      status: 'success',
      data: {
        apiKey
      }
    });
  } catch (error) {
    console.error('Get API key error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch API key'
    });
  }
});

// @route   POST /api/api-keys/:provider/test
// @desc    Test API key for a provider
// @access  Private
router.post('/:provider/test', auth, providerValidation, validateRequest, async (req, res) => {
  try {
    const userId = req.user._id;
    const { provider } = req.params;
    
    const result = await apiKeyService.testApiKey(userId, provider);

    res.json({
      status: 'success',
      data: result
    });
  } catch (error) {
    console.error('Test API key error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to test API key'
    });
  }
});

// @route   DELETE /api/api-keys/:provider
// @desc    Delete API key for a provider
// @access  Private
router.delete('/:provider', auth, providerValidation, validateRequest, async (req, res) => {
  try {
    const userId = req.user._id;
    const { provider } = req.params;
    
    await apiKeyService.deleteApiKey(userId, provider);

    res.json({
      status: 'success',
      message: `${provider} API key deleted successfully`
    });
  } catch (error) {
    console.error('Delete API key error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete API key'
    });
  }
});

// @route   PUT /api/api-keys/:provider
// @desc    Update API key for a provider (replaces existing)
// @access  Private
router.put('/:provider', auth, [
  ...providerValidation,
  body('apiKey').notEmpty().withMessage('API key is required'),
  body('keyName').optional().isString()
], validateRequest, async (req, res) => {
  try {
    const userId = req.user._id;
    const { provider } = req.params;
    const { apiKey, keyName } = req.body;

    // This will deactivate old key and save new one
    const result = await apiKeyService.saveApiKey(userId, provider, apiKey, keyName);

    res.json({
      status: 'success',
      message: `${provider} API key updated successfully`,
      data: result
    });
  } catch (error) {
    console.error('Update API key error:', error);
    res.status(400).json({
      status: 'error',
      message: error.message || 'Failed to update API key'
    });
  }
});

module.exports = router;