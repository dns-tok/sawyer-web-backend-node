const User = require('../models/User');
const responseHandler = require('../utils/response.handler');

class UserController {

    async getProfile(req, res) {
        try {
            const user = await User.findById(req.user._id);

            if (!user) {
                return responseHandler.notFound(res, 'User not found');
            }

            return responseHandler.success(res, { user: user.toJSON() }, 'User profile retrieved successfully');
        } catch (error) {
            console.error('Get profile error:', error);
            return responseHandler.error(res, 'Failed to get user profile', 500, error);
        }
    }

    async updateProfile(req, res) {
        try {
            const { name, preferences } = req.body;
            const userId = req.user._id;

            const updateData = {};

            if (name) {
                updateData.name = name;
            }

            if (preferences) {
                if (preferences.notifications) {
                    if (preferences.notifications.email !== undefined) {
                        updateData['preferences.notifications.email'] = preferences.notifications.email;
                    }
                    if (preferences.notifications.push !== undefined) {
                        updateData['preferences.notifications.push'] = preferences.notifications.push;
                    }
                }

                if (preferences.theme) {
                    updateData['preferences.theme'] = preferences.theme;
                }
            }

            const user = await User.findByIdAndUpdate(
                userId,
                { $set: updateData },
                { new: true, runValidators: true }
            );

            if (!user) {
                return responseHandler.notFound(res, 'User not found');
            }

            return responseHandler.success(res, { user: user.toJSON() }, 'Profile updated successfully');
        } catch (error) {
            console.error('Update profile error:', error);
            return responseHandler.error(res, 'Failed to update profile', 500, error);
        }
    }

    async deleteAccount(req, res) {
        try {
            const userId = req.user._id;

            // Soft delete - deactivate the account
            const user = await User.findByIdAndUpdate(
                userId,
                {
                    isActive: false,
                    refreshTokens: [] // Clear all refresh tokens
                },
                { new: true }
            );

            if (!user) {
                return responseHandler.notFound(res, 'User not found');
            }

            return responseHandler.success(res, null, 'Account deactivated successfully');
        } catch (error) {
            console.error('Delete account error:', error);
            return responseHandler.error(res, 'Failed to delete account', 500, error);
        }
    }

    async getStats(req, res) {
        try {
            const userId = req.user._id;

            // Get various counts and statistics
            const NotionIntegration = require('../models/NotionIntegration');
            const ApiKey = require('../models/ApiKey');

            const [notionIntegrations, apiKeys] = await Promise.all([
                NotionIntegration.countDocuments({ userId, isActive: true }),
                ApiKey.countDocuments({ userId, isActive: true })
            ]);

            // Get user join date and last login
            const user = await User.findById(userId).select('createdAt lastLogin');

            const stats = {
                accountCreated: user.createdAt,
                lastLogin: user.lastLogin,
                integrations: {
                    notion: notionIntegrations,
                    total: notionIntegrations
                },
                apiKeys: {
                    openai: apiKeys,
                    total: apiKeys
                }
            };

            return responseHandler.success(res, { stats }, 'User statistics retrieved successfully');
        } catch (error) {
            console.error('Get stats error:', error);
            return responseHandler.error(res, 'Failed to get user statistics', 500, error);
        }
    }
}

module.exports = UserController;