// MCP Server configurations
const MCP_SERVERS = {
  NOTION: {
    id: 'notion',
    name: 'Notion',
    description: 'Connect to your Notion workspace to read, search, and update pages and databases',
    icon: '/assets/notion.png',
    category: 'productivity',
    features: [
      'Read and search pages',
      'Update page content',
      'Query databases',
      'Create new pages',
      'Manage blocks and properties'
    ],
    oauth: {
      authUrl: 'https://api.notion.com/v1/oauth/authorize',
      tokenUrl: 'https://api.notion.com/v1/oauth/token',
      scopes: ['read_content', 'update_content', 'insert_content'],
      clientIdRequired: true,
      clientSecretRequired: true
    },
    status: 'active',
    version: '1.0.0',
    documentation: 'https://developers.notion.com/',
    supportedActions: [
      'search_pages',
      'read_page',
      'update_page',
      'create_page',
      'query_database',
      'create_database_page'
    ]
  },
  
  JIRA: {
    id: 'jira',
    name: 'Jira',
    description: 'Connect to Jira to manage issues, projects, and workflows',
    icon: '/icons/jira.svg',
    category: 'project-management',
    features: [
      'Create and update issues',
      'Search across projects',
      'Manage sprints',
      'Track project progress',
      'Generate reports'
    ],
    oauth: {
      authUrl: 'https://auth.atlassian.com/authorize',
      tokenUrl: 'https://auth.atlassian.com/oauth/token',
      scopes: ['read:jira-work', 'write:jira-work', 'read:jira-user'],
      clientIdRequired: true,
      clientSecretRequired: true
    },
    status: 'active',
    version: '1.0.0',
    documentation: 'https://developer.atlassian.com/cloud/jira/',
    supportedActions: [
      'search_issues',
      'create_issue',
      'update_issue',
      'get_project',
      'list_projects'
    ]
  },

  GITHUB: {
    id: 'github',
    name: 'GitHub',
    description: 'Connect to GitHub to access repositories, issues, pull requests, and collaborate on code',
    icon: '/icons/github.svg',
    category: 'development',
    features: [
      'Access repositories',
      'Read and create issues',
      'Manage pull requests',
      'Browse code and commits',
      'Track project activity',
      'Manage branches and releases'
    ],
    oauth: {
      authUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      scopes: ['repo', 'user:email', 'read:org'],
      clientIdRequired: true,
      clientSecretRequired: true
    },
    status: 'active',
    version: '1.0.0',
    documentation: 'https://docs.github.com/en/rest',
    supportedActions: [
      'list_repositories',
      'get_repository',
      'list_issues',
      'create_issue',
      'get_commits',
      'list_branches',
      'search_code',
      'get_pull_requests'
    ]
  },

//   FIGMA: {
//     id: 'figma',
//     name: 'Figma',
//     description: 'Connect to Figma to access designs, prototypes, and collaborate on design files',
//     icon: '/icons/figma.svg',
//     category: 'design',
//     features: [
//       'Access design files',
//       'Extract design tokens',
//       'Generate code from designs',
//       'Collaborate on prototypes',
//       'Export assets'
//     ],
//     oauth: {
//       authUrl: 'https://www.figma.com/oauth',
//       tokenUrl: 'https://www.figma.com/api/oauth/token',
//       scopes: ['file_read', 'file_write'],
//       clientIdRequired: true,
//       clientSecretRequired: true
//     },
//     status: 'coming_soon',
//     version: '1.0.0',
//     documentation: 'https://www.figma.com/developers/api',
//     supportedActions: [
//       'get_file',
//       'get_file_nodes',
//       'get_images',
//       'get_team_projects',
//       'get_project_files'
//     ]
//   }
};

