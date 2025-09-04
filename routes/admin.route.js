const express = require("express");
const router = express.Router();
const { adminAuth } = require("../middleware/auth");
const AdminController = require("../controllers/admin.controller");
const validateRequest = require("../middleware/validation");
const { changePasswordValidation } = require("../validators/authValidators");

const adminController = new AdminController();

// Admin login with auto-creation of first admin
router.post("/login", validateRequest, adminController.login);

// Admin refresh token endpoint
router.post("/refresh", adminController.refresh);

// Admin forgot password (only for admin accounts)
router.post(
  "/forgot-password",
  validateRequest,
  adminController.forgotPassword
);

// Admin change password with first-time password change requirement
router.post(
  "/change-password",
  adminAuth,
  changePasswordValidation,
  validateRequest,
  adminController.changePassword
);

// Admin logout
router.post("/logout", adminAuth, adminController.logout.bind(adminController));

router.post(
  "/reset-user-password",
  adminAuth,
  adminController.changeUserPassword
);

module.exports = router;
