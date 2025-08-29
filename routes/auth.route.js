// routes/auth.js
const express = require("express");
const rateLimit = require("express-rate-limit");
const validateRequest = require("../middleware/validation");
const {
  registerValidation,
  loginValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  changePasswordValidation,
  // refreshTokenValidation, // <-- removed: refresh will prefer cookie
} = require("../validators/authValidators");
const { auth } = require("../middleware/auth");
const AuthController = require("../controllers/auth.controller");

const router = express.Router();
const authController = new AuthController();

/**
 * IMPORTANT:
 * - Make sure your top-level app uses cookie-parser:
 *     const cookieParser = require('cookie-parser');
 *     app.use(cookieParser());
 */

// ---------------------
// Rate limiters (sensible production defaults)
// ---------------------
const createLimiter = (opts) =>
  rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    message: {
      status: "error",
      message: opts.message,
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

const registerLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10, // 10 registrations per 15 minutes per IP
  message: "Too many accounts created from this IP, please try again later.",
});

const loginLimiter = createLimiter({
  // windowMs: 15 * 60 * 1000,
  // max: 5,
  // message: "Too many login attempts, please try again later.",
});

const forgotPasswordLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5, // 5 forgot-password requests per hour per IP
  message: "Too many password reset requests, please try again later.",
});

const genericLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100, // generic fallback
  message: "Too many requests, please try again later.",
});

// ---------------------
// Routes
// ---------------------

// Register
router.post(
  "/register",
  registerLimiter,
  registerValidation,
  validateRequest,
  authController.register
);

// Verify email (token-based)
router.post("/verify-email", genericLimiter, authController.verifyEmail);

// Login
router.post(
  "/login",
  loginLimiter,
  loginValidation,
  validateRequest,
  authController.login
);

// Refresh tokens - public; prefers cookie but accepts body fallback.
// NOTE: We intentionally DO NOT require refreshTokenValidation here because we read cookie first.
router.post("/refresh", genericLimiter, authController.refresh);

// Logout (authenticated)
router.post("/logout", auth, authController.logout);

// Logout all devices (authenticated)
router.post("/logout-all", auth, authController.logoutFromAllDevices);

// Forgot password
router.post(
  "/forgot-password",
  forgotPasswordLimiter,
  forgotPasswordValidation,
  validateRequest,
  authController.forgotPassword
);

// Reset password
router.post(
  "/reset-password",
  genericLimiter,
  resetPasswordValidation,
  validateRequest,
  authController.resetPassword
);

// Change password (authenticated)
router.post(
  "/change-password",
  auth,
  changePasswordValidation,
  validateRequest,
  authController.changePassword
);

// Current user
router.get("/me", auth, authController.getMe);

router.post("/google", authController.googleAuth);

module.exports = router;
