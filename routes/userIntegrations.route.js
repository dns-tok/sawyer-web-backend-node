const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const responseHandler = require('../utils/response.handler');
const UserIntegration = require('../models/UserIntegration');
const oauthService = require('../services/oauth.service');
const githubService = require('../services/github.service');
const jiraService = require('../services/jira.service');
const notionService = require('../services/notion.service');
const encryptionService = require('../services/encryption.service');
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
    const backendCallbackUrl = `${process.env.BACKEND_URL || 'http://localhost:3005'}/api/user-integrations/oauth/callback/${integrationId}`;

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
    
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    console.log("CALLBACK ====> ", req.query);

    if (error) {
      // Redirect to frontend with error
      return res.redirect(`${frontendUrl}/oauth/callback?error=${encodeURIComponent(error)}&integration=${integrationId}`);
    }

    const result = await oauthService.handleCallback(code, state, error);

    // Redirect to frontend with success
    res.redirect(`${frontendUrl}/oauth/callback?success=true&integration=${integrationId}&name=${encodeURIComponent(result.integration.integrationName)}`);
  } catch (error) {
    console.error('Error handling OAuth callback:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
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

/**
 * @route   GET /api/user-integrations/github/auth
 * @desc    Initiate GitHub OAuth flow
 * @access  Private
 */
router.get('/github/auth', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const state = Buffer.from(JSON.stringify({ userId, timestamp: Date.now() })).toString('base64');

    const authUrl = githubService.generateAuthUrl(state);

    return responseHandler.success(res, { authUrl }, 'GitHub authorization URL generated');
  } catch (error) {
    console.error('GitHub auth initiation error:', error);
    return responseHandler.error(res, 'Failed to initiate GitHub authentication', 500, error);
  }
});

/**
 * @route   GET /api/user-integrations/github/callback
 * @desc    Handle GitHub OAuth callback
 * @access  Public
 */
router.get('/github/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`${process.env.FRONTEND_URL}/integrations?error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return res.redirect(`${process.env.FRONTEND_URL}/integrations?error=missing_parameters`);
    }

    // Decode state
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { userId } = stateData;

    // Exchange code for token
    const tokenData = await githubService.exchangeCodeForToken(code, state);

    // Get user info
    const githubUser = await githubService.getUser(tokenData.accessToken);

    // Save or update integration
    const integration = await UserIntegration.findOneAndUpdate(
      { userId, integrationId: 'github' },
      {
        userId,
        integrationId: 'github',
        integrationName: 'GitHub',
        integrationType: 'mcp_server',
        status: 'connected',
        connectionData: {
          accessToken: tokenData.accessToken,
          tokenType: tokenData.tokenType,
          scope: tokenData.scope,
          githubUserId: githubUser.id,
          githubUsername: githubUser.login
        },
        metadata: {
          connectedAt: new Date(),
          lastSyncAt: new Date(),
          userInfo: githubUser
        },
        capabilities: ['repositories', 'issues', 'commits', 'branches']
      },
      { upsert: true, new: true }
    );

    return res.redirect(`${process.env.FRONTEND_URL}/integrations?success=github_connected`);
  } catch (error) {
    console.error('GitHub callback error:', error);
    return res.redirect(`${process.env.FRONTEND_URL}/integrations?error=connection_failed`);
  }
});

/**
 * @route   GET /api/user-integrations/github/repositories
 * @desc    Get GitHub repositories for selection
 * @access  Private
 */
router.get('/github/repositories', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      page = 1, 
      per_page = 30, 
      sort = 'updated', 
      affiliation = 'owner,collaborator,organization_member',
      visibility, // all, public, private
      q // search query
    } = req.query;

    const integration = await UserIntegration.findOne({
      userId,
      integrationId: 'github',
      status: 'connected'
    });

    if (!integration) {
      return responseHandler.notFound(res, 'GitHub integration not found or not connected');
    }

    // Decrypt the access token
    const decryptedAccessToken = encryptionService.decrypt(integration.connectionData.accessToken);

    const repositories = await githubService.getRepositories(
      decryptedAccessToken,
      { 
        page: parseInt(page), 
        per_page: parseInt(per_page), 
        sort, 
        affiliation,
        visibility,
        q // pass search query
      }
    );

    return responseHandler.success(res, { repositories }, 'GitHub repositories retrieved successfully');
  } catch (error) {
    console.error('Get GitHub repositories error:', error);
    return responseHandler.error(res, 'Failed to get GitHub repositories', 500, error);
  }
});

