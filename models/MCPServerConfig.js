const mongoose = require('mongoose');

// MCP Server configuration model for storing OAuth app credentials per user
const mcpServerConfigSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  serverId: {
    type: String,
    required: true // e.g., 'notion', 'jira', 'figma'
  },
  serverName: {
    type: String,
    required: true
  },
  isSystemManaged: {
    type: Boolean,
    default: false // If true, uses system-wide OAuth app
  },
  oauthConfig: {
    clientId: {
      type: String,
      required: function() { return !this.isSystemManaged; }
    },
    clientSecret: {
      type: String,
      required: function() { return !this.isSystemManaged; },
      select: false // Don't return by default for security
    },
    redirectUri: String,
    scopes: [String],
    customAuthUrl: String, // Optional custom auth URL
    customTokenUrl: String // Optional custom token URL
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'error'],
    default: 'active'
  },
  metadata: {
    createdBy: String, // 'user' or 'admin'
    environment: {
      type: String,
      enum: ['development', 'staging', 'production'],
      default: 'production'
    },
    description: String,
    lastTested: Date,
    errorMessage: String
  }
}, {
  timestamps: true
});

// Indexes
mcpServerConfigSchema.index({ userId: 1, serverId: 1 }, { unique: true });
mcpServerConfigSchema.index({ serverId: 1, isSystemManaged: 1 });

// Methods
mcpServerConfigSchema.methods.getDecryptedSecret = function() {
  const encryptionService = require('../services/encryptionService');
  if (this.oauthConfig.clientSecret) {
    return encryptionService.decrypt(this.oauthConfig.clientSecret);
  }
  return null;
};

mcpServerConfigSchema.methods.setEncryptedSecret = function(secret) {
  const encryptionService = require('../services/encryptionService');
  this.oauthConfig.clientSecret = encryptionService.encrypt(secret);
};

// Static methods
mcpServerConfigSchema.statics.findByUser = function(userId, serverId = null) {
  const query = { userId };
  if (serverId) {
    query.serverId = serverId;
  }
  return this.find(query);
};

mcpServerConfigSchema.statics.getSystemConfig = function(serverId) {
  return this.findOne({ serverId, isSystemManaged: true });
};

module.exports = mongoose.model('MCPServerConfig', mcpServerConfigSchema);
