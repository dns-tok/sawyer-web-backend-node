const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const responseHandler = require('../utils/response.handler');
const {
  getAvailableMCPServers,
  getActiveMCPServers,
  getAvailableAPIProviders,
  getActiveAPIProviders,
  getMCPServerById,
  getAPIProviderById,
  getIntegrationsByCategory,
  INTEGRATION_CATEGORIES
} = require('../constants/integrations');

/**
 * @route   GET /api/integrations/mcp-servers
 * @desc    Get all available MCP servers
 * @access  Private
 */
router.get('/mcp-servers', auth, async (req, res) => {
  try {
    const { status } = req.query;

    let mcpServers;
    if (status === 'active') {
      mcpServers = getActiveMCPServers();
    } else {
      mcpServers = getAvailableMCPServers();
    }

    return responseHandler.success(res, {
      mcpServers,
      total: mcpServers.length
    }, 'MCP servers retrieved successfully');
  } catch (error) {
    console.error('Error fetching MCP servers:', error);
    return responseHandler.error(res, 'Failed to fetch MCP servers', 500, error);
  }
});

/**
 * @route   GET /api/integrations/mcp-servers/:id
 * @desc    Get specific MCP server by ID
 * @access  Private
 */
router.get('/mcp-servers/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const mcpServer = getMCPServerById(id);

    if (!mcpServer) {
      return responseHandler.notFound(res, 'MCP server not found');
    }

    return responseHandler.success(res, { mcpServer }, 'MCP server retrieved successfully');
  } catch (error) {
    console.error('Error fetching MCP server:', error);
    return responseHandler.error(res, 'Failed to fetch MCP server', 500, error);
  }
});

/**
 * @route   GET /api/integrations/api-providers
 * @desc    Get all available API providers
 * @access  Private
 */
router.get('/api-providers', auth, async (req, res) => {
  try {
    const { status } = req.query;

    let apiProviders;
    if (status === 'active') {
      apiProviders = getActiveAPIProviders();
    } else {
      apiProviders = getAvailableAPIProviders();
    }

    return responseHandler.success(res, {
      apiProviders,
      total: apiProviders.length
    }, 'API providers retrieved successfully');
  } catch (error) {
    console.error('Error fetching API providers:', error);
    return responseHandler.error(res, 'Failed to fetch API providers', 500, error);
  }
});

/**
 * @route   GET /api/integrations/api-providers/:id
 * @desc    Get specific API provider by ID
 * @access  Private
 */
router.get('/api-providers/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const apiProvider = getAPIProviderById(id);

    if (!apiProvider) {
      return responseHandler.notFound(res, 'API provider not found');
    }

    return responseHandler.success(res, { apiProvider }, 'API provider retrieved successfully');
  } catch (error) {
    console.error('Error fetching API provider:', error);
    return responseHandler.error(res, 'Failed to fetch API provider', 500, error);
  }
});

/**
 * @route   GET /api/integrations/categories
 * @desc    Get all integration categories
 * @access  Private
 */
router.get('/categories', auth, async (req, res) => {
  try {
    const categories = Object.values(INTEGRATION_CATEGORIES);

    return responseHandler.success(res, {
      categories,
      total: categories.length
    }, 'Integration categories retrieved successfully');
  } catch (error) {
    console.error('Error fetching categories:', error);
    return responseHandler.error(res, 'Failed to fetch categories', 500, error);
  }
});

/**
 * @route   GET /api/integrations/categories/:categoryId
 * @desc    Get integrations by category
 * @access  Private
 */
router.get('/categories/:categoryId', auth, async (req, res) => {
  try {
    const { categoryId } = req.params;
    const integrations = getIntegrationsByCategory(categoryId);

    if (!integrations.mcpServers.length && !integrations.apiProviders.length) {
      return responseHandler.notFound(res, 'Category not found or empty');
    }

    return responseHandler.success(res, {
      category: INTEGRATION_CATEGORIES[categoryId.toUpperCase()],
      integrations,
      total: integrations.mcpServers.length + integrations.apiProviders.length
    }, 'Integrations by category retrieved successfully');
  } catch (error) {
    console.error('Error fetching integrations by category:', error);
    return responseHandler.error(res, 'Failed to fetch integrations by category', 500, error);
  }
});

/**
 * @route   GET /api/integrations/overview
 * @desc    Get overview of all integrations
 * @access  Private
 */
router.get('/overview', auth, async (req, res) => {
  try {
    const mcpServers = getAvailableMCPServers();
    const apiProviders = getAvailableAPIProviders();
    const activeMCPServers = getActiveMCPServers();
    const activeAPIProviders = getActiveAPIProviders();
    const categories = Object.values(INTEGRATION_CATEGORIES);

    return responseHandler.success(res, {
      overview: {
        totalMCPServers: mcpServers.length,
        activeMCPServers: activeMCPServers.length,
        totalAPIProviders: apiProviders.length,
        activeAPIProviders: activeAPIProviders.length,
        totalCategories: categories.length
      },
      mcpServers: activeMCPServers,
      apiProviders: activeAPIProviders,
      categories
    }, 'Integrations overview retrieved successfully');
  } catch (error) {
    console.error('Error fetching integrations overview:', error);
    return responseHandler.error(res, 'Failed to fetch integrations overview', 500, error);
  }
});