/**
 * @route   GET /api/user-integrations/github/repositories/:owner/:repo/branches
 * @desc    Get branches for a specific repository
 * @access  Private
 */
router.get('/github/repositories/:owner/:repo/branches', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { owner, repo } = req.params;
    const { page = 1, per_page = 30 } = req.query;

    const integration = await UserIntegration.findOne({
      userId,
      integrationId: 'github',
      status: 'connected'
    });

    if (!integration) {
      return responseHandler.notFound(res, 'GitHub integration not found or not connected');
    }

    // Decrypt the access token
    const decryptedAccessToken = encryptionService.decrypt(integration.connectionData.accessToken);

    const branches = await githubService.getBranches(
      decryptedAccessToken,
      owner,
      repo,
      { page: parseInt(page), per_page: parseInt(per_page) }
    );

    return responseHandler.success(res, { branches }, 'Repository branches retrieved successfully');
  } catch (error) {
    console.error('Get repository branches error:', error);
    return responseHandler.error(res, 'Failed to get repository branches', 500, error);
  }
});

/**
 * @route   GET /api/user-integrations/jira/auth
 * @desc    Initiate Jira OAuth flow
 * @access  Private
 */
router.get('/jira/auth', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const state = Buffer.from(JSON.stringify({ userId, timestamp: Date.now() })).toString('base64');

    const authUrl = jiraService.generateAuthUrl(state);

    return responseHandler.success(res, { authUrl }, 'Jira authorization URL generated');
  } catch (error) {
    console.error('Jira auth initiation error:', error);
    return responseHandler.error(res, 'Failed to initiate Jira authentication', 500, error);
  }
});

/**
 * @route   GET /api/user-integrations/jira/callback
 * @desc    Handle Jira OAuth callback
 * @access  Public
 */
router.get('/jira/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`${process.env.FRONTEND_URL}/integrations?error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return res.redirect(`${process.env.FRONTEND_URL}/integrations?error=missing_parameters`);
    }

    // Decode state
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { userId } = stateData;

    // Exchange code for token
    const tokenData = await jiraService.exchangeCodeForToken(code, state);

    // Get accessible resources
    const resources = await jiraService.getAccessibleResources(tokenData.accessToken);

    // Get user info from first accessible resource
    let userInfo = null;
    if (resources.length > 0) {
      userInfo = await jiraService.getCurrentUser(tokenData.accessToken, resources[0].id);
    }

    // Save or update integration
    const integration = await UserIntegration.findOneAndUpdate(
      { userId, integrationId: 'jira' },
      {
        userId,
        integrationId: 'jira',
        integrationName: 'Jira',
        integrationType: 'mcp_server',
        status: 'connected',
        connectionData: {
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken,
          tokenType: tokenData.tokenType,
          expiresIn: tokenData.expiresIn,
          scope: tokenData.scope,
          resources: resources
        },
        metadata: {
          connectedAt: new Date(),
          lastSyncAt: new Date(),
          userInfo: userInfo,
          availableResources: resources
        },
        capabilities: ['projects', 'boards', 'issues', 'sprints']
      },
      { upsert: true, new: true }
    );

    return res.redirect(`${process.env.FRONTEND_URL}/integrations?success=jira_connected`);
  } catch (error) {
    console.error('Jira callback error:', error);
    return res.redirect(`${process.env.FRONTEND_URL}/integrations?error=connection_failed`);
  }
});

