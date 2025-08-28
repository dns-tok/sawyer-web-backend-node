const jwt = require("jsonwebtoken");
const User = require("../models/User");
const crypto = require("crypto");

const ACCESS_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "15m";
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "30d";
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

class AuthService {
  // Generate access token with tokenVersion so we can revoke access tokens on version bump
  generateAccessToken(user) {
    const payload = {
      userId: user._id,
      tokenVersion: user.tokenVersion || 0,
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_EXPIRES_IN });
  }

  // Generate refresh token (signed JWT). We include a jti for traceability, and type.
  generateRefreshToken(user) {
    const jti = crypto.randomBytes(16).toString("hex");
    const payload = {
      userId: user._id,
      type: "refresh",
      jti,
    };
    const token = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES_IN });
    return { token, jti };
  }

  // Verify refresh token and return decoded payload
  verifyRefreshToken(token) {
    try {
      return jwt.verify(token, JWT_REFRESH_SECRET);
    } catch (error) {
      throw new Error("Invalid refresh token");
    }
  }

  // Generate new access+refresh pair and store refresh token in DB (rotation)
  async generateTokenPair(user, { ip = null, userAgent = null } = {}) {
    // Ensure user is fresh object
    if (!user || !user._id) user = await User.findById(user._id || user);

    const accessToken = this.generateAccessToken(user);
    const { token: refreshToken, jti } = this.generateRefreshToken(user);

    // Store refresh token (raw string). In production consider storing hashed version.
    await user.addRefreshToken(refreshToken, ip, userAgent);

    return { accessToken, refreshToken };
  }

  // Refresh tokens with rotation and reuse detection
  async refreshTokens(refreshToken, { ip = null, userAgent = null } = {}) {
    // Validate token signature first
    let decoded;
    try {
      decoded = this.verifyRefreshToken(refreshToken);
    } catch (err) {
      // invalid signature -> reject
      throw new Error("Invalid refresh token");
    }

    // Find user
    const user = await User.findById(decoded.userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Check whether token exists in DB (rotation check)
    const tokenExists = user.refreshTokens.some((rt) => rt.token === refreshToken);

    if (!tokenExists) {
      // Token reuse: attacker could be using an old token.
      // Revoke all refresh tokens for user as a security measure.
      await user.removeAllRefreshTokens();
      throw new Error("Refresh token reuse detected. All sessions revoked.");
    }

    // Valid token and present -> remove old token (rotate) and issue new pair
    await user.removeRefreshToken(refreshToken);
    const pair = await this.generateTokenPair(user, { ip, userAgent });
    return pair;
  }

  // Logout (remove refresh token)
  async logout(userId, refreshToken) {
    const user = await User.findById(userId);
    if (!user) return;
    if (refreshToken) {
      await user.removeRefreshToken(refreshToken);
    }
  }

  // Logout from all devices
  async logoutFromAllDevices(userId) {
    const user = await User.findById(userId);
    if (!user) return;
    await user.removeAllRefreshTokens();
  }

  // Email verification token generation (we will create a random token and return raw; store hash in DB)
  generateRandomToken() {
    return crypto.randomBytes(32).toString("hex");
  }

  // Hash helper
  hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  // Generate email verification token (raw + caller will store hash)
  createEmailVerificationToken() {
    const raw = this.generateRandomToken();
    const hash = this.hashToken(raw);
    return { raw, hash };
  }

  // Generate password reset token (raw + hash)
  createPasswordResetToken() {
    const raw = this.generateRandomToken();
    const hash = this.hashToken(raw);
    return { raw, hash };
  }

  // Verify password reset token by hashing and comparing (caller will query)
  verifyPasswordResetTokenHash(rawToken, storedHash) {
    const hash = this.hashToken(rawToken);
    return hash === storedHash;
  }
}

module.exports = new AuthService();
