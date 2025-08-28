const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: [true, 'Project name is required'],
    trim: true,
    maxlength: [100, 'Project name cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Project description is required'],
    trim: true,
    maxlength: [2500, 'Agent description cannot exceed 500 words (approximately 2500 characters)']
  },
  icon: {
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number,
    path: String,
    url: String
  },
  status: {
    type: String,
    enum: ['active', 'archived'],
    default: 'active'
  },
  attachments: {
    type: [{
      filename: String,
      originalName: String,
      mimetype: String,
      size: Number,
      path: String,
      url: String,
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    }],
    default: []
  },
  mcpResources: {
    type: {
      notion: {
        enabled: {
          type: Boolean,
          default: false
        },
        resources: [{
          resourceType: {
            type: String,
            enum: ['database', 'page', 'workspace'],
            required: true
          },
          resourceId: {
            type: String,
            required: true
          },
          name: {
            type: String,
            required: true
          },
          url: String,
          description: String,
          metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
          },
          addedAt: {
            type: Date,
            default: Date.now
          }
        }]
      },
      github: {
        enabled: {
          type: Boolean,
          default: false
        },
        resources: [{
          resourceType: {
            type: String,
            enum: ['repository'],
            required: true
          },
          resourceId: {
            type: String,
            required: true
          },
          name: {
            type: String,
            required: true
          },
          fullName: String,
          url: String,
          description: String,
          private: Boolean,
          defaultBranch: String,
          language: String,
          metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
          },
          addedAt: {
            type: Date,
            default: Date.now
          }
        }]
      },
      jira: {
        enabled: {
          type: Boolean,
          default: false
        },
        resources: [{
          resourceType: {
            type: String,
            enum: ['project', 'board'],
            required: true
          },
          resourceId: {
            type: String,
            required: true
          },
          name: {
            type: String,
            required: true
          },
          key: String,
          url: String,
          description: String,
          projectType: String,
          cloudId: String,
          metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
          },
          addedAt: {
            type: Date,
            default: Date.now
          }
        }]
      }
    },
    default: {
      notion: { enabled: false, resources: [] },
      github: { enabled: false, resources: [] },
      jira: { enabled: false, resources: [] }
    }
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.__v;
      delete ret.isDeleted;
      return ret;
    }
  }
});

// Indexes
projectSchema.index({ userId: 1, createdAt: -1 });
projectSchema.index({ userId: 1, status: 1 });
projectSchema.index({ userId: 1, name: 'text', description: 'text' });

// Virtual for total file size
projectSchema.virtual('totalFileSize').get(function() {
  let total = 0;
  if (this.icon && this.icon.size) total += this.icon.size;
  if (this.attachments) {
    total += this.attachments.reduce((sum, file) => sum + (file.size || 0), 0);
  }
  return total;
});

// Virtual for resource count
projectSchema.virtual('resourceCount').get(function() {
  let count = 0;
  if (this.mcpResources.notion.resources) count += this.mcpResources.notion.resources.length;
  if (this.mcpResources.github.resources) count += this.mcpResources.github.resources.length;
  if (this.mcpResources.jira.resources) count += this.mcpResources.jira.resources.length;
  return count;
});

// Static methods
projectSchema.statics.findByUserId = function(userId, options = {}) {
  const query = { userId, isDeleted: false };
  
  if (options.status) query.status = options.status;
  
  let mongoQuery = this.find(query);
  
  if (options.select) mongoQuery = mongoQuery.select(options.select);
  if (options.populate) mongoQuery = mongoQuery.populate(options.populate);
  if (options.sort) mongoQuery = mongoQuery.sort(options.sort);
  if (options.limit) mongoQuery = mongoQuery.limit(options.limit);
  if (options.skip) mongoQuery = mongoQuery.skip(options.skip);
  
  return mongoQuery;
};

projectSchema.statics.findByUserIdAndProjectId = function(userId, projectId) {
  return this.findOne({ _id: projectId, userId, isDeleted: false });
};

// Instance methods
projectSchema.methods.softDelete = function() {
  this.isDeleted = true;
  this.deletedAt = new Date();
  return this.save();
};



projectSchema.methods.getResourcesByService = function(service) {
  if (!this.mcpResources[service]) {
    return [];
  }

  return this.mcpResources[service].resources;
};

projectSchema.methods.getAllResources = function() {
  const allResources = [];

  ['notion', 'github', 'jira'].forEach(service => {
    if (this.mcpResources[service] && this.mcpResources[service].enabled) {
      this.mcpResources[service].resources.forEach(resource => {
        allResources.push({
          service,
          ...resource.toObject()
        });
      });
    }
  });

  return allResources;
};


module.exports = mongoose.model('Project', projectSchema);