/**
 * @route   GET /api/user-integrations/jira/resources
 * @desc    Get Jira accessible resources (sites)
 * @access  Private
 */
router.get('/jira/resources', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const integration = await UserIntegration.findOne({
      userId,
      integrationId: 'jira',
      status: 'connected'
    });

    if (!integration) {
      return responseHandler.notFound(res, 'Jira integration not found or not connected');
    }

    const resources = integration.connectionData.resources || [];

    return responseHandler.success(res, { resources }, 'Jira resources retrieved successfully');
  } catch (error) {
    console.error('Get Jira resources error:', error);
    return responseHandler.error(res, 'Failed to get Jira resources', 500, error);
  }
});

/**
 * @route   GET /api/user-integrations/jira/projects
 * @desc    Get Jira projects for selection
 * @access  Private
 */
router.get('/jira/projects', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { cloudId, recent = 20 } = req.query;

    const integration = await UserIntegration.findOne({
      userId,
      integrationId: 'jira',
      status: 'connected'
    });

    if (!integration) {
      return responseHandler.notFound(res, 'Jira integration not found or not connected');
    }

    // Use first resource if cloudId not specified
    const targetCloudId = cloudId || integration.connectionData.resources[0]?.id;

    if (!targetCloudId) {
      return responseHandler.error(res, 'No Jira cloud ID available', 400);
    }

    // Decrypt the access token
    const decryptedAccessToken = encryptionService.decrypt(integration.connectionData.accessToken);

    const projects = await jiraService.getProjects(
      decryptedAccessToken,
      targetCloudId,
      { recent: parseInt(recent) }
    );

    return responseHandler.success(res, { projects, cloudId: targetCloudId }, 'Jira projects retrieved successfully');
  } catch (error) {
    console.error('Get Jira projects error:', error);
    return responseHandler.error(res, 'Failed to get Jira projects', 500, error);
  }
});

/**
 * @route   GET /api/user-integrations/jira/boards
 * @desc    Get Jira boards for selection
 * @access  Private
 */
router.get('/jira/boards', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { cloudId, projectKeyOrId, type, maxResults = 50, startAt = 0 } = req.query;

    const integration = await UserIntegration.findOne({
      userId,
      integrationId: 'jira',
      status: 'connected'
    });

    if (!integration) {
      return responseHandler.notFound(res, 'Jira integration not found or not connected');
    }

    // Use first resource if cloudId not specified
    const targetCloudId = cloudId || integration.connectionData.resources[0]?.id;

    if (!targetCloudId) {
      return responseHandler.error(res, 'No Jira cloud ID available', 400);
    }

    // Decrypt the access token
    const decryptedAccessToken = encryptionService.decrypt(integration.connectionData.accessToken);

    const boardsData = await jiraService.getBoards(
      decryptedAccessToken,
      targetCloudId,
      {
        projectKeyOrId,
        type,
        maxResults: parseInt(maxResults),
        startAt: parseInt(startAt)
      }
    );

    return responseHandler.success(res, { ...boardsData, cloudId: targetCloudId }, 'Jira boards retrieved successfully');
  } catch (error) {
    console.error('Get Jira boards error:', error);
    return responseHandler.error(res, 'Failed to get Jira boards', 500, error);
  }
});

/**
 * @route   GET /api/user-integrations/notion/databases
 * @desc    Get Notion databases for selection
 * @access  Private
 */
router.get('/notion/databases', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page_size = 100 } = req.query;

    const integration = await UserIntegration.findOne({
      userId,
      integrationId: 'notion',
      status: 'connected'
    });

    if (!integration) {
      return responseHandler.notFound(res, 'Notion integration not found or not connected');
    }

    // Decrypt the access token
    const decryptedAccessToken = encryptionService.decrypt(integration.connectionData.accessToken);

    // This would need to be implemented in notionService
    const databases = await notionService.getDatabases(
      decryptedAccessToken,
      { page_size: parseInt(page_size) }
    );

    return responseHandler.success(res, { databases }, 'Notion databases retrieved successfully');
  } catch (error) {
    console.error('Get Notion databases error:', error);
    return responseHandler.error(res, 'Failed to get Notion databases', 500, error);
  }
});

