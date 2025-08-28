const multer = require('multer');
const path = require('path');
const fs = require('fs');
const responseHandler = require('../utils/response.handler');

// Ensure upload directories exist
const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Upload directory structure
const uploadDirs = {
  general: path.join(__dirname, '../uploads/files')
};

// Ensure directories exist
Object.values(uploadDirs).forEach(ensureDirectoryExists);

// File type configurations - easily extensible
const FILE_CONFIGS = {
  icon: {
    allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/svg+xml', 'image/webp'],
    maxCount: 1,
    maxSize: 5 * 1024 * 1024, // 5MB for images
    errorMessage: 'Icon must be an image file (PNG, JPG, JPEG, GIF, SVG, WebP)'
  },
  project_attachment: {
    allowedTypes: ['application/pdf'],
    maxCount: 10,
    maxSize: 10 * 1024 * 1024, // 10MB for PDFs
    errorMessage: 'Project attachments must be PDF files only'
  },
  avatar: {
    allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
    maxCount: 1,
    maxSize: 3 * 1024 * 1024, // 3MB for avatars
    errorMessage: 'Avatar must be an image file (PNG, JPG, JPEG, GIF, WebP)'
  }
  // Add more file types here as needed
  // example: {
  //   allowedTypes: ['image/jpeg', 'application/pdf'],
  //   maxCount: 5,
  //   maxSize: 15 * 1024 * 1024,
  //   errorMessage: 'Custom error message'
  // }
};

// Dynamic storage configuration
const dynamicStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDirs.general);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, `${file.fieldname}_${baseName}_${uniqueSuffix}${ext}`);
  }
});

// Dynamic file filter based on field configurations
const dynamicFileFilter = (req, file, cb) => {
  const config = FILE_CONFIGS[file.fieldname];
  
  if (!config) {
    return cb(new Error(`Upload field '${file.fieldname}' is not supported`), false);
  }
  
  if (!config.allowedTypes.includes(file.mimetype)) {
    return cb(new Error(config.errorMessage), false);
  }
  
  cb(null, true);
};

// Get maximum file size for all configured types
const getMaxFileSize = () => {
  return Math.max(...Object.values(FILE_CONFIGS).map(config => config.maxSize));
};

// Get total max count for all configured types
const getTotalMaxCount = () => {
  return Object.values(FILE_CONFIGS).reduce((sum, config) => sum + config.maxCount, 0);
};

// Main multer configuration
const upload = multer({
  storage: dynamicStorage,
  fileFilter: dynamicFileFilter,
  limits: {
    fileSize: getMaxFileSize(),
    files: getTotalMaxCount()
  }
});

// Create fields array for multer from FILE_CONFIGS
const createUploadFields = () => {
  return Object.keys(FILE_CONFIGS).map(fieldName => ({
    name: fieldName,
    maxCount: FILE_CONFIGS[fieldName].maxCount
  }));
};

// Main upload middleware
const uploadFiles = upload.fields(createUploadFields());

// Enhanced error handling middleware
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        const maxSizeMB = Math.max(...Object.values(FILE_CONFIGS).map(c => c.maxSize)) / (1024 * 1024);
        return responseHandler.error(res, `File size too large. Maximum size is ${maxSizeMB}MB per file.`, 400);
      case 'LIMIT_FILE_COUNT':
        return responseHandler.error(res, 'Too many files uploaded.', 400);
      case 'LIMIT_UNEXPECTED_FILE':
        const supportedFields = Object.keys(FILE_CONFIGS).join(', ');
        return responseHandler.error(res, `Unexpected file field. Supported fields: ${supportedFields}`, 400);
      default:
        return responseHandler.error(res, `Upload error: ${error.message}`, 400);
    }
  } else if (error) {
    return responseHandler.error(res, error.message, 400);
  }
  next();
};

// Utility function to delete file
const deleteFile = async (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
};

// Middleware to clean up uploaded files on error
const cleanupOnError = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    if (res.statusCode >= 400 && req.files) {
      Object.values(req.files).flat().forEach(file => {
        if (file && file.path) {
          deleteFile(file.path).catch(err => 
            console.error('Failed to cleanup uploaded file:', err)
          );
        }
      });
    }
    originalSend.call(this, data);
  };
  
  next();
};

module.exports = {
  uploadFiles,
  handleUploadError,
  deleteFile,
  cleanupOnError,
  uploadDirs,
  FILE_CONFIGS
};
