const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const validateRequest = require('../middleware/validation');
const { body, param, query } = require('express-validator');
const ProjectController = require('../controllers/project.controller');

const projectController = new ProjectController();

// Validation rules
const createProjectValidation = [
  body('name')
    .notEmpty()
    .withMessage('Project name is required')
    .isLength({ max: 100 })
    .withMessage('Project name cannot exceed 100 characters')
    .trim(),
  body('description')
    .optional()
    .isLength({ max: 2500 })
    .withMessage('Agent description cannot exceed 500 words (approximately 2500 characters)')
    .trim(),
  // Custom validation: require either description or attachments
  body().custom((value, { req }) => {
    const hasDescription = req.body.description && req.body.description.trim().length > 0;
    const hasAttachments = req.body.attachments && Array.isArray(req.body.attachments) && req.body.attachments.length > 0;
    
    if (!hasDescription && !hasAttachments) {
      throw new Error('Provide either the description or a PDF attachment');
    }
    return true;
  }),
  body('status')
    .optional()
    .isIn(['active', 'archived'])
    .withMessage('Status must be one of: active, archived'),
  body('mcpResources')
    .optional()
    .isObject()
    .withMessage('MCP resources must be an object'),
  body('mcpResources.notion')
    .optional()
    .isObject()
    .withMessage('Notion MCP resource must be an object'),
  body('mcpResources.github')
    .optional()
    .isObject()
    .withMessage('GitHub MCP resource must be an object'),
  body('mcpResources.jira')
    .optional()
    .isObject()
    .withMessage('Jira MCP resource must be an object'),
  body('icon')
    .optional()
    .isObject()
    .withMessage('Icon must be an object with file information'),
  body('attachments')
    .optional()
    .isArray()
    .withMessage('Attachments must be an array of file objects'),
  body('attachments.*.mimetype')
    .optional()
    .equals('application/pdf')
    .withMessage('All attachments must be PDF files')
];

const updateProjectValidation = [
  param('projectId')
    .isMongoId()
    .withMessage('Invalid project ID'),
  body('name')
    .optional()
    .notEmpty()
    .withMessage('Project name cannot be empty')
    .isLength({ max: 100 })
    .withMessage('Project name cannot exceed 100 characters')
    .trim(),
  body('description')
    .optional()
    .isLength({ max: 2500 })
    .withMessage('Agent description cannot exceed 500 words (approximately 2500 characters)')
    .trim(),
  body('status')
    .optional()
    .isIn(['active', 'archived'])
    .withMessage('Status must be one of: active, archived'),
  body('mcpResources')
    .optional()
    .isObject()
    .withMessage('MCP resources must be an object'),
  body('icon')
    .optional()
    .isObject()
    .withMessage('Icon must be an object with file information'),
  body('attachments')
    .optional()
    .isArray()
    .withMessage('Attachments must be an array of file objects'),
  body('attachments.*.mimetype')
    .optional()
    .equals('application/pdf')
    .withMessage('All attachments must be PDF files')
];

const projectIdValidation = [
  param('projectId')
    .isMongoId()
    .withMessage('Invalid project ID')
];


const queryValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('status')
    .optional()
    .isIn(['active', 'archived'])
    .withMessage('Status must be one of: active, archived'),
  query('sortBy')
    .optional()
    .isIn(['name', 'createdAt', 'updatedAt', 'status'])
    .withMessage('SortBy must be one of: name, createdAt, updatedAt, status'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('SortOrder must be either asc or desc')
];


/**
 * @route   POST /api/projects
 * @desc    Create a new project (JSON API with file paths)
 * @access  Private
 */
router.post('/', 
  auth, 
  createProjectValidation, 
  validateRequest, 
  projectController.createProject
);

/**
 * @route   GET /api/projects
 * @desc    Get all projects for the authenticated user
 * @access  Private
 */
router.get('/', 
  auth, 
  queryValidation, 
  validateRequest, 
  projectController.getProjects
);

/**
 * @route   GET /api/projects/:projectId
 * @desc    Get a specific project by ID
 * @access  Private
 */
router.get('/:projectId', 
  auth, 
  projectIdValidation, 
  validateRequest, 
  projectController.getProject
);

/**
 * @route   PUT /api/projects/:projectId
 * @desc    Update a project (JSON API with file paths)
 * @access  Private
 */
router.put('/:projectId', 
  auth, 
  updateProjectValidation, 
  validateRequest, 
  projectController.updateProject
);

/**
 * @route   DELETE /api/projects/:projectId
 * @desc    Delete a project (soft delete)
 * @access  Private
 */
router.delete('/:projectId', 
  auth, 
  projectIdValidation, 
  validateRequest, 
  projectController.deleteProject
);

/**
 * @route   DELETE /api/projects/:projectId/attachments/:attachmentId
 * @desc    Remove an attachment from a project
 * @access  Private
 */
router.delete('/:projectId/attachments/:attachmentId', 
  auth, 
  [
    param('projectId').isMongoId().withMessage('Invalid project ID'),
    param('attachmentId').isMongoId().withMessage('Invalid attachment ID')
  ], 
  validateRequest, 
  projectController.removeAttachment
);



/**
 * @route   GET /api/projects/:projectId/resources
 * @desc    Get all resources for a project
 * @access  Private
 */
router.get('/:projectId/resources',
  auth,
  projectIdValidation,
  validateRequest,
  projectController.getProjectResources
);

/**
 * @route   GET /api/projects/:projectId/resources/:service
 * @desc    Get resources for a specific service in a project
 * @access  Private
 */
router.get('/:projectId/resources/:service',
  auth,
  [
    param('projectId').isMongoId().withMessage('Invalid project ID'),
    param('service').isIn(['notion', 'github', 'jira']).withMessage('Invalid service')
  ],
  validateRequest,
  projectController.getProjectResourcesByService
);


/**
 * @route   GET /api/projects/available-resources/:service
 * @desc    Get available resources from user integrations for project selection
 * @access  Private
 */
router.get('/available-resources/:service',
  auth,
  [
    param('service').isIn(['notion', 'github', 'jira']).withMessage('Invalid service'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],
  validateRequest,
  projectController.getAvailableResources
);

module.exports = router;
