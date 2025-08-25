const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const responseHandler = require('../utils/response.handler');
const UserIntegration = require('../models/UserIntegration');
const oauthService = require('../services/oauthService');
const { getMCPServerById } = require('../constants/integrations');

/**
 * @route   GET /api/user-integrations
 * @desc    Get user's integrations
 * @access  Private
 */
router.get('/', auth, async (req, res) => {
  try {
    const { type, status } = req.query;
    const userId = req.user.id;

    let query = { userId };
    if (type) query.integrationType = type;
    if (status) query.status = status;

    const integrations = await UserIntegration.find(query)
      .select('-connectionData.accessToken -connectionData.refreshToken -connectionData.clientSecret')
      .sort({ createdAt: -1 });

    return responseHandler.success(res, {
      integrations,
      total: integrations.length
    }, 'User integrations retrieved successfully');
  } catch (error) {
    console.error('Error fetching user integrations:', error);
    return responseHandler.error(res, 'Failed to fetch integrations', 500, error);
  }
});

/**
 * @route   GET /api/user-integrations/:integrationId
 * @desc    Get specific user integration
 * @access  Private
 */
router.get('/:integrationId', auth, async (req, res) => {
  try {
    const { integrationId } = req.params;
    const userId = req.user.id;

    const integration = await UserIntegration.findByIntegration(userId, integrationId);

    if (!integration) {
      return res.status(404).json({
        status: 'error',
        message: 'Integration not found'
      });
    }

    res.json({
      status: 'success',
      data: {
        integration
      }
    });
  } catch (error) {
    console.error('Error fetching integration:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch integration'
    });
  }
});

/**
 * @route   POST /api/user-integrations/:integrationId/connect
 * @desc    Get OAuth URL for MCP server connection
 * @access  Private
 */
router.post('/:integrationId/connect', auth, async (req, res) => {
  try {
    const { integrationId } = req.params;
    const userId = req.user.id;

    const mcpServer = getMCPServerById(integrationId);
    if (!mcpServer) {
      return res.status(404).json({
        status: 'error',
        message: 'Integration not found'
      });
    }

    if (mcpServer.status !== 'active') {
      return res.status(400).json({
        status: 'error',
        message: 'Integration is not available'
      });
    }

    // Use backend callback URL (not frontend)
    const backendCallbackUrl = `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/user-integrations/oauth/callback/${integrationId}`;

    // Generate OAuth URL
    const oauthData = await oauthService.generateAuthUrl(userId, integrationId, backendCallbackUrl);

    res.json({
      status: 'success',
      data: {
        authUrl: oauthData.authUrl
      }
    });
  } catch (error) {
    console.error('Error initiating OAuth:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to initiate OAuth connection'
    });
  }
});

/**
 * @route   GET /api/user-integrations/oauth/callback/:integrationId
 * @desc    Handle OAuth callback and redirect to frontend
 * @access  Public (but secured with state parameter)
 */
router.get('/oauth/callback/:integrationId', async (req, res) => {
  try {
    const { integrationId } = req.params;
    const { code, state, error } = req.query;
    
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    if (error) {
      // Redirect to frontend with error
      return res.redirect(`${frontendUrl}/oauth/callback?error=${encodeURIComponent(error)}&integration=${integrationId}`);
    }

    const result = await oauthService.handleCallback(code, state, error);

    // Redirect to frontend with success
    res.redirect(`${frontendUrl}/oauth/callback?success=true&integration=${integrationId}&name=${encodeURIComponent(result.integration.integrationName)}`);
  } catch (error) {
    console.error('Error handling OAuth callback:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const { integrationId } = req.params;
    res.redirect(`${frontendUrl}/oauth/callback?error=${encodeURIComponent(error.message)}&integration=${integrationId}`);
  }
});

/**
 * @route   POST /api/user-integrations/:integrationId/disconnect
 * @desc    Disconnect integration
 * @access  Private
 */
router.post('/:integrationId/disconnect', auth, async (req, res) => {
  try {
    const { integrationId } = req.params;
    const userId = req.user.id;

    const integration = await oauthService.disconnectIntegration(userId, integrationId);

    res.json({
      status: 'success',
      data: {
        integration,
        message: 'Integration disconnected successfully'
      }
    });
  } catch (error) {
    console.error('Error disconnecting integration:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to disconnect integration'
    });
  }
});

/**
 * @route   POST /api/user-integrations/:integrationId/test
 * @desc    Test integration connection
 * @access  Private
 */
router.post('/:integrationId/test', auth, async (req, res) => {
  try {
    const { integrationId } = req.params;
    const userId = req.user.id;

    const result = await oauthService.testConnection(userId, integrationId);

    res.json({
      status: 'success',
      data: result
    });
  } catch (error) {
    console.error('Error testing integration:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to test integration'
    });
  }
});

/**
 * @route   PUT /api/user-integrations/:integrationId/settings
 * @desc    Update integration settings
 * @access  Private
 */
