const { body, param } = require('express-validator');

const saveApiKeyValidation = [
  body('apiKey')
    .notEmpty()
    .withMessage('API key is required')
    .isLength({ min: 10 })
    .withMessage('API key appears to be too short')
    .matches(/^sk-[a-zA-Z0-9]+$/)
    .withMessage('Invalid OpenAI API key format. Must start with "sk-"'),
  
  body('keyName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Key name must be between 1 and 100 characters')
];

const updateApiKeyValidation = [
  param('keyId')
    .isMongoId()
    .withMessage('Invalid API key ID'),
  
  body('keyName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Key name must be between 1 and 100 characters'),
  
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean value')
];

const deleteApiKeyValidation = [
  param('keyId')
    .isMongoId()
    .withMessage('Invalid API key ID')
];

module.exports = {
  saveApiKeyValidation,
  updateApiKeyValidation,
  deleteApiKeyValidation
};
