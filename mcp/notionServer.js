const notionService = require('../services/notion.service');

class MCPNotionServer {
  constructor() {
    this.name = 'notion-mcp-server';
    this.version = '1.0.0';
    this.description = 'MCP server for Notion integration';
  }

  // Initialize MCP server
  async initialize() {
    return {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
        resources: {}
      },
      serverInfo: {
        name: this.name,
        version: this.version
      }
    };
  }

  // List available tools
  async listTools() {
    return {
      tools: [
        {
          name: 'notion_search_pages',
          description: 'Search pages in the connected Notion workspace',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query for pages'
              },
              page_size: {
                type: 'number',
                description: 'Number of results to return',
                default: 50
              }
            },
            required: ['query']
          }
        },
        {
          name: 'notion_get_page',
          description: 'Get a specific page by ID',
          inputSchema: {
            type: 'object',
            properties: {
              page_id: {
                type: 'string',
                description: 'ID of the page to retrieve'
              }
            },
            required: ['page_id']
          }
        },
        {
          name: 'notion_get_page_content',
          description: 'Get the content blocks of a specific page',
          inputSchema: {
            type: 'object',
            properties: {
              page_id: {
                type: 'string',
                description: 'ID of the page to get content from'
              }
            },
            required: ['page_id']
          }
        },
        {
          name: 'notion_create_page',
          description: 'Create a new page in Notion',
          inputSchema: {
            type: 'object',
            properties: {
              parent: {
                type: 'object',
                description: 'Parent page or database'
              },
              properties: {
                type: 'object',
                description: 'Page properties'
              },
              children: {
                type: 'array',
                description: 'Page content blocks'
              }
            },
            required: ['parent']
          }
        },
        {
          name: 'notion_update_page',
          description: 'Update an existing page',
          inputSchema: {
            type: 'object',
            properties: {
              page_id: {
                type: 'string',
                description: 'ID of the page to update'
              },
              properties: {
                type: 'object',
                description: 'Updated page properties'
              }
            },
            required: ['page_id']
          }
        }
      ]
    };
  }

  // Execute tool
  async callTool(name, arguments_, userId) {
    try {
      switch (name) {
        case 'notion_search_pages':
          return await this.searchPages(arguments_, userId);
        case 'notion_get_page':
          return await this.getPage(arguments_, userId);
        case 'notion_get_page_content':
          return await this.getPageContent(arguments_, userId);
        case 'notion_create_page':
          return await this.createPage(arguments_, userId);
        case 'notion_update_page':
          return await this.updatePage(arguments_, userId);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }

  // Tool implementations
  async searchPages(args, userId) {
    const { query, page_size = 50 } = args;
    const results = await notionService.searchPages(userId, query, page_size);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results, null, 2)
        }
      ]
    };
  }

  async getPage(args, userId) {
    const { page_id } = args;
    const page = await notionService.getPage(userId, page_id);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(page, null, 2)
        }
      ]
    };
  }

  async getPageContent(args, userId) {
    const { page_id } = args;
    const blocks = await notionService.getPageBlocks(userId, page_id);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(blocks, null, 2)
        }
      ]
    };
  }

  async createPage(args, userId) {
    const pageData = args;
    const page = await notionService.createPage(userId, pageData);
    
    return {
      content: [
        {
          type: 'text',
          text: `Page created successfully: ${JSON.stringify(page, null, 2)}`
        }
      ]
    };
  }

  async updatePage(args, userId) {
    const { page_id, ...updateData } = args;
    const page = await notionService.updatePage(userId, page_id, updateData);
    
    return {
      content: [
        {
          type: 'text',
          text: `Page updated successfully: ${JSON.stringify(page, null, 2)}`
        }
      ]
    };
  }

  // List available resources
  async listResources() {
    return {
      resources: [
        {
          uri: 'notion://workspace',
          name: 'Notion Workspace',
          description: 'Connected Notion workspace information',
          mimeType: 'application/json'
        }
      ]
    };
  }

  // Read resource
  async readResource(uri, userId) {
    switch (uri) {
      case 'notion://workspace':
        try {
          const integration = await notionService.getUserIntegration(userId);
          const userInfo = await notionService.getUserInfo(userId);
          
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                  integration,
                  userInfo
                }, null, 2)
              }
            ]
          };
        } catch (error) {
          throw new Error(`Failed to read resource ${uri}: ${error.message}`);
        }
      default:
        throw new Error(`Unknown resource: ${uri}`);
    }
  }
}

module.exports = new MCPNotionServer();