// API Provider configurations
const API_PROVIDERS = {
  OPENAI: {
    id: 'openai',
    name: 'OpenAI',
    description: 'Access to GPT models, DALL-E, and other OpenAI services',
    icon: '/assets/openai.png',
    category: 'ai',
    website: 'https://openai.com',
    models: [
      {
        id: 'gpt-4',
        name: 'GPT-4',
        description: 'Most capable model for complex tasks',
        type: 'text',
        inputCost: 0.03,
        outputCost: 0.06,
        contextWindow: 8192
      },
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        description: 'Faster and more cost-effective GPT-4',
        type: 'text',
        inputCost: 0.01,
        outputCost: 0.03,
        contextWindow: 128000
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        description: 'Fast and cost-effective for most tasks',
        type: 'text',
        inputCost: 0.001,
        outputCost: 0.002,
        contextWindow: 16384
      },
      {
        id: 'dall-e-3',
        name: 'DALL-E 3',
        description: 'Latest image generation model',
        type: 'image',
        inputCost: 0.04,
        outputCost: 0,
        contextWindow: 0
      }
    ],
    authentication: {
      type: 'api_key',
      keyFormat: 'sk-...',
      keyLength: 51,
      required: true,
      testEndpoint: '/v1/models'
    },
    features: [
      'Text generation',
      'Code generation',
      'Image generation',
      'Function calling',
      'JSON mode',
      'Vision capabilities'
    ],
    status: 'active',
    documentation: 'https://platform.openai.com/docs',
    rateLimit: {
      requests: 3500,
      tokens: 180000,
      period: 'minute'
    }
  },
  
  ANTHROPIC: {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Access to Claude models for advanced reasoning and analysis',
    icon: '/icons/anthropic.svg',
    category: 'ai',
    website: 'https://anthropic.com',
    models: [
      {
        id: 'claude-3-opus',
        name: 'Claude 3 Opus',
        description: 'Most powerful model for complex tasks',
        type: 'text',
        inputCost: 0.015,
        outputCost: 0.075,
        contextWindow: 200000
      },
      {
        id: 'claude-3-sonnet',
        name: 'Claude 3 Sonnet',
        description: 'Balanced performance and speed',
        type: 'text',
        inputCost: 0.003,
        outputCost: 0.015,
        contextWindow: 200000
      }
    ],
    authentication: {
      type: 'api_key',
      keyFormat: 'sk-ant-...',
      keyLength: 108,
      required: true,
      testEndpoint: '/v1/messages'
    },
    features: [
      'Advanced reasoning',
      'Long context understanding',
      'Code analysis',
      'Document analysis',
      'Mathematical reasoning'
    ],
    status: 'coming_soon',
    documentation: 'https://docs.anthropic.com/',
    rateLimit: {
      requests: 1000,
      tokens: 100000,
      period: 'minute'
    }
  },
  
  GOOGLE: {
    id: 'google',
    name: 'Google AI',
    description: 'Access to Gemini models and Google AI services',
    icon: '/icons/google.svg',
    category: 'ai',
    website: 'https://ai.google.dev',
    models: [
      {
        id: 'gemini-pro',
        name: 'Gemini Pro',
        description: 'Advanced multimodal capabilities',
        type: 'multimodal',
        inputCost: 0.0005,
        outputCost: 0.0015,
        contextWindow: 32000
      }
    ],
    authentication: {
      type: 'api_key',
      keyFormat: 'AIza...',
      keyLength: 39,
      required: true,
      testEndpoint: '/v1/models'
    },
    features: [
      'Multimodal understanding',
      'Vision and text',
      'Code generation',
      'Reasoning'
    ],
    status: 'coming_soon',
    documentation: 'https://ai.google.dev/docs',
    rateLimit: {
      requests: 60,
      tokens: 32000,
      period: 'minute'
    }
  }
};

// Integration categories for organization
const INTEGRATION_CATEGORIES = {
  PRODUCTIVITY: {
    id: 'productivity',
    name: 'Productivity',
    description: 'Tools for managing tasks, documents, and workflows',
    icon: '/icons/productivity.svg'
  },
  PROJECT_MANAGEMENT: {
    id: 'project-management',
    name: 'Project Management',
    description: 'Tools for managing projects, issues, and team collaboration',
    icon: '/icons/project-management.svg'
  },
  DESIGN: {
    id: 'design',
    name: 'Design',
    description: 'Design tools and creative software integrations',
    icon: '/icons/design.svg'
  },
  AI: {
    id: 'ai',
    name: 'AI Services',
    description: 'AI models and machine learning services',
    icon: '/icons/ai.svg'
  },
  COMMUNICATION: {
    id: 'communication',
    name: 'Communication',
    description: 'Chat, email, and messaging platforms',
    icon: '/icons/communication.svg'
  },
  DATA: {
    id: 'data',
    name: 'Data & Analytics',
    description: 'Data storage, analytics, and business intelligence',
    icon: '/icons/data.svg'
  },
  DEVELOPMENT: {
    id: 'development',
    name: 'Development',
    description: 'Code repositories, version control, and development tools',
    icon: '/icons/development.svg'
  }
};

// Helper functions
const getAvailableMCPServers = () => {
  return Object.values(MCP_SERVERS);
};

const getActiveMCPServers = () => {
  return Object.values(MCP_SERVERS).filter(server => server.status === 'active');
};

const getAvailableAPIProviders = () => {
  return Object.values(API_PROVIDERS);
};

const getActiveAPIProviders = () => {
  return Object.values(API_PROVIDERS).filter(provider => provider.status === 'active');
};

const getMCPServerById = (id) => {
  return MCP_SERVERS[id.toUpperCase()];
};

const getAPIProviderById = (id) => {
  return API_PROVIDERS[id.toUpperCase()];
};

const getIntegrationsByCategory = (categoryId) => {
  const mcpServers = Object.values(MCP_SERVERS).filter(server => server.category === categoryId);
  const apiProviders = Object.values(API_PROVIDERS).filter(provider => provider.category === categoryId);
  
  return {
    mcpServers,
    apiProviders
  };
};

module.exports = {
  MCP_SERVERS,
  API_PROVIDERS,
  INTEGRATION_CATEGORIES,
  getAvailableMCPServers,
  getActiveMCPServers,
  getAvailableAPIProviders,
  getActiveAPIProviders,
  getMCPServerById,
  getAPIProviderById,
  getIntegrationsByCategory
};
