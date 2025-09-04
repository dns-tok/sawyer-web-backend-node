const User = require("../models/User");
const authService = require("../services/auth.service");
const responseHandler = require("../utils/response.handler");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

// Pre-compute a fake hash to mitigate timing attacks when user not found
export const FAKE_PASSWORD_HASH = bcrypt.hashSync(
  "fake_password_for_timing",
  12
);

// Cookie options for refresh token
export const REFRESH_TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/", // only send to refresh endpoint
  maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days in ms
};

class AuthController {
  // Register: create user, send email verification (do not auto-login)

  async register(req, res) {
    try {
      let { email, password, name } = req.body;
      if (!email || !password || !name) {
        return responseHandler.error(res, "Missing required fields", 400);
      }

      email = String(email).trim().toLowerCase();

      // Validate password strength - simple example (expand with libs)
      if (password.length < 8) {
        return responseHandler.error(
          res,
          "Password must be at least 8 characters",
          400
        );
      }

      // Check existing
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        // If existing but oauthOnly and email unverified, you may want a linking flow.
        return responseHandler.error(
          res,
          "User already exists with this email address",
          400
        );
      }

      // Create user (email unverified)
      const user = new User({
        email,
        password,
        name,
        isEmailVerified: false,
      });

      // Generate email verification token (raw + hash)
      const { raw: verificationRaw, hash: verificationHash } =
        authService.createEmailVerificationToken();
      user.emailVerificationTokenHash = verificationHash;
      user.emailVerificationExpires = new Date(
        Date.now() + 24 * 60 * 60 * 1000
      ); // 24h

      await user.save();
      const ip = req.ip || req.headers["x-forwarded-for"] || null;
      const ua = req.get("User-Agent") || null;
      const tokens = await authService.generateTokenPair(user, {
        ip,
        userAgent: ua,
      });

      // Set refresh token cookie
      res.cookie(
        "refreshToken",
        tokens.refreshToken,
        REFRESH_TOKEN_COOKIE_OPTIONS
      );

      // Send verification email (use your existing transporter config or a transactional provider)
      const transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      const verifyUrl = `${process.env.FRONTEND_URL}/verify-email/${verificationRaw}`;

      const mailOptions = {
        from: `"${process.env.EMAIL_FROM_NAME || "App"}" <${
          process.env.EMAIL_USER
        }>`,
        to: email,
        subject: "Verify your email",
        html: `<p>Hello ${user.name},</p>
               <p>Verify your email by clicking the link below:</p>
               <a href="${verifyUrl}">Verify Email</a>
               <p>This link expires in 24 hours.</p>`,
        text: `Verify your email: ${verifyUrl}`,
      };

      await transporter.sendMail(mailOptions);

      // Respond with access token in body
      return responseHandler.created(
        res,
        {
          user: user.toJSON(),
          tokens: { accessToken: tokens.accessToken },
        },
        "User registered and logged in. Verification email sent."
      );
    } catch (error) {
      console.error("Registration error:", error);
      return responseHandler.error(
        res,
        "Registration failed. Please try again.",
        500,
        error.message || error
      );
    }
  }

  // Verify email endpoint (expects token)
  async verifyEmail(req, res) {
    try {
      const { token } = req.body;
      if (!token)
        return responseHandler.error(res, "Verification token required", 400);

      const hash = authService.hashToken(token);
      const user = await User.findOne({
        emailVerificationTokenHash: hash,
        emailVerificationExpires: { $gt: Date.now() },
      });

      if (!user) {
        return responseHandler.error(
          res,
          "Invalid or expired verification token",
          400
        );
      }

      user.isEmailVerified = true;
      user.emailVerificationTokenHash = undefined;
      user.emailVerificationExpires = undefined;
      await user.save();

      return responseHandler.success(res, null, "Email verified successfully");
    } catch (error) {
      console.error("Verify email error:", error);
      return responseHandler.error(
        res,
        "Failed to verify email",
        500,
        error.message || error
      );
    }
  }

  // Login
  async login(req, res) {
    try {
      let { email, password } = req.body;
      if (!email || !password) {
        // perform fake compare to normalize timing
        await bcrypt.compare(password || "", FAKE_PASSWORD_HASH);
        return responseHandler.unauthorized(res, "Invalid email or password");
      }

      email = String(email).trim().toLowerCase();

      // Find user and include password & lock fields
      const user = await User.findOne({ email }).select(
        "+password +loginAttempts +lockUntil +tokenVersion"
      );

      // If not found -> do fake password compare to mitigate timing leaks
      if (!user) {
        await bcrypt.compare(password, FAKE_PASSWORD_HASH);
        return responseHandler.unauthorized(res, "Invalid email or password");
      }

      // Check lock
      if (user.isLocked) {
        return responseHandler.error(
          res,
          "Account temporarily locked due to too many failed login attempts. Please try again later.",
          423
        );
      }

      // Verify password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        await user.incLoginAttempts();
        return responseHandler.unauthorized(res, "Invalid email or password");
      }

      // Check active & email verified
      if (!user.isActive) {
        return responseHandler.unauthorized(
          res,
          "Account has been deactivated. Please contact support."
        );
      }

      //   if (!user.isEmailVerified) {
      //     return responseHandler.error(
      //       res,
      //       "Email not verified. Please verify before logging in.",
      //       403
      //     );
      //   }

      // Reset login attempts if any
      if (user.loginAttempts > 0) {
        await user.resetLoginAttempts();
      }

      // Generate tokens
      const ip = req.ip || req.headers["x-forwarded-for"] || null;
      const ua = req.get("User-Agent") || null;
      const tokens = await authService.generateTokenPair(user, {
        ip,
        userAgent: ua,
      });

      // Update last login
      user.lastLogin = new Date();
      await user.save();

      // Set refresh token as HttpOnly cookie for safety (also return tokens in body for client use if needed)
      res.cookie(
        "refreshToken",
        tokens.refreshToken,
        REFRESH_TOKEN_COOKIE_OPTIONS
      );
      return responseHandler.success(
        res,
        {
          user: user.toJSON(),
          tokens: { accessToken: tokens.accessToken }, // refresh in cookie
        },
        "Login successful"
      );
    } catch (error) {
      console.error("Login error:", error);
      return responseHandler.error(
        res,
        "Login failed. Please try again.",
        500,
        error.message || error
      );
    }
  }

  // Refresh - rotates refresh token and issues new access + refresh
  async refresh(req, res) {
    try {
      // Prefer cookie for refresh token, fall back to body
      const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
      if (!refreshToken)
        return responseHandler.unauthorized(res, "Refresh token required");

      const ip = req.ip || req.headers["x-forwarded-for"] || null;
      const ua = req.get("User-Agent") || null;

      const pair = await authService.refreshTokens(refreshToken, {
        ip,
        userAgent: ua,
      });

      // Set new refresh token cookie and return access token
      res.cookie(
        "refreshToken",
        pair.refreshToken,
        REFRESH_TOKEN_COOKIE_OPTIONS
      );

      return responseHandler.success(
        res,
        { accessToken: pair.accessToken },
        "Tokens refreshed successfully"
      );
    } catch (error) {
      console.error("Token refresh error:", error);
      // Clear cookie on any refresh error
      res.clearCookie("refreshToken", {
        path: REFRESH_TOKEN_COOKIE_OPTIONS.path,
      });
      return responseHandler.unauthorized(
        res,
        error.message || "Invalid refresh token"
      );
    }
  }

  // Logout - removes single refresh token
  async logout(req, res) {
    try {
      // refresh token may be in cookie or body
      const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
      const userId = req.user && req.user._id;

      if (!userId) {
        // No authenticated user — still clear cookie
        res.clearCookie("refreshToken", {
          path: REFRESH_TOKEN_COOKIE_OPTIONS.path,
        });
        return responseHandler.success(res, null, "Logged out successfully");
      }

      await authService.logout(userId, refreshToken);

      // Clear cookie
      res.clearCookie("refreshToken", {
        path: REFRESH_TOKEN_COOKIE_OPTIONS.path,
      });

      return responseHandler.success(res, null, "Logged out successfully");
    } catch (error) {
      console.error("Logout error:", error);
      return responseHandler.error(
        res,
        "Logout failed",
        500,
        error.message || error
      );
    }
  }

  // Logout from all devices
  async logoutFromAllDevices(req, res) {
    try {
      const userId = req.user._id;
      await authService.logoutFromAllDevices(userId);
      // Clear cookie
      res.clearCookie("refreshToken", {
        path: REFRESH_TOKEN_COOKIE_OPTIONS.path,
      });
      return responseHandler.success(
        res,
        null,
        "Logged out from all devices successfully"
      );
    } catch (error) {
      console.error("Logout from all devices error:", error);
      return responseHandler.error(
        res,
        "Failed to logout from all devices",
        500,
        error.message || error
      );
    }
  }

  // Forgot password - generate reset token and email (store only hash)
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return responseHandler.error(res, "Invalid email address", 400);
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const user = await User.findOne({ email: normalizedEmail });

      // Always respond with success message (don't reveal existence)
      if (!user) {
        return responseHandler.success(
          res,
          null,
          "If an account with that email exists, a password reset link has been sent."
        );
      }

      // Create reset token (raw + hash)
      const { raw: resetRaw, hash: resetHash } =
        authService.createPasswordResetToken();
      user.resetPasswordTokenHash = resetHash;
      user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await user.save();

      const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetRaw}`;

      const transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      const mailOptions = {
        from: `"${process.env.EMAIL_FROM_NAME || "App"}" <${
          process.env.EMAIL_USER
        }>`,
        to: user.email,
        subject: "Password Reset Request",
        html: `<p>Hello ${user.name},</p>
               <p>You requested a password reset. Click the link below to reset your password:</p>
               <a href="${resetUrl}">Reset Password</a>
               <p>This link will expire in 1 hour.</p>`,
        text: `Reset your password: ${resetUrl}\nThis link will expire in 1 hour.`,
      };

      await transporter.sendMail(mailOptions);

      return responseHandler.success(
        res,
        null,
        "If an account with that email exists, a password reset link has been sent."
      );
    } catch (error) {
      console.error("Forgot password error:", error);
      return responseHandler.error(
        res,
        "Failed to process password reset request",
        500,
        error.message || error
      );
    }
  }

  // Reset password - expects raw token + new password
  async resetPassword(req, res) {
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        return responseHandler.error(
          res,
          "Token and new password are required",
          400
        );
      }

      if (password.length < 8) {
        return responseHandler.error(
          res,
          "Password must be at least 8 characters",
          400
        );
      }

      const hash = authService.hashToken(token);
      const user = await User.findOne({
        resetPasswordTokenHash: hash,
        resetPasswordExpires: { $gt: Date.now() },
      }).select("+password");

      if (!user) {
        return responseHandler.error(
          res,
          "Invalid or expired reset token",
          400
        );
      }

      // Update password (pre-save hook increments tokenVersion)
      user.password = password;
      user.resetPasswordTokenHash = undefined;
      user.resetPasswordExpires = undefined;

      // Clear all refresh tokens for security and bump tokenVersion (handled in removeAllRefreshTokens)
      await user.removeAllRefreshTokens();
      await user.save();

      return responseHandler.success(
        res,
        null,
        "Password reset successful. Please login with your new password."
      );
    } catch (error) {
      console.error("Reset password error:", error);
      return responseHandler.error(
        res,
        "Failed to reset password",
        500,
        error.message || error
      );
    }
  }

  // Change password (authenticated)
  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return responseHandler.error(
          res,
          "Both current and new passwords are required",
          400
        );
      }

      if (newPassword.length < 8) {
        return responseHandler.error(
          res,
          "New password must be at least 8 characters",
          400
        );
      }

      const user = await User.findById(req.user._id).select("+password");
      if (!user) return responseHandler.error(res, "User not found", 404);

      const valid = await user.comparePassword(currentPassword);
      if (!valid)
        return responseHandler.error(res, "Current password is incorrect", 400);

      user.password = newPassword;

      // removeAllRefreshTokens will bump tokenVersion and clear refreshes
      await user.removeAllRefreshTokens();
      await user.save();

      // Clear cookie
      res.clearCookie("refreshToken", {
        path: REFRESH_TOKEN_COOKIE_OPTIONS.path,
      });

      return responseHandler.success(
        res,
        null,
        "Password changed successfully"
      );
    } catch (error) {
      console.error("Change password error:", error);
      return responseHandler.error(
        res,
        "Failed to change password",
        500,
        error.message || error
      );
    }
  }

  // Get current user
  async getMe(req, res) {
    try {
      return responseHandler.success(
        res,
        { user: req.user.toJSON() },
        "User information retrieved successfully"
      );
    } catch (error) {
      console.error("Get user info error:", error);
      return responseHandler.error(
        res,
        "Failed to get user information",
        500,
        error.message || error
      );
    }
  }

  async googleAuth(req, res, next) {
    try {
      const { email, name, googleId, photoURL } = req.body;

      if (!email || !googleId) {
        return responseHandler.error(
          res,
          "Missing required Google authentication data",
          400
        );
      }

      let user = await User.findOne({ email });

      if (!user) {
        // Create new user (email verified by default)
        user = await User.create({
          email,
          name: name || email.split("@")[0],
          googleId,
          photoURL,
          isEmailVerified: true,
          oauthOnly: true,
        });
      } else {
        // If user exists but not Google-linked, optionally link googleId
        if (!user.googleId) {
          user.googleId = googleId;
          if (photoURL) user.photoURL = photoURL;
          await user.save();
        }
        if (!user.isEmailVerified) user.isEmailVerified = true;
      }

      // Generate access + refresh tokens (use your authService helper)
      const tokens = await authService.generateTokenPair(user);

      // Set refresh token as HttpOnly cookie
      res.cookie(
        "refreshToken",
        tokens.refreshToken,
        REFRESH_TOKEN_COOKIE_OPTIONS
      );

      return responseHandler.success(
        res,
        { user: user.toJSON(), tokens: { accessToken: tokens.accessToken } },
        "Google login/signup successful"
      );
    } catch (error) {
      console.error("Google Auth error:", error);
      return responseHandler.error(
        res,
        "Google authentication failed. Please try again.",
        500,
        error.message || error
      );
    }
  }
}

module.exports = AuthController;