/**
 * @route   GET /api/user-integrations/notion/pages
 * @desc    Get Notion pages for selection
 * @access  Private
 */
router.get('/notion/pages', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page_size = 100, filter } = req.query;

    const integration = await UserIntegration.findOne({
      userId,
      integrationId: 'notion',
      status: 'connected'
    });

    if (!integration) {
      return responseHandler.notFound(res, 'Notion integration not found or not connected');
    }

    // Decrypt the access token
    const decryptedAccessToken = encryptionService.decrypt(integration.connectionData.accessToken);

    // This would need to be implemented in notionService
    const pages = await notionService.getPages(
      decryptedAccessToken,
      { page_size: parseInt(page_size), filter }
    );

    return responseHandler.success(res, { pages }, 'Notion pages retrieved successfully');
  } catch (error) {
    console.error('Get Notion pages error:', error);
    return responseHandler.error(res, 'Failed to get Notion pages', 500, error);
  }
});

/**
 * @route   GET /api/user-integrations/notion/resources
 * @desc    Get all Notion resources (databases and pages) combined
 * @access  Private
 */
router.get('/notion/resources', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page_size = 100, q } = req.query;

    const integration = await UserIntegration.findOne({
      userId,
      integrationId: 'notion',
      status: 'connected'
    });

    if (!integration) {
      return responseHandler.notFound(res, 'Notion integration not found or not connected');
    }

    // Decrypt the access token
    const decryptedAccessToken = encryptionService.decrypt(integration.connectionData.accessToken);

    let allResources = [];

    // If search query is provided, use search endpoint
    if (q && q.trim()) {
      const searchResults = await notionService.searchPages(userId, q, parseInt(page_size));
      allResources = searchResults.results || [];
    } else {
      // Fetch both databases and pages
      const [databases, pages] = await Promise.all([
        notionService.getDatabases(decryptedAccessToken, { page_size: Math.floor(parseInt(page_size) / 2) }),
        notionService.getPages(decryptedAccessToken, { page_size: Math.ceil(parseInt(page_size) / 2) })
      ]);

      // Combine and add type indicators
      const databasesWithType = databases.map(db => ({
        ...db,
        type: 'database',
        title: db.title || db.name
      }));

      const pagesWithType = pages.map(page => ({
        ...page,
        type: 'page',
        title: page.title || page.name
      }));

      allResources = [...databasesWithType, ...pagesWithType];
    }

    return responseHandler.success(res, { resources: allResources }, 'Notion resources retrieved successfully');
  } catch (error) {
    console.error('Get Notion resources error:', error);
    return responseHandler.error(res, 'Failed to get Notion resources', 500, error);
  }
});

/**
 * @route   GET /api/user-integrations/notion/search
 * @desc    Search Notion content
 * @access  Private
 */
router.get('/notion/search', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { query, filter, sort, page_size = 100 } = req.query;

    if (!query) {
      return responseHandler.error(res, 'Search query is required', 400);
    }

    const integration = await UserIntegration.findOne({
      userId,
      integrationId: 'notion',
      status: 'connected'
    });

    if (!integration) {
      return responseHandler.notFound(res, 'Notion integration not found or not connected');
    }

    // Decrypt the access token
    const decryptedAccessToken = encryptionService.decrypt(integration.connectionData.accessToken);

    // This would need to be implemented in notionService
    const results = await notionService.search(
      decryptedAccessToken,
      {
        query,
        filter: filter ? JSON.parse(filter) : undefined,
        sort: sort ? JSON.parse(sort) : undefined,
        page_size: parseInt(page_size)
      }
    );

    return responseHandler.success(res, { results }, 'Notion search completed successfully');
  } catch (error) {
    console.error('Notion search error:', error);
    return responseHandler.error(res, 'Failed to search Notion content', 500, error);
  }
});

module.exports = router;
