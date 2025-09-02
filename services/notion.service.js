const axios = require('axios');
const NotionIntegration = require('../models/NotionIntegration');
const { Client } = require('@notionhq/client');
const User = require('../models/User');
const encryptionService = require('./encryption.service');

class NotionService {
  constructor() {
    this.baseURL = 'https://api.notion.com/v1';
    this.authURL = 'https://api.notion.com/v1/oauth';
    this.clientId = process.env.NOTION_CLIENT_ID;
    this.clientSecret = process.env.NOTION_CLIENT_SECRET;
    this.redirectUri = process.env.NOTION_REDIRECT_URI;
  }

  // Generate OAuth authorization URL
  generateAuthUrl(state = null) {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      owner: 'user',
      redirect_uri: this.redirectUri
    });

    if (state) {
      params.append('state', state);
    }

    return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`;
  }

  // Exchange authorization code for access token
  async exchangeCodeForToken(code) {
    try {
      const response = await axios.post(`${this.authURL}/token`, {
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`
        }
      });

      return response.data;
    } catch (error) {
      console.error('Notion token exchange error:', error.response?.data || error.message);
      throw new Error('Failed to exchange code for token');
    }
  }

  // Save or update Notion integration
  async saveIntegration(userId, tokenData) {
    try {
      // Deactivate any existing integrations for this user
      await NotionIntegration.deactivateForUser(userId);

      // Encrypt the access token
      const encryptedToken = encryptionService.encryptApiKey(tokenData.access_token);

      // Create new integration
      const integration = new NotionIntegration({
        userId,
        accessToken: encryptedToken,
        botId: tokenData.bot_id,
        workspaceId: tokenData.workspace_id,
        workspaceName: tokenData.workspace_name,
        workspaceIcon: tokenData.workspace_icon,
        owner: tokenData.owner,
        duplicatedTemplateId: tokenData.duplicated_template_id,
        requestId: tokenData.request_id
      });

      return await integration.save();
    } catch (error) {
      console.error('Error saving Notion integration:', error);
      throw new Error('Failed to save Notion integration');
    }
  }

  // Get user's active Notion integration
  async getUserIntegration(userId) {
    try {
      const integration = await NotionIntegration.findActiveByUser(userId);
      return integration;
    } catch (error) {
      console.error('Error fetching user integration:', error);
      throw new Error('Failed to fetch integration');
    }
  }

  // Get decrypted access token for API calls
  async getDecryptedAccessToken(userId) {
    try {
      const integration = await NotionIntegration.findOne({
        userId,
        isActive: true
      }).select('+accessToken');

      if (!integration) {
        throw new Error('No active Notion integration found');
      }

      return encryptionService.decryptApiKey(integration.accessToken);
    } catch (error) {
      console.error('Error getting decrypted token:', error);
      throw new Error('Failed to get access token');
    }
  }

  // Make authenticated API call to Notion
  async makeNotionApiCall(userId, endpoint, method = 'GET', data = null) {
    try {
      const accessToken = await this.getDecryptedAccessToken(userId);
      
      const config = {
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        }
      };

      if (data && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
        config.data = data;
      }

      const response = await axios(config);
      
      // Update last used timestamp
      const integration = await NotionIntegration.findOne({ userId, isActive: true });
      if (integration) {
        await integration.updateLastUsed();
      }

      return response.data;
    } catch (error) {
      console.error('Notion API call error:', error.response?.data || error.message);
      
      // Record error in integration
      const integration = await NotionIntegration.findOne({ userId, isActive: true });
      if (integration) {
        await integration.recordSyncError(error.response?.data || error.message);
      }

      throw new Error(`Notion API error: ${error.response?.data?.message || error.message}`);
    }
  }

  // Get user info from Notion
  async getUserInfo(userId) {
    try {
      return await this.makeNotionApiCall(userId, '/users/me');
    } catch (error) {
      throw new Error('Failed to get user info from Notion');
    }
  }

  // Search pages in user's workspace
  async searchPages(userId, query = '', pageSize = 100) {
    try {
      const searchData = {
        query,
        page_size: pageSize,
        filter: {
          property: 'object',
          value: 'page'
        }
      };

      return await this.makeNotionApiCall(userId, '/search', 'POST', searchData);
    } catch (error) {
      throw new Error('Failed to search pages');
    }
  }

  // Get all pages accessible by the integration
  async getPages(accessToken, options = {}) {
    try {
      const { page_size = 100 } = options;

      const payload = {
        filter: {
          value: 'page',
          property: 'object'
        },
        page_size
      };

      const response = await axios.post(`${this.baseURL}/search`, payload, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28'
        }
      });

      return response.data.results.map(page => ({
        id: page.id,
        title: this.extractTitle(page.properties?.title || page.properties?.Name || {}),
        url: page.url,
        icon: page.icon,
        cover: page.cover,
        parent: page.parent,
        createdTime: page.created_time,
        lastEditedTime: page.last_edited_time
      }));
    } catch (error) {
      console.error('Notion get pages error:', error.response?.data || error);
      throw new Error('Failed to get pages');
    }
  }

  // Get all databases accessible by the integration
  async getDatabases(accessToken, options = {}) {
    try {
      const { page_size = 100 } = options;

      const payload = {
        filter: {
          value: 'database',
          property: 'object'
        },
        page_size
      };

      const response = await axios.post(`${this.baseURL}/search`, payload, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28'
        }
      });

      console.log("RESPONSE ====> ", response.data);
      return response.data.results.map(database => ({
        id: database.id,
        title: this.extractTitle(database.title),
        description: database.description?.map(desc => desc.plain_text).join('') || '',
        url: database.url,
        icon: database.icon,
        cover: database.cover,
        createdTime: database.created_time,
        lastEditedTime: database.last_edited_time
      }));
    } catch (error) {
      console.error('Notion get databases error:', error.response?.data || error);
      throw new Error('Failed to get databases');
    }
  }

  // Helper method to extract title from Notion title property
  extractTitle(titleProperty) {
    if (!titleProperty) return 'Untitled';
    
    if (Array.isArray(titleProperty)) {
      return titleProperty.map(t => t.plain_text || t.text?.content || '').join('');
    }
    
    if (titleProperty.title && Array.isArray(titleProperty.title)) {
      return titleProperty.title.map(t => t.plain_text || t.text?.content || '').join('');
    }
    
    return titleProperty.plain_text || titleProperty.text?.content || 'Untitled';
  }

  // Get page content
  async getPage(userId, pageId) {
    try {
      return await this.makeNotionApiCall(userId, `/pages/${pageId}`);
    } catch (error) {
      throw new Error('Failed to get page content');
    }
  }

  // Get page blocks (content)
  async getPageBlocks(userId, pageId) {
    try {
      return await this.makeNotionApiCall(userId, `/blocks/${pageId}/children`);
    } catch (error) {
      throw new Error('Failed to get page blocks');
    }
  }

  // Create a new page
  async createPage(userId, pageData) {
    try {
      return await this.makeNotionApiCall(userId, '/pages', 'POST', pageData);
    } catch (error) {
      throw new Error('Failed to create page');
    }
  }

  // Update page
  async updatePage(userId, pageId, updateData) {
    try {
      return await this.makeNotionApiCall(userId, `/pages/${pageId}`, 'PATCH', updateData);
    } catch (error) {
      throw new Error('Failed to update page');
    }
  }

  // Disconnect integration
  async disconnectIntegration(userId) {
    try {
      const integration = await NotionIntegration.findOne({ userId, isActive: true });
      if (integration) {
        integration.isActive = false;
        await integration.save();
      }
      return true;
    } catch (error) {
      console.error('Error disconnecting integration:', error);
      throw new Error('Failed to disconnect integration');
    }
  }

  // Test connection
  async testConnection(userId) {
    try {
      const userInfo = await this.getUserInfo(userId);
      return {
        connected: true,
        user: userInfo
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }
}

module.exports = new NotionService();