router.put('/:integrationId/settings', auth, async (req, res) => {
  try {
    const { integrationId } = req.params;
    const userId = req.user.id;
    const { settings } = req.body;

    const integration = await UserIntegration.findByIntegration(userId, integrationId);

    if (!integration) {
      return res.status(404).json({
        status: 'error',
        message: 'Integration not found'
      });
    }

    // Update settings
    if (settings.autoSync !== undefined) {
      integration.settings.autoSync = settings.autoSync;
    }
    if (settings.syncInterval !== undefined) {
      integration.settings.syncInterval = settings.syncInterval;
    }
    if (settings.notifications !== undefined) {
      integration.settings.notifications = {
        ...integration.settings.notifications,
        ...settings.notifications
      };
    }

    await integration.save();

    res.json({
      status: 'success',
      data: {
        integration,
        message: 'Settings updated successfully'
      }
    });
  } catch (error) {
    console.error('Error updating integration settings:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update settings'
    });
  }
});

/**
 * @route   PUT /api/user-integrations/:integrationId/capabilities
 * @desc    Update integration capabilities
 * @access  Private
 */
router.put('/:integrationId/capabilities', auth, async (req, res) => {
  try {
    const { integrationId } = req.params;
    const userId = req.user.id;
    const { capabilities } = req.body;

    const integration = await UserIntegration.findByIntegration(userId, integrationId);

    if (!integration) {
      return res.status(404).json({
        status: 'error',
        message: 'Integration not found'
      });
    }

    // Update capabilities
    capabilities.forEach(capUpdate => {
      const existingCap = integration.capabilities.find(cap => cap.action === capUpdate.action);
      if (existingCap) {
        existingCap.enabled = capUpdate.enabled;
      }
    });

    await integration.save();

    res.json({
      status: 'success',
      data: {
        integration,
        message: 'Capabilities updated successfully'
      }
    });
  } catch (error) {
    console.error('Error updating capabilities:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update capabilities'
    });
  }
});

/**
 * @route   POST /api/user-integrations/:integrationId/refresh-token
 * @desc    Refresh OAuth token for integration
 * @access  Private
 */
router.post('/:integrationId/refresh-token', auth, async (req, res) => {
  try {
    const { integrationId } = req.params;
    const userId = req.user.id;

    const accessToken = await oauthService.getValidAccessToken(userId, integrationId);

    res.json({
      status: 'success',
      data: {
        message: 'Token refreshed successfully',
        tokenValid: true
      }
    });
  } catch (error) {
    console.error('Error refreshing token:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to refresh token'
    });
  }
});

/**
 * @route   POST /api/user-integrations/:integrationId/sync
 * @desc    Manual sync for integration
 * @access  Private
 */
router.post('/:integrationId/sync', auth, async (req, res) => {
  try {
    const { integrationId } = req.params;
    const userId = req.user.id;

    const integration = await UserIntegration.findByIntegration(userId, integrationId);

    if (!integration) {
      return res.status(404).json({
        status: 'error',
        message: 'Integration not found'
      });
    }

    if (integration.status !== 'connected') {
      return res.status(400).json({
        status: 'error',
        message: 'Integration is not connected'
      });
    }

    // Update sync metadata
    integration.metadata.lastSyncAt = new Date();
    integration.metadata.syncCount += 1;
    await integration.save();

    res.json({
      status: 'success',
      data: {
        integration,
        message: 'Sync completed successfully'
      }
    });
  } catch (error) {
    console.error('Error syncing integration:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to sync integration'
    });
  }
});

/**
 * @route   GET /api/user-integrations/summary
 * @desc    Get user integrations summary
 * @access  Private
 */
router.get('/summary', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const integrations = await UserIntegration.findByUser(userId);
    
    const summary = {
      total: integrations.length,
      connected: integrations.filter(i => i.status === 'connected').length,
      mcpServers: integrations.filter(i => i.integrationType === 'mcp_server').length,
      apiProviders: integrations.filter(i => i.integrationType === 'api_provider').length,
      lastSyncAt: null,
      recentActivity: []
    };

    // Find most recent sync
    const recentSync = integrations
      .filter(i => i.metadata.lastSyncAt)
      .sort((a, b) => new Date(b.metadata.lastSyncAt) - new Date(a.metadata.lastSyncAt))[0];
    
    if (recentSync) {
      summary.lastSyncAt = recentSync.metadata.lastSyncAt;
    }

    // Get recent activity (last 5 used capabilities)
    const recentActivity = [];
    integrations.forEach(integration => {
      integration.capabilities
        .filter(cap => cap.lastUsed)
        .forEach(cap => {
          recentActivity.push({
            integrationName: integration.integrationName,
            action: cap.action,
            lastUsed: cap.lastUsed
          });
        });
    });

    summary.recentActivity = recentActivity
      .sort((a, b) => new Date(b.lastUsed) - new Date(a.lastUsed))
      .slice(0, 5);

    res.json({
      status: 'success',
      data: summary
    });
  } catch (error) {
    console.error('Error fetching integrations summary:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch integrations summary'
    });
  }
});

module.exports = router;
