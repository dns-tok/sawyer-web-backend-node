const axios = require('axios');
const crypto = require('crypto');
const UserIntegration = require('../models/UserIntegration');
const { getMCPServerById } = require('../constants/integrations');
const encryptionService = require('./encryption.service');

class OAuthService {
  constructor() {
    this.stateStorage = new Map(); // In production, use Redis
  }

  /**
   * Generate OAuth authorization URL for MCP server
   */
  async generateAuthUrl(userId, integrationId, redirectUri) {
    try {
      const mcpServer = getMCPServerById(integrationId);
      
      if (!mcpServer) {
        throw new Error('Integration not found');
      }

      if (!mcpServer.oauth) {
        throw new Error('Integration does not support OAuth');
      }

      // Generate state parameter for security
      const state = crypto.randomBytes(32).toString('hex');
      
      // Store state with user info (expires in 10 minutes)
      this.stateStorage.set(state, {
        userId,
        integrationId,
        redirectUri,
        timestamp: Date.now()
      });

      // Clean up expired states
      this.cleanupExpiredStates();

      // Get OAuth config from environment or database
      const clientId = process.env[`${integrationId.toUpperCase()}_CLIENT_ID`];
      
      if (!clientId) {
        throw new Error(`OAuth client ID not configured for ${integrationId}`);
      }

      // Build authorization URL
      const authUrl = new URL(mcpServer.oauth.authUrl);
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('state', state);
      
      if (mcpServer.oauth.scopes) {
        authUrl.searchParams.set('scope', mcpServer.oauth.scopes.join(' '));
      }

      // Integration-specific parameters
      if (integrationId === 'notion') {
        authUrl.searchParams.set('owner', 'user');
      }

      return {
        authUrl: authUrl.toString(),
        state,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      };
    } catch (error) {
      console.error('Error generating OAuth URL:', error);
      throw error;
    }
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  async handleCallback(code, state, error) {
    try {
      console.log('OAuth callback received:', { code: code?.substring(0, 10) + '...', state: state?.substring(0, 10) + '...', error });
      
      if (error) {
        throw new Error(`OAuth error: ${error}`);
      }

      if (!code || !state) {
        throw new Error('Missing authorization code or state parameter');
      }

      // Verify state parameter
      const stateData = this.stateStorage.get(state);
      if (!stateData) {
        console.error('Invalid state parameter:', state);
        console.error('Available states:', Array.from(this.stateStorage.keys()));
        throw new Error('Invalid or expired state parameter');
      }

      console.log('State verified successfully for user:', stateData.userId);

      // Clean up state
      this.stateStorage.delete(state);

      const { userId, integrationId, redirectUri } = stateData;
      console.log(`Processing OAuth callback for ${integrationId}, user: ${userId}`);
      
      const mcpServer = getMCPServerById(integrationId);

      if (!mcpServer) {
        throw new Error('Integration not found');
      }

      // Exchange code for tokens
      const tokenData = await this.exchangeCodeForTokens(integrationId, code, redirectUri);

      // Create or update user integration
      const integration = await this.createOrUpdateIntegration(userId, integrationId, tokenData);

      console.log(`OAuth callback completed successfully for ${integrationId}`);
      return {
        integration,
        success: true
      };
    } catch (error) {
      console.error('Error handling OAuth callback:', error);
      throw error;
    }
  }

  /**
   * Exchange authorization code for access tokens
   */
  async exchangeCodeForTokens(integrationId, code, redirectUri) {
    try {
      const mcpServer = getMCPServerById(integrationId);
      const clientId = process.env[`${integrationId.toUpperCase()}_CLIENT_ID`];
      const clientSecret = process.env[`${integrationId.toUpperCase()}_CLIENT_SECRET`];

      if (!clientId || !clientSecret) {
        throw new Error(`OAuth credentials not configured for ${integrationId}`);
      }

      const tokenUrl = mcpServer.oauth.tokenUrl;
      console.log(`[${integrationId}] Token exchange started`);
      console.log(`[${integrationId}] Token URL: ${tokenUrl}`);
      console.log(`[${integrationId}] Client ID: ${clientId.substring(0, 10)}...`);

      // Integration-specific token exchange
      let response;
      if (integrationId === 'notion') {
        // Notion requires Basic auth with base64 encoded client credentials
        const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        
        const tokenData = {
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri
        };

        console.log(`[${integrationId}] Making Notion token request`);
        response = await axios.post(tokenUrl, tokenData, {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Basic ${encoded}`,
            'Notion-Version': '2022-06-28'
          }
        });
      } else if (integrationId === 'github') {
        // GitHub requires URL-encoded form data
        const tokenData = new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret
        });

        console.log(`[${integrationId}] Making GitHub token request`);
        response = await axios.post(tokenUrl, tokenData.toString(), {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Sawyer-AI-App'
          }
        });
      } else {
        // Standard OAuth2 flow for other providers
        const tokenData = new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret
        });

        console.log(`[${integrationId}] Making standard OAuth token request`);
        response = await axios.post(tokenUrl, tokenData.toString(), {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });
      }

      console.log(`[${integrationId}] Token exchange successful`);
      console.log(`[${integrationId}] Response keys:`, Object.keys(response.data));
      
      return response.data;
    } catch (error) {
      console.error(`[${integrationId}] Error exchanging code for tokens:`, error.response?.data || error.message);
      if (error.response) {
        console.error(`[${integrationId}] Status:`, error.response.status);
        console.error(`[${integrationId}] Headers:`, error.response.headers);
      }
      throw new Error(`Failed to exchange authorization code for tokens: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Create or update user integration
   */
  async createOrUpdateIntegration(userId, integrationId, tokenData) {
    try {
      console.log(`[${integrationId}] Creating/updating integration for user:`, userId);
      console.log(`[${integrationId}] Token data keys:`, Object.keys(tokenData));
      
      const mcpServer = getMCPServerById(integrationId);
      
      if (!tokenData.access_token) {
        throw new Error(`No access token received from ${integrationId}`);
      }
      
      // Encrypt sensitive data
      const encryptedAccessToken = encryptionService.encrypt(tokenData.access_token);
      const encryptedRefreshToken = tokenData.refresh_token ? 
        encryptionService.encrypt(tokenData.refresh_token) : null;

      const integrationData = {
        userId,
        integrationType: 'mcp_server',
        integrationId,
        integrationName: mcpServer.name,
        status: 'connected',
        connectionData: {
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          tokenExpiresAt: tokenData.expires_in ? 
            new Date(Date.now() + tokenData.expires_in * 1000) : null,
          workspaceId: tokenData.workspace_id || tokenData.workspace?.id,
          organizationId: tokenData.organization_id || tokenData.organization?.id
        },
        capabilities: mcpServer.supportedActions.map(action => ({
          action,
          enabled: true,
          lastUsed: null
        })),
        metadata: {
          version: mcpServer.version,
          lastSyncAt: new Date(),
          syncCount: 0,
          errorCount: 0
        }
      };

      // Update existing or create new integration
      const integration = await UserIntegration.findOneAndUpdate(
        { userId, integrationId },
        integrationData,
        { 
          new: true, 
          upsert: true,
          setDefaultsOnInsert: true 
        }
      );

      console.log(`[${integrationId}] Integration saved successfully:`, integration._id);
      return integration;
    } catch (error) {
      console.error(`[${integrationId}] Error creating/updating integration:`, error);
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(integrationId, refreshToken) {
    try {
      const mcpServer = getMCPServerById(integrationId);
      const clientId = process.env[`${integrationId.toUpperCase()}_CLIENT_ID`];
      const clientSecret = process.env[`${integrationId.toUpperCase()}_CLIENT_SECRET`];

      let response;
      if (integrationId === 'notion') {
        // Notion requires Basic auth with base64 encoded client credentials
        const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        
        const tokenData = {
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        };

        response = await axios.post(mcpServer.oauth.tokenUrl, tokenData, {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Basic ${encoded}`,
            'Notion-Version': '2022-06-28'
          }
        });
      } else {
        // Standard OAuth2 flow for other providers
        const tokenData = {
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret
        };

        response = await axios.post(mcpServer.oauth.tokenUrl, tokenData, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });
      }

      return response.data;
    } catch (error) {
      console.error('Error refreshing token:', error);
      throw new Error('Failed to refresh access token');
    }
  }

  /**
   * Get valid access token for integration (refresh if needed)
   */
  async getValidAccessToken(userId, integrationId) {
    try {
      const integration = await UserIntegration.findByIntegration(userId, integrationId)
        .select('+connectionData.accessToken +connectionData.refreshToken');

      if (!integration || integration.status !== 'connected') {
        throw new Error('Integration not connected');
      }

      // Decrypt tokens
      const accessToken = encryptionService.decrypt(integration.connectionData.accessToken);
      
      // Check if token is still valid
      if (integration.isTokenValid) {
        return accessToken;
      }

      // Refresh token if available
      if (integration.connectionData.refreshToken) {
        const refreshToken = encryptionService.decrypt(integration.connectionData.refreshToken);
        const newTokenData = await this.refreshToken(integrationId, refreshToken);
        
        // Update integration with new tokens
        integration.updateToken(newTokenData);
        await integration.save();
        
        return newTokenData.access_token;
      }

      throw new Error('Access token expired and no refresh token available');
    } catch (error) {
      console.error('Error getting valid access token:', error);
      throw error;
    }
  }

  /**
   * Disconnect integration
   */
  async disconnectIntegration(userId, integrationId) {
    try {
      const integration = await UserIntegration.findByIntegration(userId, integrationId);
      
      if (!integration) {
        throw new Error('Integration not found');
      }

      // TODO: Revoke tokens with the service if supported
      
      integration.status = 'disconnected';
      integration.connectionData.accessToken = null;
      integration.connectionData.refreshToken = null;
      integration.connectionData.tokenExpiresAt = null;
      
      await integration.save();
      
      return integration;
    } catch (error) {
      console.error('Error disconnecting integration:', error);
      throw error;
    }
  }

  /**
   * Clean up expired state parameters
   */
  cleanupExpiredStates() {
    const now = Date.now();
    const expireTime = 10 * 60 * 1000; // 10 minutes
    
    for (const [state, data] of this.stateStorage.entries()) {
      if (now - data.timestamp > expireTime) {
        this.stateStorage.delete(state);
      }
    }
  }

  /**
   * Test integration connection
   */
  async testConnection(userId, integrationId) {
    try {
      const accessToken = await this.getValidAccessToken(userId, integrationId);
      
      // Integration-specific health check
      if (integrationId === 'notion') {
        const response = await axios.get('https://api.notion.com/v1/users/me', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Notion-Version': '2022-06-28'
          }
        });
        return { connected: true, user: response.data };
      }
      
      return { connected: true };
    } catch (error) {
      console.error('Error testing connection:', error);
      return { connected: false, error: error.message };
    }
  }
}

module.exports = new OAuthService();
