const mongoose = require('mongoose');

const userIntegrationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  integrationType: {
    type: String,
    enum: ['mcp_server', 'api_provider'],
    required: true
  },
  integrationId: {
    type: String,
    required: true // e.g., 'notion', 'openai', 'jira'
  },
  integrationName: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['connected', 'disconnected', 'error', 'pending'],
    default: 'pending'
  },
  connectionData: {
    // For OAuth integrations
    accessToken: {
      type: String,
      // select: false // Don't return by default for security
    },
    refreshToken: {
      type: String,
      // select: false
    },
    tokenExpiresAt: Date,
    
    // For API key integrations
    apiKeyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ApiKey'
    },
    
    // Integration-specific data
    workspaceId: String, // For Notion workspace
    organizationId: String, // For various services
    teamId: String, // For Figma, Slack, etc.
    
    // OAuth app credentials (encrypted)
    clientId: String,
    clientSecret: {
      type: String,
      select: false
    }
  },
  capabilities: [{
    action: String, // e.g., 'read_pages', 'create_issues'
    enabled: {
      type: Boolean,
      default: true
    },
    lastUsed: Date
  }],
  metadata: {
    // Integration-specific metadata
    version: String,
    lastSyncAt: Date,
    syncCount: {
      type: Number,
      default: 0
    },
    errorCount: {
      type: Number,
      default: 0
    },
    lastError: {
      message: String,
      timestamp: Date,
      code: String
    }
  },
  settings: {
    // User-configurable settings
    autoSync: {
      type: Boolean,
      default: true
    },
    syncInterval: {
      type: Number,
      default: 3600 // 1 hour in seconds
    },
    notifications: {
      enabled: {
        type: Boolean,
        default: true
      },
      events: [String] // e.g., ['sync_error', 'new_data']
    }
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.connectionData?.accessToken;
      delete ret.connectionData?.refreshToken;
      delete ret.connectionData?.clientSecret;
      return ret;
    }
  }
});

// Indexes
userIntegrationSchema.index({ userId: 1, integrationId: 1 }, { unique: true });
userIntegrationSchema.index({ userId: 1, integrationType: 1 });
userIntegrationSchema.index({ status: 1 });
userIntegrationSchema.index({ 'metadata.lastSyncAt': 1 });

// Virtual for connection status
userIntegrationSchema.virtual('isConnected').get(function() {
  return this.status === 'connected';
});

// Virtual for token validity
userIntegrationSchema.virtual('isTokenValid').get(function() {
  if (!this.connectionData?.tokenExpiresAt) return true;
  return new Date() < this.connectionData.tokenExpiresAt;
});

// Methods
userIntegrationSchema.methods.updateToken = function(tokenData) {
  this.connectionData.accessToken = tokenData.access_token;
  if (tokenData.refresh_token) {
    this.connectionData.refreshToken = tokenData.refresh_token;
  }
  if (tokenData.expires_in) {
    this.connectionData.tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
  }
  this.status = 'connected';
  this.metadata.lastSyncAt = new Date();
};

userIntegrationSchema.methods.markError = function(error) {
  this.status = 'error';
  this.metadata.errorCount += 1;
  this.metadata.lastError = {
    message: error.message,
    timestamp: new Date(),
    code: error.code || 'UNKNOWN_ERROR'
  };
};

userIntegrationSchema.methods.recordUsage = function(action) {
  const capability = this.capabilities.find(cap => cap.action === action);
  if (capability) {
    capability.lastUsed = new Date();
  }
  this.metadata.syncCount += 1;
};

// Static methods
userIntegrationSchema.statics.findByUser = function(userId, integrationType = null) {
  const query = { userId };
  if (integrationType) {
    query.integrationType = integrationType;
  }
  return this.find(query);
};

userIntegrationSchema.statics.findConnected = function(userId, integrationType = null) {
  const query = { userId, status: 'connected' };
  if (integrationType) {
    query.integrationType = integrationType;
  }
  return this.find(query);
};

userIntegrationSchema.statics.findByIntegration = function(userId, integrationId) {
  return this.findOne({ userId, integrationId });
};

module.exports = mongoose.model('UserIntegration', userIntegrationSchema);
