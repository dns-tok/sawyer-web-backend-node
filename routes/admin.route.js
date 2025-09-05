const express = require("express");
const router = express.Router();
const { adminAuth } = require("../middleware/auth");
const AdminController = require("../controllers/admin.controller");
const validateRequest = require("../middleware/validation");
const {
  changeUserPasswordValidation,
  loginValidation,
  forgotPasswordValidation,
  changePasswordValidationAdmin,
} = require("../validators/authValidators");
const { default: rateLimit } = require("express-rate-limit");

const adminController = new AdminController();

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

const loginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500000, // limit each IP to 5 login attempts per windowMs
  message: {
    status: "error",
    message: "Too many login attempts, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotPasswordLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5, // 5 forgot-password requests per hour per IP
  message: "Too many password reset requests, please try again later.",
});

// Admin login with auto-creation of first admin
router.post(
  "/login",
  loginLimiter,
  loginValidation,
  validateRequest,
  adminController.login
);

// Admin refresh token endpoint
router.post("/refresh", adminController.refresh);

// Admin forgot password (only for admin accounts)
router.post(
  "/forgot-password",
  forgotPasswordLimiter,
  forgotPasswordValidation,
  validateRequest,
  adminController.forgotPassword
);

// Admin change password with first-time password change requirement
router.post(
  "/change-password",
  adminAuth,
  changePasswordValidationAdmin,
  validateRequest,
  adminController.changePassword
);

// Admin logout
router.post("/logout", adminAuth, adminController.logout.bind(adminController));

router.post(
  "/reset-user-password",
  adminAuth,
  changeUserPasswordValidation,
  validateRequest,
  adminController.changeUserPassword
);

router.get("/user/get-users", adminAuth, adminController.getAllUsers);

module.exports = router;