/**
 * @route   GET /api/integrations/search
 * @desc    Search integrations
 * @access  Private
 */
router.get('/search', auth, async (req, res) => {
  try {
    const { q, type, category, status } = req.query;

    if (!q) {
      return responseHandler.error(res, 'Search query is required', 400);
    }

    let mcpServers = getAvailableMCPServers();
    let apiProviders = getAvailableAPIProviders();

    // Filter by status
    if (status === 'active') {
      mcpServers = getActiveMCPServers();
      apiProviders = getActiveAPIProviders();
    }

    // Filter by category
    if (category) {
      mcpServers = mcpServers.filter(server => server.category === category);
      apiProviders = apiProviders.filter(provider => provider.category === category);
    }

    // Search by query
    const searchTerm = q.toLowerCase();
    const searchResults = {
      mcpServers: [],
      apiProviders: []
    };

    if (!type || type === 'mcp-servers') {
      searchResults.mcpServers = mcpServers.filter(server =>
        server.name.toLowerCase().includes(searchTerm) ||
        server.description.toLowerCase().includes(searchTerm) ||
        server.features.some(feature => feature.toLowerCase().includes(searchTerm))
      );
    }

    if (!type || type === 'api-providers') {
      searchResults.apiProviders = apiProviders.filter(provider =>
        provider.name.toLowerCase().includes(searchTerm) ||
        provider.description.toLowerCase().includes(searchTerm) ||
        provider.features.some(feature => feature.toLowerCase().includes(searchTerm))
      );
    }

    return responseHandler.success(res, {
      query: q,
      filters: { type, category, status },
      results: searchResults,
      total: searchResults.mcpServers.length + searchResults.apiProviders.length
    }, 'Integration search completed successfully');
  } catch (error) {
    console.error('Error searching integrations:', error);
    return responseHandler.error(res, 'Failed to search integrations', 500, error);
  }
});

/**
 * @route   GET /api/integrations/mcp-servers/:id/oauth-config
 * @desc    Get OAuth configuration for MCP server
 * @access  Private
 */
router.get('/mcp-servers/:id/oauth-config', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const mcpServer = getMCPServerById(id);
    if (!mcpServer) {
      return responseHandler.notFound(res, 'MCP server not found');
    }

    if (!mcpServer.oauth) {
      return responseHandler.error(res, 'This MCP server does not support OAuth', 400);
    }

    // Check if OAuth credentials are configured
    const clientId = process.env[`${id.toUpperCase()}_CLIENT_ID`];
    const clientSecret = process.env[`${id.toUpperCase()}_CLIENT_SECRET`];

    return responseHandler.success(res, {
      server: mcpServer,
      oauthConfigured: !!(clientId && clientSecret),
      requiresClientId: mcpServer.oauth.clientIdRequired,
      requiresClientSecret: mcpServer.oauth.clientSecretRequired,
      scopes: mcpServer.oauth.scopes,
      authUrl: mcpServer.oauth.authUrl
    }, 'OAuth configuration retrieved successfully');
  } catch (error) {
    console.error('Error fetching OAuth config:', error);
    return responseHandler.error(res, 'Failed to fetch OAuth configuration', 500, error);
  }
});

/**
 * @route   GET /api/integrations/connected
 * @desc    Get user's connected integrations summary
 * @access  Private
 */
router.get('/connected', auth, async (req, res) => {
  try {
    const UserIntegration = require('../models/UserIntegration');
    const userId = req.user.id;

    const integrations = await UserIntegration.findConnected(userId);

    const summary = {
      total: integrations.length,
      mcpServers: integrations.filter(i => i.integrationType === 'mcp_server').length,
      apiProviders: integrations.filter(i => i.integrationType === 'api_provider').length,
      byStatus: {
        connected: integrations.filter(i => i.status === 'connected').length,
        error: integrations.filter(i => i.status === 'error').length
      },
      recentActivity: integrations
        .filter(i => i.metadata.lastSyncAt)
        .sort((a, b) => new Date(b.metadata.lastSyncAt) - new Date(a.metadata.lastSyncAt))
        .slice(0, 5)
        .map(i => ({
          integrationId: i.integrationId,
          integrationName: i.integrationName,
          lastSyncAt: i.metadata.lastSyncAt,
          syncCount: i.metadata.syncCount
        }))
    };

    return responseHandler.success(res, {
      summary,
      integrations: integrations.map(i => ({
        integrationId: i.integrationId,
        integrationName: i.integrationName,
        integrationType: i.integrationType,
        status: i.status,
        connectedAt: i.createdAt,
        lastSyncAt: i.metadata.lastSyncAt,
        capabilities: i.capabilities.length
      }))
    }, 'Connected integrations retrieved successfully');
  } catch (error) {
    console.error('Error fetching connected integrations:', error);
    return responseHandler.error(res, 'Failed to fetch connected integrations', 500, error);
  }
});

module.exports = router;
