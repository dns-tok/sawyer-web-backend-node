const { Agent, Runner, MCPServerStdio, run } = require('@openai/agents');
const UserIntegration = require('../models/UserIntegration');
const ApiKey = require('../models/ApiKey');
const encryptionService = require('./encryption.service');

class AgentService {
  constructor() {
    this.activeAgents = new Map(); // Cache active agents by user ID
  }

  /**
   * Get user's OpenAI API key from ApiKey table
   */
  async getUserOpenAIApiKey(userId) {
    try {
      // Find user's OpenAI API key
      const openaiApiKey = await ApiKey.findOne({
        userId,
        provider: 'openai',
        isActive: true,
        isVerified: true
      }).select("+encryptedApiKey");

      if (!openaiApiKey || !openaiApiKey.encryptedApiKey) {
        throw new Error('OpenAI API key not found or not verified');
      }

      // Decrypt the API key
      const decryptedKey = encryptionService.decryptApiKey(openaiApiKey.encryptedApiKey);
      return decryptedKey;
    } catch (error) {
      console.error('Error getting user OpenAI API key:', error);
      throw error;
    }
  }

  /**
   * Get user's Notion API key from UserIntegration
   */
  async getUserNotionApiKey(userId) {
    try {
      // Find user's Notion integration
      const notionIntegration = await UserIntegration.findOne({
        userId,
        integrationId: 'notion',
        status: 'connected'
      })

      console.log('Found Notion integration for user:', userId, notionIntegration);

      if (!notionIntegration || !notionIntegration.connectionData?.accessToken) {
        throw new Error('Notion integration not found or not connected');
      }


      // Decrypt the API key
      const decryptedKey = encryptionService.decrypt(notionIntegration.connectionData?.accessToken);
      return decryptedKey;
    } catch (error) {
      console.error('Error getting user Notion API key:', error);
      throw error;
    }
  }

  /**
   * Create MCP server connection for Notion
   */
  async createNotionMCPServer(notionApiKey) {
    return new MCPServerStdio({
      command: 'npx',
      args: ['-y', '@notionhq/notion-mcp-server'],
      env: {
        // NOTION_TOKEN: notionApiKey,
        OPENAPI_MCP_HEADERS: `{"Authorization": "Bearer ${notionApiKey}", "Notion-Version": "2022-06-28"}`
      }
    });
  }

  /**
   * Get or create an agent for a user (with or without Notion MCP integration)
   */
  async getOrCreateAgent(userId, model = 'gpt-4o-mini') {
    try {
      // Check if agent already exists for this user
      if (this.activeAgents.has(userId)) {
        return this.activeAgents.get(userId);
      }

      // Get user's OpenAI API key (required for all agents)
      const openaiApiKey = await this.getUserOpenAIApiKey(userId);

      let mcpServer = null;
      let hasNotion = false;

      // Try to get Notion integration (optional)
      try {
        const notionApiKey = await this.getUserNotionApiKey(userId);
        mcpServer = await this.createNotionMCPServer(notionApiKey);
        mcpServer.connect();
        hasNotion = true;
        console.log(`✅ Notion MCP server created for user: ${userId}`);
      } catch (notionError) {
        console.log(`ℹ️ No Notion integration for user ${userId}, creating general-purpose agent`);
      }

      // Create single agent with or without Notion MCP
      const agentConfig = {
        name: 'Sawyer AI',
        model,
        instructions: `You are Sawyer AI, a helpful AI assistant with powerful built-in tools. You can:
        
        1. Browse the web and search for information
        2. Execute code and perform analysis
        3. Process and analyze files
        4. Perform mathematical calculations
        5. Help with research and information gathering
        6. Assist with programming and development
        7. Analyze data and create visualizations
        8. Access and manage Notion workspace (if available)
        
        Use your available tools to help users with their tasks.
        When users ask about their Notion content, use the Notion tools if they're available.
        Always be helpful, accurate, and provide detailed assistance.`,
        apiKey: openaiApiKey
      };

      // Add MCP server only if Notion is available
      if (mcpServer) {
        agentConfig.mcpServers = [mcpServer];
      }

      const agent = new Agent(agentConfig);

      console.log(`✅ Created ${hasNotion ? 'Notion-enhanced' : 'general-purpose'} agent for user: ${userId}`);
       
      const agentData = { agent, mcpServer, hasNotion };
      this.activeAgents.set(userId, agentData);

      return agentData;
      
    } catch (error) {
      console.error('Error creating agent:', error);
      throw error;
    }
  }

