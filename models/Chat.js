const { tool } = require('@openai/agents');
const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true,
    trim: true
  },
  role: {
    type: String,
    required: true,
    enum: ['user', 'assistant', 'system']
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  metadata: {
    tokens: Number,
    model: String,
    toolCalls: [{
      name: String,
      output: mongoose.Schema.Types.Mixed,
    }],
    mcpContext: [{
      serverId: String,
      serverName: String,
      resourceType: String,
      resourceId: String,
      resourceName: String
    }]
  }
}, { _id: true });

const chatSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  messages: [chatMessageSchema],
  selectedModel: {
    id: String,
    name: String,
    provider: String
  },
  selectedDocument: {
    type: String,
    trim: true
  },
  mcpContext: [{
    serverId: String,
    serverName: String,
    serverType: String,
    resources: [{
      type: String,
      id: String,
      name: String,
      content: String
    }]
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  settings: {
    temperature: {
      type: Number,
      default: 0.7,
      min: 0,
      max: 2
    },
    maxTokens: {
      type: Number,
      default: 150,
      min: 1,
      max: 4000
    },
    systemPrompt: {
      type: String,
      trim: true
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
chatSchema.index({ userId: 1, createdAt: -1 });
chatSchema.index({ userId: 1, isActive: 1, updatedAt: -1 });

// Virtual for message count
chatSchema.virtual('messageCount').get(function() {
  return this?.messages?.length || 0;
});

// Virtual for last message
chatSchema.virtual('lastMessage').get(function() {
  return this?.messages?.length > 0 ? this.messages[this.messages.length - 1] : null;
});

// Static methods
chatSchema.statics.findByUserId = function(userId, options = {}) {
  const query = { userId, isActive: true };
  return this.find(query)
    .sort({ updatedAt: -1 })
    .limit(options.limit || 50)
    .select(options.select || '');
};

chatSchema.statics.findByUserIdAndChatId = function(userId, chatId) {
  return this.findOne({ _id: chatId, userId, isActive: true });
};

// Instance methods
chatSchema.methods.addMessage = function(messageData) {
  this.messages.push({
    content: messageData.content,
    role: messageData.role,
    timestamp: messageData.timestamp || new Date(),
    metadata: messageData.metadata || {}
  });
  
  // Update chat title if it's the first user message
  if (this.messages.length === 1 && messageData.role === 'user') {
    const title = messageData.content.length > 50 
      ? messageData.content.substring(0, 50) + '...'
      : messageData.content;
    this.title = title;
  }
  
  return this.save();
};

chatSchema.methods.updateSettings = function(settings) {
  this.settings = { ...this.settings, ...settings };
  return this.save();
};

chatSchema.methods.setContext = function(model, document, mcpContext) {
  if (model) this.selectedModel = model;
  if (document !== undefined) this.selectedDocument = document;
  if (mcpContext) this.mcpContext = mcpContext;
  return this.save();
};

chatSchema.methods.softDelete = function() {
  this.isActive = false;
  return this.save();
};

module.exports = mongoose.model('Chat', chatSchema);
