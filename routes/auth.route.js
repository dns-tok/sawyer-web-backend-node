const express = require('express');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const authService = require('../services/auth.service');
const validateRequest = require('../middleware/validation');
const {
  registerValidation,
  loginValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  changePasswordValidation,
  refreshTokenValidation
} = require('../validators/authValidators');
const { auth } = require('../middleware/auth');
const AuthController = require('../controllers/auth.controller');

const router = express.Router();
const authController = new AuthController();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    status: 'error',
    message: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 login attempts per windowMs
  message: {
    status: 'error',
    message: 'Too many login attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', authLimiter, registerValidation, validateRequest, authController.register);

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', loginLimiter, loginValidation, validateRequest, authController.login);

// @route   POST /api/auth/refresh
// @desc    Refresh access token
// @access  Public
router.post('/refresh', refreshTokenValidation, validateRequest, authController.refresh);

// @route   POST /api/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', auth, authController.logout);

// @route   POST /api/auth/logout-all
// @desc    Logout from all devices
// @access  Private
router.post('/logout-all', auth, authController.logoutFromAllDevices);

// @route   POST /api/auth/forgot-password
// @desc    Send password reset email
// @access  Public
router.post('/forgot-password', authLimiter, forgotPasswordValidation, validateRequest, authController.forgotPassword);

// @route   POST /api/auth/reset-password
// @desc    Reset password with token
// @access  Public
router.post('/reset-password', authLimiter, resetPasswordValidation, validateRequest, authController.resetPassword);

// @route   POST /api/auth/change-password
// @desc    Change password (when logged in)
// @access  Private
router.post('/change-password', auth, changePasswordValidation, validateRequest, authController.changePassword);

// @route   GET /api/auth/me
// @desc    Get current user info
// @access  Private
router.get('/me', auth, authController.getMe);

module.exports = router;
