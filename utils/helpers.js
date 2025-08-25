const crypto = require('crypto');

// Generate secure random strings
const generateSecret = (length = 64) => {
  return crypto.randomBytes(length).toString('hex');
};

// Generate encryption key
const generateEncryptionKey = (length = 32) => {
  return crypto.randomBytes(length).toString('base64').slice(0, length);
};

// Validate API key format
const validateApiKeyFormat = (apiKey, provider = 'openai') => {
  switch (provider) {
    case 'openai':
      return /^sk-[a-zA-Z0-9]{32,}$/.test(apiKey);
    default:
      return false;
  }
};

// Generate user avatar URL (using initials)
const generateAvatarUrl = (name) => {
  const initials = name
    .split(' ')
    .map(word => word.charAt(0).toUpperCase())
    .join('')
    .slice(0, 2);
    
  return `https://ui-avatars.com/api/?name=${initials}&background=random&color=fff&size=200`;
};

// Sanitize string for safe usage
const sanitizeString = (str) => {
  return str.replace(/[<>]/g, '');
};

// Parse user agent
const parseUserAgent = (userAgent) => {
  const browser = userAgent.match(/(Chrome|Firefox|Safari|Edge)\/[\d.]+/);
  const os = userAgent.match(/(Windows|Macintosh|Linux|Android|iOS)/);
  
  return {
    browser: browser ? browser[0] : 'Unknown',
    os: os ? os[0] : 'Unknown'
  };
};

// Format bytes to human readable
const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// Check if string is JSON
const isJSON = (str) => {
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
};

// Generate random color
const generateRandomColor = () => {
  return '#' + Math.floor(Math.random()*16777215).toString(16);
};

// Validate email format
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Generate slug from string
const generateSlug = (str) => {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

// Get time ago string
const timeAgo = (date) => {
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  
  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} days ago`;
  if (diffInSeconds < 31536000) return `${Math.floor(diffInSeconds / 2592000)} months ago`;
  return `${Math.floor(diffInSeconds / 31536000)} years ago`;
};

module.exports = {
  generateSecret,
  generateEncryptionKey,
  validateApiKeyFormat,
  generateAvatarUrl,
  sanitizeString,
  parseUserAgent,
  formatBytes,
  isJSON,
  generateRandomColor,
  isValidEmail,
  generateSlug,
  timeAgo
};
