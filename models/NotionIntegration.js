const mongoose = require('mongoose');

const notionIntegrationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  accessToken: {
    type: String,
    required: true,
    select: false // Don't return access token in queries by default
  },
  botId: {
    type: String,
    required: true
  },
  workspaceId: {
    type: String,
    required: true
  },
  workspaceName: {
    type: String,
    required: true
  },
  workspaceIcon: {
    type: String,
    default: null
  },
  owner: {
    user: {
      id: String,
      name: String,
      email: String,
      avatar_url: String
    }
  },
  duplicatedTemplateId: {
    type: String,
    default: null
  },
  requestId: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  permissions: [{
    type: {
      type: String,
      enum: ['read_content', 'insert_content', 'read_user_with_email', 'read_user_without_email'],
      required: true
    },
    granted: {
      type: Boolean,
      default: false
    }
  }],
  lastSyncAt: {
    type: Date,
    default: null
  },
  syncErrors: [{
    error: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  metadata: {
    connectedAt: {
      type: Date,
      default: Date.now
    },
    lastUsed: {
      type: Date,
      default: Date.now
    },
    usageCount: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.accessToken;
      return ret;
    }
  }
});

// Indexes
notionIntegrationSchema.index({ userId: 1 });
notionIntegrationSchema.index({ botId: 1 });
notionIntegrationSchema.index({ workspaceId: 1 });
notionIntegrationSchema.index({ requestId: 1 });

// Method to update last used timestamp
notionIntegrationSchema.methods.updateLastUsed = function() {
  this.metadata.lastUsed = new Date();
  this.metadata.usageCount += 1;
  return this.save();
};

// Method to record sync error
notionIntegrationSchema.methods.recordSyncError = function(error) {
  this.syncErrors.push({ error: error.toString() });
  // Keep only last 10 sync errors
  if (this.syncErrors.length > 10) {
    this.syncErrors = this.syncErrors.slice(-10);
  }
  return this.save();
};

// Method to update sync status
notionIntegrationSchema.methods.updateSyncStatus = function(success = true) {
  if (success) {
    this.lastSyncAt = new Date();
  }
  return this.save();
};

// Static method to find active integration by user
notionIntegrationSchema.statics.findActiveByUser = function(userId) {
  return this.findOne({ userId, isActive: true }).populate('userId', 'name email');
};

// Static method to deactivate all integrations for a user
notionIntegrationSchema.statics.deactivateForUser = function(userId) {
  return this.updateMany({ userId }, { isActive: false });
};

module.exports = mongoose.model('NotionIntegration', notionIntegrationSchema);
