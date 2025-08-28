const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { uploadFiles, handleUploadError, cleanupOnError } = require('../middleware/upload');
const UploadController = require('../controllers/upload.controller');

const uploadController = new UploadController();

/**
 * @route   POST /api/upload
 * @desc    Upload files with specific field validation
 * @fields  icon (images only), project_attachment (PDFs only), avatar (images only)
 * @access  Private
 */
router.post('/', 
  auth,
  cleanupOnError,
  uploadFiles,
  handleUploadError,
  (req, res) => uploadController.uploadFiles(req, res)
);

module.exports = router;