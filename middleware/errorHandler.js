const responseHandler = require('../utils/response.handler');

const errorHandler = (err, req, res, next) => {
  console.error('Error Stack:', err.stack);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(val => ({
      field: val.path,
      message: val.message
    }));

    return responseHandler.validationError(res, errors, 'Validation failed');
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const value = err.keyValue[field];

    return responseHandler.conflict(res, `${field} '${value}' already exists`);
  }

  // Mongoose cast error
  if (err.name === 'CastError') {
    return responseHandler.error(res, 'Invalid ID format', 400);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return responseHandler.unauthorized(res, 'Invalid token');
  }

  if (err.name === 'TokenExpiredError') {
    return responseHandler.unauthorized(res, 'Token expired');
  }

  // Multer errors (file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return responseHandler.error(res, 'File size too large', 400);
  }

  // Rate limit errors
  if (err.status === 429) {
    return responseHandler.tooManyRequests(res, 'Too many requests, please try again later');
  }

  // Custom API errors
  if (err.statusCode) {
    return responseHandler.error(res, err.message || 'An error occurred', err.statusCode);
  }

  // Default server error
  const statusCode = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message || 'Something went wrong';

  return responseHandler.error(res, message, statusCode, process.env.NODE_ENV === 'development' ? err : null);
};

module.exports = errorHandler;
