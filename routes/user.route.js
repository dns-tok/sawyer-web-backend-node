const express = require('express');
const { auth } = require('../middleware/auth');
const validateRequest = require('../middleware/validation');
const { updateProfileValidation } = require('../validators/userValidators');
const UserController = require('../controllers/user.controller');

const router = express.Router();
const userController = new UserController();

// @route   GET /api/user/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', auth, userController.getProfile);

// @route   PUT /api/user/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', auth, updateProfileValidation, validateRequest, userController.updateProfile);

// @route   DELETE /api/user/account
// @desc    Delete user account
// @access  Private
router.delete('/account', auth, userController.deleteAccount);

// @route   GET /api/user/stats
// @desc    Get user statistics
// @access  Private
router.get('/stats', auth, userController.getStats);

module.exports = router;
