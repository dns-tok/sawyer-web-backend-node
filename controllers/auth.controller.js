const User = require("../models/User");
const authService = require('../services/auth.service');
const responseHandler = require('../utils/response.handler');



class AuthController {

    async register(req, res) {
        try {
            const { email, password, name } = req.body;

            // Check if user already exists
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                return responseHandler.error(res, 'User already exists with this email address', 400);
            }

            // Create new user
            const user = new User({
                email,
                password,
                name
            });

            await user.save();

            // Generate tokens
            const { accessToken, refreshToken } = await authService.generateTokenPair(user._id);

            // Update last login
            user.lastLogin = new Date();
            await user.save();

            return responseHandler.created(res, {
                user: user.toJSON(),
                tokens: {
                    accessToken,
                    refreshToken
                }
            }, 'User registered successfully');
        } catch (error) {
            console.error('Registration error:', error);
            return responseHandler.error(res, 'Registration failed. Please try again.', 500, error);
        }
    }

    async login(req, res) {
        try {
            const { email, password } = req.body;

            // Find user and include password field
            const user = await User.findOne({ email }).select('+password +loginAttempts +lockUntil');

            if (!user) {
                return responseHandler.unauthorized(res, 'Invalid email or password');
            }

            // Check if account is locked
            if (user.isLocked) {
                return responseHandler.error(res, 'Account temporarily locked due to too many failed login attempts. Please try again later.', 423);
            }

            // Verify password
            const isPasswordValid = await user.comparePassword(password);

            if (!isPasswordValid) {
                // Increment login attempts
                await user.incLoginAttempts();
                return responseHandler.unauthorized(res, 'Invalid email or password');
            }

            // Check if account is active
            if (!user.isActive) {
                return responseHandler.unauthorized(res, 'Account has been deactivated. Please contact support.');
            }

            // Reset login attempts on successful login
            if (user.loginAttempts > 0) {
                await user.resetLoginAttempts();
            }

            // Generate tokens
            const { accessToken, refreshToken } = await authService.generateTokenPair(user._id);

            // Update last login
            user.lastLogin = new Date();
            await user.save();

            return responseHandler.success(res, {
                user: user.toJSON(),
                tokens: {
                    accessToken,
                    refreshToken
                }
            }, 'Login successful');
        } catch (error) {
            console.error('Login error:', error);
            return responseHandler.error(res, 'Login failed. Please try again.', 500, error);
        }
    }

    async refresh(req, res) {
        try {
            const { refreshToken } = req.body;

            const tokens = await authService.refreshTokens(refreshToken);

            return responseHandler.success(res, { tokens }, 'Tokens refreshed successfully');
        } catch (error) {
            console.error('Token refresh error:', error);
            return responseHandler.unauthorized(res, 'Invalid refresh token');
        }
    }

    async logout(req, res) {
        try {
            const refreshToken = req.body.refreshToken;

            await authService.logout(req.user._id, refreshToken);

            return responseHandler.success(res, null, 'Logged out successfully');
        } catch (error) {
            console.error('Logout error:', error);
            return responseHandler.error(res, 'Logout failed', 500, error);
        }
    }

    async logoutFromAllDevices(req, res) {
        try {
            const userId = req.user._id;

            await authService.logoutFromAllDevices(userId);

            return responseHandler.success(res, null, 'Logged out from all devices successfully');
        } catch (error) {
            console.error('Logout from all devices error:', error);
            return responseHandler.error(res, 'Failed to logout from all devices', 500, error);
        }
    }

    async forgotPassword(req, res) {
        try {
            const { email } = req.body;

            const user = await User.findOne({ email });

            if (!user) {
                // Don't reveal if email exists or not
                return responseHandler.success(res, null, 'If an account with that email exists, a password reset link has been sent.');
            }

            // Generate reset token
            const resetToken = authService.generatePasswordResetToken(email);

            // Save reset token to user
            user.resetPasswordToken = resetToken;
            user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
            await user.save();

            // TODO: Send email with reset link
            // For now, we'll just return the token (remove this in production)
            console.log('Password reset token:', resetToken);

            const responseData = process.env.NODE_ENV === 'development' ? { resetToken } : null;
            return responseHandler.success(res, responseData, 'If an account with that email exists, a password reset link has been sent.');
        } catch (error) {
            console.error('Forgot password error:', error);
            return responseHandler.error(res, 'Failed to process password reset request', 500, error);
        }
    }

    async resetPassword(req, res) {
        try {
            const { token, password } = req.body;

            // Verify reset token
            const decoded = authService.verifyPasswordResetToken(token);

            // Find user with reset token
            const user = await User.findOne({
                email: decoded.email,
                resetPasswordToken: token,
                resetPasswordExpires: { $gt: Date.now() }
            });

            if (!user) {
                return responseHandler.error(res, 'Invalid or expired reset token', 400);
            }

            // Update password
            user.password = password;
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;

            // Clear all refresh tokens for security
            user.refreshTokens = [];

            await user.save();

            return responseHandler.success(res, null, 'Password reset successful. Please login with your new password.');
        } catch (error) {
            console.error('Reset password error:', error);

            if (error.message.includes('Invalid or expired')) {
                return responseHandler.error(res, 'Invalid or expired reset token', 400);
            }

            return responseHandler.error(res, 'Failed to reset password', 500, error);
        }
    }

    async changePassword(req, res) {
        try {
            const { currentPassword, newPassword } = req.body;

            // Get user with password
            const user = await User.findById(req.user._id).select('+password');

            // Verify current password
            const isCurrentPasswordValid = await user.comparePassword(currentPassword);

            if (!isCurrentPasswordValid) {
                return responseHandler.error(res, 'Current password is incorrect', 400);
            }

            // Update password
            user.password = newPassword;
            await user.save();

            return responseHandler.success(res, null, 'Password changed successfully');
        } catch (error) {
            console.error('Change password error:', error);
            return responseHandler.error(res, 'Failed to change password', 500, error);
        }
    }

    async getMe(req, res) {
        try {
            return responseHandler.success(res, { user: req.user.toJSON() }, 'User information retrieved successfully');
        } catch (error) {
            console.error('Get user info error:', error);
            return responseHandler.error(res, 'Failed to get user information', 500, error);
        }
    }

}


module.exports = AuthController;