  /**
   * Send message to agent and get response
   */
  async sendMessage(userId, messages, model = 'gpt-4o-mini') {
    try {
      const { agent } = await this.getOrCreateAgent(userId, model);

      // Convert chat messages to agent format
      const agentMessages = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Run the agent
      const result = await Runner.run(agent, {
        input: agentMessages
      });

      return {
        content: result.content,
        usage: result.usage,
        toolCalls: result.toolCalls || []
      };
    } catch (error) {
      console.error('Error sending message to agent:', error);
      throw error;
    }
  }

  /**
   * Send message with streaming response
   */
  async sendMessageStreaming(userId, messages, model = 'gpt-4o-mini') {
    try {
      const { agent } = await this.getOrCreateAgent(userId, model);

      // Convert chat messages to agent format (same as non-streaming method)
      const agentMessages = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Validate that we have at least one message and the last one is from user
      const lastMessage = messages[messages.length - 1];
      if (!lastMessage || lastMessage.role !== 'user') {
        throw new Error('No user message found');
      }

      // Run the agent with streaming enabled, passing full conversation history
      // The streaming run function expects the messages array directly, not wrapped in an object
      const stream = await run(agent, agentMessages, { stream: true });

      return stream;
    } catch (error) {
      console.error('Error sending streaming message to agent:', error);
      throw error;
    }
  }

  /**
   * Check if user has Notion integration available
   */
  async hasNotionIntegration(userId) {
    try {
      const notionIntegration = await UserIntegration.findOne({
        userId,
        integrationId: 'notion',
        status: 'connected'
      }).populate('connectionData.apiKeyId');

      return !!notionIntegration?.connectionData?.apiKeyId;
    } catch (error) {
      console.error('Error checking Notion integration:', error);
      return false;
    }
  }

  /**
   * Get agent capabilities for a user
   */
  async getAgentCapabilities(userId) {
    try {
      const hasNotion = await this.hasNotionIntegration(userId);
      
      const baseCapabilities = [
        'Web browsing and search',
        'Code execution and analysis',
        'File processing and analysis',
        'Mathematical calculations',
        'Research and information gathering',
        'Programming assistance',
        'Data analysis and visualization'
      ];

      const notionCapabilities = [
        'Search Notion pages and databases',
        'Read page content',
        'Create new pages',
        'Update existing content',
        'Access workspace data'
      ];

      return {
        hasNotionIntegration: hasNotion,
        hasAgentTools: true, // Always true since we now provide agent tools to everyone
        capabilities: hasNotion ? [...notionCapabilities, ...baseCapabilities] : baseCapabilities,
        agentType: hasNotion ? 'notion_enhanced' : 'general_purpose'
      };
    } catch (error) {
      console.error('Error getting agent capabilities:', error);
      return {
        hasNotionIntegration: false,
        hasAgentTools: true,
        capabilities: [
          'Web browsing and search',
          'Code execution and analysis',
          'File processing and analysis',
          'Mathematical calculations',
          'Research and information gathering',
          'Programming assistance'
        ],
        agentType: 'general_purpose'
      };
    }
  }

  /**
   * Cleanup agent resources for a user
   */
  async cleanupAgent(userId) {
    try {
      const agentData = this.activeAgents.get(userId);
      if (agentData?.mcpServer) {
        // Close MCP server connection
        await agentData.mcpServer.close();
      }
      this.activeAgents.delete(userId);
    } catch (error) {
      console.error('Error cleaning up agent:', error);
    }
  }

  /**
   * Cleanup all agents (for graceful shutdown)
   */
  async cleanupAllAgents() {
    try {
      const promises = Array.from(this.activeAgents.keys()).map(userId => 
        this.cleanupAgent(userId)
      );
      await Promise.all(promises);
    } catch (error) {
      console.error('Error cleaning up all agents:', error);
    }
  }
}

// Export singleton instance
module.exports = new AgentService();
