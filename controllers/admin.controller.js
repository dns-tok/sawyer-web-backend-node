const bcrypt = require("bcryptjs");
const User = require("../models/User");
const authService = require("../services/auth.service");
const responseHandler = require("../utils/response.handler");
const nodemailer = require("nodemailer");

// Helper: check default admin credentials
function isDefaultCredentials(email, password) {
  return (
    email === (process.env.DEFAULT_ADMIN_EMAIL || "lojipajo@forexnews.bg") &&
    password === (process.env.DEFAULT_ADMIN_PASSWORD || "admin123")
  );
}

const FAKE_PASSWORD_HASH = bcrypt.hashSync("fake_password_for_timing", 12);

// Cookie options for refresh token
const REFRESH_TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/", // only send to refresh endpoint
  maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days in ms
};

class AdminController {
  // Login
  async login(req, res) {
    try {
      let { email, password } = req.body;
      if (!email || !password) {
        await bcrypt.compare(password || "", FAKE_PASSWORD_HASH);
        return responseHandler.unauthorized(res, "Invalid email or password");
      }

      email = String(email).trim().toLowerCase();

      const adminCount = await User.countDocuments({ role: "admin" });

      // First admin setup
      if (adminCount === 0) {
        if (!isDefaultCredentials(email, password)) {
          await bcrypt.compare(password, FAKE_PASSWORD_HASH);
          return responseHandler.unauthorized(
            res,
            "Invalid default admin credentials"
          );
        }

        // Create first admin with default password unchanged
        const adminUser = new User({
          email,
          password, // use default password as-is
          name: "System Administrator",
          role: "admin",
          isEmailVerified: true,
          isActive: true,
        });

        await adminUser.save();

        const ip = req.ip || req.headers["x-forwarded-for"] || null;
        const ua = req.get("User-Agent") || null;

        const tokens = await authService.generateTokenPair(adminUser, {
          ip,
          userAgent: ua,
        });

        res.cookie(
          "refreshToken",
          tokens.refreshToken,
          REFRESH_TOKEN_COOKIE_OPTIONS
        );

        adminUser.lastLogin = new Date();
        await adminUser.save();

        return responseHandler.success(
          res,
          {
            user: adminUser.toJSON(),
            tokens: { accessToken: tokens.accessToken },
          },
          "First admin logged in successfully."
        );
      }

      // Normal admin login
      const user = await User.findOne({ email, role: "admin" }).select(
        "+password +loginAttempts +lockUntil +tokenVersion"
      );

      if (!user) {
        await bcrypt.compare(password, FAKE_PASSWORD_HASH);
        return responseHandler.unauthorized(res, "Invalid email or password");
      }

      if (user.isLocked) {
        return responseHandler.error(
          res,
          "Account locked due to too many failed login attempts. Try later.",
          423
        );
      }

      const validPassword = await user.comparePassword(password);
      if (!validPassword) {
        await user.incLoginAttempts();
        return responseHandler.unauthorized(res, "Invalid email or password");
      }

      if (!user.isActive) {
        return responseHandler.unauthorized(
          res,
          "Account deactivated. Contact support."
        );
      }

      if (user.loginAttempts > 0) await user.resetLoginAttempts();

      const ip = req.ip || req.headers["x-forwarded-for"] || null;
      const ua = req.get("User-Agent") || null;

      const tokens = await authService.generateTokenPair(user, {
        ip,
        userAgent: ua,
      });
      user.lastLogin = new Date();
      await user.save();

      res.cookie(
        "refreshToken",
        tokens.refreshToken,
        REFRESH_TOKEN_COOKIE_OPTIONS
      );

      return responseHandler.success(
        res,
        { user: user.toJSON(), tokens: { accessToken: tokens.accessToken } },
        "Login successful"
      );
    } catch (error) {
      console.error("Admin login error:", error);
      return responseHandler.error(
        res,
        "Login failed",
        500,
        error.message || error
      );
    }
  }

  // Refresh token
  async refresh(req, res) {
    try {
      const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
      if (!refreshToken)
        return responseHandler.unauthorized(res, "Refresh token required");

      const decoded = await authService.verifyToken(refreshToken, "refresh");
      const user = await User.findById(decoded.userId);

      if (!user || user.role !== "admin")
        return responseHandler.unauthorized(res, "Admin access required");

      const ip = req.ip || req.headers["x-forwarded-for"] || null;
      const ua = req.get("User-Agent") || null;

      const pair = await authService.refreshTokens(refreshToken, {
        ip,
        userAgent: ua,
      });

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
      console.error("Admin refresh error:", error);
      res.clearCookie("refreshToken", {
        path: REFRESH_TOKEN_COOKIE_OPTIONS.path,
      });
      return responseHandler.unauthorized(res, "Invalid refresh token");
    }
  }

