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
 * @route   GET /api/user-integrations/jira/resources
 * @desc    Get all Jira resources (projects and boards) combined
 * @access  Private
 */
router.get('/jira/resources', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      page = 1, 
      per_page = 30, 
      page_size = 100, 
      q 
    } = req.query;

    const integration = await UserIntegration.findOne({
      userId,
      integrationId: 'jira',
      status: 'connected'
    });

    if (!integration) {
      return responseHandler.notFound(res, 'Jira integration not found or not connected');
    }

    console.log('Jira integration found:', {
      integrationId: integration.integrationId,
      status: integration.status,
      hasConnectionData: !!integration.connectionData,
      hasResources: !!integration.connectionData?.resources,
      resourcesLength: integration.connectionData?.resources?.length,
      firstResourceId: integration.connectionData?.resources?.[0]?.id
    });

    // Get the Cloud ID from the first accessible resource
    const cloudId = integration.connectionData?.resources?.[0]?.id;
    if (!cloudId) {
      console.error('No Jira Cloud ID available. ConnectionData:', integration.connectionData);
      
      // Try to fetch resources again if they're missing
      try {
        console.log('Attempting to fetch missing Jira resources...');
        const decryptedAccessToken = encryptionService.decrypt(integration.connectionData.accessToken);
        const resources = await jiraService.getAccessibleResources(decryptedAccessToken);
        
        if (resources.length > 0) {
          // Update the integration with the fetched resources
          integration.connectionData.resources = resources;
          await integration.save();
          
          console.log('Successfully updated Jira integration with resources:', resources.length);
          // Continue with the first resource
          const newCloudId = resources[0].id;
          
          // Decrypt the access token again for the main flow
          const accessToken = encryptionService.decrypt(integration.connectionData.accessToken);
          
          return await handleJiraResourcesRequest(res, accessToken, newCloudId, req.query);
        } else {
          return responseHandler.error(res, 'No accessible Jira resources found. Please check your Jira permissions.', 400);
        }
      } catch (refetchError) {
        console.error('Failed to refetch Jira resources:', refetchError);
        return responseHandler.error(res, 'No Jira Cloud ID available. Please reconnect your Jira integration.', 400);
      }
    }

    // Decrypt the access token
    const decryptedAccessToken = encryptionService.decrypt(integration.connectionData.accessToken);

    return await handleJiraResourcesRequest(res, decryptedAccessToken, cloudId, req.query);
  } catch (error) {
    console.error('Get Jira resources error:', error);
    return responseHandler.error(res, 'Failed to get Jira resources', 500, error);
  }
});

// Helper function to handle Jira resources request
async function handleJiraResourcesRequest(res, accessToken, cloudId, queryParams) {
  const { 
    page = 1, 
    per_page = 30, 
    page_size = 100, 
    q 
  } = queryParams;

  let allResources = [];

  // Calculate the effective page size (use per_page if provided, otherwise page_size)
  const effectivePageSize = per_page ? parseInt(per_page) : parseInt(page_size);
  
  // If search query is provided, use search endpoint
  if (q && q.trim()) {
    try {
      // For now, search in projects and boards
      const [projects, boardsData] = await Promise.all([
        jiraService.getProjects(accessToken, cloudId, { recent: effectivePageSize }),
        jiraService.getBoards(accessToken, cloudId, { maxResults: effectivePageSize }).catch(error => {
          console.warn('Failed to fetch boards (likely scope issue):', error.message);
          return { boards: [] }; // Return empty boards if scope doesn't allow
        })
      ]);

      // Filter by search query
      const filteredProjects = projects.filter(project =>
        project.name.toLowerCase().includes(q.toLowerCase()) ||
        project.key.toLowerCase().includes(q.toLowerCase())
      );

      const filteredBoards = boardsData.boards.filter(board =>
        board.name.toLowerCase().includes(q.toLowerCase())
      );

      // Combine and add type indicators
      const projectsWithType = filteredProjects.map(project => ({
        ...project,
        type: 'project',
        title: `${project.name} (${project.key})`
      }));

      const boardsWithType = filteredBoards.map(board => ({
        ...board,
        type: 'board',
        title: board.name
      }));

      allResources = [...projectsWithType, ...boardsWithType];
    } catch (error) {
      console.error('Error fetching Jira resources with search:', error);
      // Fallback to just projects if boards fail
      const projects = await jiraService.getProjects(accessToken, cloudId, { recent: effectivePageSize });
      const filteredProjects = projects.filter(project =>
        project.name.toLowerCase().includes(q.toLowerCase()) ||
        project.key.toLowerCase().includes(q.toLowerCase())
      );
      const projectsWithType = filteredProjects.map(project => ({
        ...project,
        type: 'project',
        title: `${project.name} (${project.key})`
      }));
      allResources = projectsWithType;
    }
  } else {
    try {
      // Fetch both projects and boards
      const [projects, boardsData] = await Promise.all([
        jiraService.getProjects(accessToken, cloudId, { recent: Math.floor(effectivePageSize / 2) }),
        jiraService.getBoards(accessToken, cloudId, { maxResults: Math.ceil(effectivePageSize / 2) }).catch(error => {
          console.warn('Failed to fetch boards (likely scope issue):', error.message);
          return { boards: [] }; // Return empty boards if scope doesn't allow
        })
      ]);

      // Combine and add type indicators
      const projectsWithType = projects.map(project => ({
        ...project,
        type: 'project',
        title: `${project.name} (${project.key})`
      }));

      const boardsWithType = boardsData.boards.map(board => ({
        ...board,
        type: 'board',
        title: board.name
      }));

      console.log("JIRA_RESPONSE =====> ", projects, boardsData);

      allResources = [...projectsWithType, ...boardsWithType];
    } catch (error) {
      console.error('Error fetching Jira resources:', error);
      // Fallback to just projects if boards fail
      const projects = await jiraService.getProjects(accessToken, cloudId, { recent: effectivePageSize });
      const projectsWithType = projects.map(project => ({
        ...project,
        type: 'project',
        title: `${project.name} (${project.key})`
      }));
      allResources = projectsWithType;
    }
  }

    // Apply pagination if needed
    const currentPage = parseInt(page);
    const pageSize = effectivePageSize;
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedResources = allResources.slice(startIndex, endIndex);

    return responseHandler.success(res, { 
      resources: paginatedResources,
      pagination: {
        current_page: currentPage,
        per_page: pageSize,
        total: allResources.length,
        total_pages: Math.ceil(allResources.length / pageSize)
      },
      cloudId: cloudId
    }, 'Jira resources retrieved successfully');
}


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


module.exports = router;
