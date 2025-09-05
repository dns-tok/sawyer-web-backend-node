const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const mongoosePaginate = require("mongoose-paginate-v2");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please enter a valid email",
      ],
    },
    password: {
      type: String,
      required: function () {
        return !this.oauthOnly;
      },
      minlength: [8, "Password must be at least 8 characters long"],
      select: false,
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    avatar: { type: String, default: null },

    // Email verification (store hashed token only)
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationTokenHash: { type: String, default: null },
    emailVerificationExpires: { type: Date, default: null },

    // Password reset (store hashed token only)
    resetPasswordTokenHash: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },

    // Refresh tokens (storing raw tokens here for rotation; consider storing hashed tokens in prod)
    refreshTokens: [
      {
        token: { type: String, required: true },
        createdAt: {
          type: Date,
          default: Date.now,
          expires: 60 * 60 * 24 * 31,
        }, // optional TTL
        ip: { type: String, default: null },
        userAgent: { type: String, default: null },
      },
    ],

    lastLogin: { type: Date, default: null },

    // Lockout
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },

    isActive: { type: Boolean, default: true },
    role: { type: String, enum: ["user", "admin"], default: "user" },

    // Used to invalidate existing access tokens when important changes happen
    tokenVersion: { type: Number, default: 0 },

    // For OAuth-only accounts
    oauthOnly: { type: Boolean, default: false },

    preferences: {
      notifications: {
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
      },
      theme: { type: String, enum: ["light", "dark", "auto"], default: "auto" },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        delete ret.password;
        delete ret.refreshTokens;
        delete ret.emailVerificationTokenHash;
        delete ret.emailVerificationExpires;
        delete ret.resetPasswordTokenHash;
        delete ret.resetPasswordExpires;
        delete ret.loginAttempts;
        delete ret.lockUntil;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes
userSchema.index({ resetPasswordTokenHash: 1 });
userSchema.index({ emailVerificationTokenHash: 1 });
userSchema.index({ email: 1 });

// Virtual for account lock status
userSchema.virtual("isLocked").get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save middleware to hash password
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    // bump tokenVersion when password changes (so access tokens can be invalidated)
    this.tokenVersion = (this.tokenVersion || 0) + 1;
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

// Methods for login attempts & lockout
userSchema.methods.incLoginAttempts = function () {
  // If lock has expired, reset to 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 },
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };
  // After 5 failed attempts lock for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }

  return this.updateOne(updates);
};

userSchema.methods.resetLoginAttempts = function () {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 },
  });
};

// Refresh token helpers
userSchema.methods.addRefreshToken = function (
  token,
  ip = null,
  userAgent = null
) {
  this.refreshTokens.push({ token, ip, userAgent });
  // Keep only last 10 tokens
  if (this.refreshTokens.length > 10) {
    this.refreshTokens = this.refreshTokens.slice(-10);
  }
  return this.save();
};

userSchema.methods.removeRefreshToken = function (token) {
  this.refreshTokens = this.refreshTokens.filter((rt) => rt.token !== token);
  return this.save();
};

userSchema.methods.removeAllRefreshTokens = function () {
  this.refreshTokens = [];
  // bump tokenVersion to invalidate access tokens
  this.tokenVersion = (this.tokenVersion || 0) + 1;
  return this.save();
};

userSchema.plugin(mongoosePaginate);

module.exports = mongoose.model("User", userSchema);