  // Logout
  async logout(req, res) {
    try {
      const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
      const userId = req.user?._id;

      if (!userId) {
        res.clearCookie("refreshToken", {
          path: REFRESH_TOKEN_COOKIE_OPTIONS.path,
        });
        return responseHandler.success(res, null, "Logged out successfully");
      }

      await authService.logout(userId, refreshToken);
      res.clearCookie("refreshToken", {
        path: REFRESH_TOKEN_COOKIE_OPTIONS.path,
      });

      return responseHandler.success(res, null, "Logged out successfully");
    } catch (error) {
      console.error("Admin logout error:", error);
      return responseHandler.error(
        res,
        "Logout failed",
        500,
        error.message || error
      );
    }
  }

  // Logout all devices
  async logoutFromAllDevices(req, res) {
    try {
      await authService.logoutFromAllDevices(req.user._id);
      res.clearCookie("refreshToken", {
        path: REFRESH_TOKEN_COOKIE_OPTIONS.path,
      });
      return responseHandler.success(res, null, "Logged out from all devices");
    } catch (error) {
      console.error("Admin logout all error:", error);
      return responseHandler.error(
        res,
        "Failed to logout",
        500,
        error.message || error
      );
    }
  }

  // Forgot password
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;
      if (!email) return responseHandler.error(res, "Email required", 400);

      const normalizedEmail = String(email).trim().toLowerCase();
      const user = await User.findOne({
        email: normalizedEmail,
        role: "admin",
      });

      if (!user) {
        return responseHandler.success(
          res,
          null,
          "If an admin account exists, a password reset link has been sent."
        );
      }

      const { raw: resetRaw, hash: resetHash } =
        authService.createPasswordResetToken();
      user.resetPasswordTokenHash = resetHash;
      user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await user.save();

      const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetRaw}`;

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      await transporter.sendMail({
        from: `"${process.env.EMAIL_FROM_NAME || "App"}" <${
          process.env.EMAIL_USER
        }>`,
        to: user.email,
        subject: "Password Reset Request",
        html: `<p>Hello ${user.name},</p><p>Reset your password: <a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 1 hour.</p>`,
        text: `Reset your password: ${resetUrl} (expires in 1 hour)`,
      });

      return responseHandler.success(
        res,
        null,
        "If an admin account exists, a password reset link has been sent."
      );
    } catch (error) {
      console.error("Admin forgot password error:", error);
      return responseHandler.error(
        res,
        "Failed to process request",
        500,
        error.message || error
      );
    }
  }

  // Reset password
  //   Same api used for admin and user

  // Change password (authenticated)
  async changePassword(req, res) {
    const { currentPassword, newPassword } = req.body;
    try {
      if (!currentPassword || !newPassword)
        return responseHandler.error(res, "Both passwords required", 400);

      if (currentPassword === newPassword)
        return responseHandler.error(
          res,
          "currentPassword and newPassword can not be same",
          400
        );

      const user = await User.findById(req.user._id).select("+password");
      if (!user) return responseHandler.error(res, "User not found", 404);

      const valid = await user.comparePassword(currentPassword);
      if (!valid)
        return responseHandler.error(res, "Current password incorrect", 400);

      user.password = newPassword;
      await user.removeAllRefreshTokens();
      await user.save();

      res.clearCookie("refreshToken", {
        path: REFRESH_TOKEN_COOKIE_OPTIONS.path,
      });
      return responseHandler.success(
        res,
        null,
        "Password changed successfully"
      );
    } catch (error) {
      console.error("Admin change password error:", error);
      return responseHandler.error(
        res,
        "Failed to change password",
        500,
        error.message || error
      );
    }
  }

  // Change another user's password (admin only)
  async changeUserPassword(req, res) {
    try {
      const { userId, newPassword } = req.body;
      if (!userId || !newPassword)
        return responseHandler.error(res, "User ID and password required", 400);
      if (newPassword.length < 8)
        return responseHandler.error(
          res,
          "Password must be at least 8 characters",
          400
        );

      const user = await User.findById(userId);
      if (!user) return responseHandler.error(res, "User not found", 404);

      user.password = newPassword;
      await user.removeAllRefreshTokens();
      await user.save();

      return responseHandler.success(
        res,
        null,
        "User password reset successfully"
      );
    } catch (error) {
      console.error("Admin reset user password error:", error);
      return responseHandler.error(
        res,
        "Failed to reset user password",
        500,
        error.message || error
      );
    }
  }
}

module.exports = AdminController;
