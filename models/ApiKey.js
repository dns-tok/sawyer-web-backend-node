const mongoose = require("mongoose");

const apiKeySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    provider: {
      type: String,
      required: true,
      enum: ["openai", "anthropic"],
      default: "openai",
    },
    keyName: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, "Key name cannot exceed 100 characters"],
    },
    encryptedApiKey: {
      type: String,
      required: true,
      select: false, // Don't return encrypted key in queries by default
    },
    keyPrefix: {
      type: String,
      required: true, // Store first few characters for identification
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationError: {
      type: String,
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
    usageCount: {
      type: Number,
      default: 0,
    },
    metadata: {
      organizationId: {
        type: String,
        default: null,
      },
      permissions: [
        {
          type: String,
        },
      ],
      models: [
        {
          id: String,
          name: String,
          provider: String,
        },
      ],
      limits: {
        rateLimit: {
          type: Number,
          default: null,
        },
        quotaLimit: {
          type: Number,
          default: null,
        },
      },
      lastValidation: {
        type: Date,
        default: null,
      },
      validationErrors: [
        {
          error: String,
          timestamp: {
            type: Date,
            default: Date.now,
          },
        },
      ],
    },
    expiresAt: {
      type: Date,
      default: null, // Some API keys might have expiration
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        delete ret.encryptedApiKey;
        return ret;
      },
    },
  }
);

// Compound indexes
apiKeySchema.index({ userId: 1, provider: 1 });
apiKeySchema.index({ userId: 1, isActive: 1 });
apiKeySchema.index({ provider: 1, isActive: 1 });
apiKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Ensure only one active API key per provider per user
apiKeySchema.index(
  { userId: 1, provider: 1, isActive: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true },
  }
);

// Method to update last used timestamp
apiKeySchema.methods.updateLastUsed = function () {
  this.lastUsedAt = new Date();
  this.usageCount += 1;
  return this.save();
};

// Method to record validation error
apiKeySchema.methods.recordValidationError = function (error) {
  this.metadata.validationErrors.push({ error: error.toString() });
  // Keep only last 5 validation errors
  if (this.metadata.validationErrors.length > 5) {
    this.metadata.validationErrors = this.metadata.validationErrors.slice(-5);
  }
  this.verificationError = error.toString();
  this.isVerified = false;
  return this.save();
};

// Method to mark as verified
apiKeySchema.methods.markAsVerified = function (metadata = {}) {
  this.isVerified = true;
  this.verifiedAt = new Date();
  this.verificationError = null;
  this.metadata.lastValidation = new Date();

  // Update metadata if provided
  if (metadata.organizationId) {
    this.metadata.organizationId = metadata.organizationId;
  }
  if (metadata.permissions) {
    this.metadata.permissions = metadata.permissions;
  }
  if (metadata.limits) {
    this.metadata.limits = { ...this.metadata.limits, ...metadata.limits };
  }

  return this.save();
};

// Method to deactivate API key
apiKeySchema.methods.deactivate = function () {
  this.isActive = false;
  return this.save();
};

// Static method to find active API key by user and provider
apiKeySchema.statics.findActiveByUserAndProvider = function (
  userId,
  provider = "openai"
) {
  return this.findOne({ userId, provider, isActive: true }).populate(
    "userId",
    "name email"
  );
};

// Static method to deactivate all keys for a user and provider
apiKeySchema.statics.deactivateForUserAndProvider = function (
  userId,
  provider = "openai"
) {
  return this.updateMany({ userId, provider }, { isActive: false });
};

// Pre-save middleware to generate key prefix
apiKeySchema.pre("save", function (next) {
  if (this.isModified("encryptedApiKey") && !this.keyPrefix) {
    // This will be set when the encrypted key is created
    // The actual prefix should be set in the service layer
  }
  next();
});

module.exports = mongoose.model("ApiKey", apiKeySchema);
