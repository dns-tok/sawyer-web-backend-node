const jwt = require('jsonwebtoken');
const User = require('../models/User');

class AuthService {
  // Generate access token
  generateAccessToken(userId) {
    return jwt.sign(
      { userId },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
    );
  }

  // Generate refresh token
  generateRefreshToken(userId) {
    return jwt.sign(
      { userId, type: 'refresh' },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
    );
  }

  // Verify refresh token
  verifyRefreshToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  // Generate token pair
  async generateTokenPair(userId) {
    const accessToken = this.generateAccessToken(userId);
    const refreshToken = this.generateRefreshToken(userId);
    
    // Store refresh token in database
    const user = await User.findById(userId);
    if (user) {
      await user.addRefreshToken(refreshToken);
    }

    return { accessToken, refreshToken };
  }

  // Refresh tokens
  async refreshTokens(refreshToken) {
    try {
      const decoded = this.verifyRefreshToken(refreshToken);
      
      // Find user and check if refresh token exists
      const user = await User.findById(decoded.userId);
      if (!user) {
        throw new Error('User not found');
      }

      const tokenExists = user.refreshTokens.some(rt => rt.token === refreshToken);
      if (!tokenExists) {
        throw new Error('Invalid refresh token');
      }

      // Remove old refresh token and generate new pair
      await user.removeRefreshToken(refreshToken);
      return await this.generateTokenPair(user._id);
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  // Logout (remove refresh token)
  async logout(userId, refreshToken) {
    const user = await User.findById(userId);
    if (user && refreshToken) {
      await user.removeRefreshToken(refreshToken);
    }
  }

  // Logout from all devices
  async logoutFromAllDevices(userId) {
    const user = await User.findById(userId);
    if (user) {
      await user.removeAllRefreshTokens();
    }
  }

  // Generate email verification token
  generateEmailVerificationToken(email) {
    return jwt.sign(
      { email, type: 'email_verification' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
  }

  // Verify email verification token
  verifyEmailVerificationToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      throw new Error('Invalid or expired verification token');
    }
  }

  // Generate password reset token
  generatePasswordResetToken(email) {
    return jwt.sign(
      { email, type: 'password_reset' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  }

  // Verify password reset token
  verifyPasswordResetToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      throw new Error('Invalid or expired reset token');
    }
  }
}

module.exports = new AuthService();
