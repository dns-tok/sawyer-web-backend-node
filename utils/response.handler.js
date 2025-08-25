class ResponseHandler {
  constructor() {
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'X-Powered-By': 'Sawyer.AI'
    };
  }

  /**
   * Set default headers for all responses
   * @param {Object} headers - Headers object
   */
  setDefaultHeaders(headers) {
    this.defaultHeaders = { ...this.defaultHeaders, ...headers };
  }

  /**
   * Apply default headers to response
   * @param {Object} res - Express response object
   * @param {Object} customHeaders - Additional headers
   */
  applyHeaders(res, customHeaders = {}) {
    const headers = { ...this.defaultHeaders, ...customHeaders };
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
  }

  /**
   * Send success response
   * @param {Object} res - Express response object
   * @param {*} data - Response data
   * @param {string} message - Success message
   * @param {number} statusCode - HTTP status code
   * @param {Object} headers - Additional headers
   */
  success(res, data = null, message = 'Success', statusCode = 200, headers = {}) {
    this.applyHeaders(res, headers);
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Send error response
   * @param {Object} res - Express response object
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   * @param {*} error - Error details
   * @param {Object} headers - Additional headers
   */
  error(res, message = 'Internal Server Error', statusCode = 500, error = null, headers = {}) {
    this.applyHeaders(res, headers);
    const response = {
      success: false,
      message,
      timestamp: new Date().toISOString()
    };

    // Only include error details in development
    if (process.env.NODE_ENV === 'development' && error) {
      response.error = error;
    }

    return res.status(statusCode).json(response);
  }

  /**
   * Send validation error response
   * @param {Object} res - Express response object
   * @param {Array|Object} errors - Validation errors
   * @param {string} message - Error message
   */
  validationError(res, errors, message = 'Validation failed') {
    this.applyHeaders(res);
    return res.status(400).json({
      success: false,
      message,
      errors,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Send unauthorized response
   * @param {Object} res - Express response object
   * @param {string} message - Error message
   */
  unauthorized(res, message = 'Unauthorized access') {
    return this.error(res, message, 401);
  }

  /**
   * Send forbidden response
   * @param {Object} res - Express response object
   * @param {string} message - Error message
   */
  forbidden(res, message = 'Access forbidden') {
    return this.error(res, message, 403);
  }

  /**
   * Send not found response
   * @param {Object} res - Express response object
   * @param {string} message - Error message
   */
  notFound(res, message = 'Resource not found') {
    return this.error(res, message, 404);
  }

  /**
   * Send method not allowed response
   * @param {Object} res - Express response object
   * @param {Array} allowedMethods - Array of allowed methods
   */
  methodNotAllowed(res, allowedMethods = []) {
    const headers = allowedMethods.length > 0 ? { 'Allow': allowedMethods.join(', ') } : {};
    return this.error(res, 'Method not allowed', 405, null, headers);
  }

  /**
   * Send conflict response
   * @param {Object} res - Express response object
   * @param {string} message - Error message
   */
  conflict(res, message = 'Conflict occurred') {
    return this.error(res, message, 409);
  }

  /**
   * Send too many requests response
   * @param {Object} res - Express response object
   * @param {string} message - Error message
   * @param {number} retryAfter - Retry after seconds
   */
  tooManyRequests(res, message = 'Too many requests', retryAfter = null) {
    const headers = retryAfter ? { 'Retry-After': retryAfter.toString() } : {};
    return this.error(res, message, 429, null, headers);
  }

  /**
   * Send created response
   * @param {Object} res - Express response object
   * @param {*} data - Created resource data
   * @param {string} message - Success message
   * @param {string} location - Location header value
   */
  created(res, data = null, message = 'Resource created successfully', location = null) {
    const headers = location ? { 'Location': location } : {};
    return this.success(res, data, message, 201, headers);
  }

  /**
   * Send no content response
   * @param {Object} res - Express response object
   */
  noContent(res) {
    this.applyHeaders(res);
    return res.status(204).send();
  }

  /**
   * Send accepted response
   * @param {Object} res - Express response object
   * @param {*} data - Response data
   * @param {string} message - Success message
   */
  accepted(res, data = null, message = 'Request accepted') {
    return this.success(res, data, message, 202);
  }

  /**
   * Send paginated response
   * @param {Object} res - Express response object
   * @param {Array} data - Array of items
   * @param {number} page - Current page
   * @param {number} limit - Items per page
   * @param {number} total - Total number of items
   * @param {string} message - Success message
   */
  paginated(res, data, page, limit, total, message = 'Data retrieved successfully') {
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return this.success(res, {
      items: data,
      pagination: {
        currentPage: page,
        limit,
        totalItems: total,
        totalPages,
        hasNext,
        hasPrev
      }
    }, message);
  }

  /**
   * Handle async route errors
   * @param {Function} fn - Async function
   */
  asyncHandler(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  /**
   * Send file download response
   * @param {Object} res - Express response object
   * @param {string} filePath - Path to file
   * @param {string} filename - Download filename
   * @param {string} contentType - Content type
   */
  download(res, filePath, filename = null, contentType = 'application/octet-stream') {
    const headers = {
      'Content-Type': contentType,
      'Content-Disposition': `attachment${filename ? `; filename="${filename}"` : ''}`
    };
    this.applyHeaders(res, headers);
    return res.sendFile(filePath);
  }

  /**
   * Send streaming response
   * @param {Object} res - Express response object
   * @param {Stream} stream - Readable stream
   * @param {string} contentType - Content type
   */
  stream(res, stream, contentType = 'application/octet-stream') {
    this.applyHeaders(res, { 'Content-Type': contentType });
    return stream.pipe(res);
  }

  /**
   * Send custom response
   * @param {Object} res - Express response object
   * @param {number} statusCode - HTTP status code
   * @param {*} data - Response data
   * @param {Object} headers - Additional headers
   */
  custom(res, statusCode, data, headers = {}) {
    this.applyHeaders(res, headers);
    return res.status(statusCode).json(data);
  }
}


module.exports = new ResponseHandler();
