# Swayer Backend API

A comprehensive Node.js/Express backend with authentication, Notion OAuth integration, and OpenAI API key management.

## Features

- **Authentication & Authorization**
  - JWT-based authentication with refresh tokens
  - Password hashing with bcrypt
  - Account lockout after failed login attempts
  - Password reset functionality
  - Role-based access control

- **Notion Integration**
  - OAuth 2.0 flow for Notion workspace connection
  - Secure token storage with encryption
  - Full Notion API access (read/write pages, search, etc.)
  - MCP (Model Context Protocol) server connection ready

- **OpenAI API Management**
  - Secure API key storage with encryption
  - Real-time API key verification
  - Usage tracking and monitoring
  - Model availability checking

- **Security Features**
  - Rate limiting on all endpoints
  - Input validation and sanitization
  - CORS protection
  - Helmet security headers
  - Request logging and monitoring

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- npm or yarn

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy environment file:
   ```bash
   cp .env.example .env
   ```

4. Configure environment variables in `.env`:
   - Database connection string
   - JWT secrets (generate strong random strings)
   - Notion OAuth credentials
   - Encryption key (32 characters)

## Environment Variables

### Required
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret for access tokens (generate with crypto.randomBytes(64).toString('hex'))
- `JWT_REFRESH_SECRET` - Secret for refresh tokens
- `ENCRYPTION_KEY` - 32-character key for encrypting API keys

### Notion OAuth
- `NOTION_CLIENT_ID` - Your Notion OAuth app client ID
- `NOTION_CLIENT_SECRET` - Your Notion OAuth app client secret
- `NOTION_REDIRECT_URI` - OAuth callback URL

### Optional
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)
- `FRONTEND_URL` - Frontend URL for CORS

## Setup Notion OAuth

1. Go to [Notion Developers](https://developers.notion.com/)
2. Create a new integration
3. Configure OAuth settings:
   - Redirect URI: `http://localhost:3000/api/notion/callback`
   - Capabilities: Read content, Insert content, Read user info
4. Copy Client ID and Client Secret to your `.env` file

## Running the Application

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

### Testing
```bash
npm test
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout user
- `POST /api/auth/logout-all` - Logout from all devices
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token
- `POST /api/auth/change-password` - Change password (authenticated)
- `GET /api/auth/me` - Get current user info

### User Management
- `GET /api/user/profile` - Get user profile
- `PUT /api/user/profile` - Update user profile
- `DELETE /api/user/account` - Deactivate account
- `GET /api/user/stats` - Get user statistics

### Notion Integration
- `GET /api/notion/auth-url` - Get OAuth authorization URL
- `POST /api/notion/callback` - Handle OAuth callback
- `GET /api/notion/integration` - Get integration status
- `DELETE /api/notion/integration` - Disconnect integration
- `GET /api/notion/test-connection` - Test connection
- `GET /api/notion/user-info` - Get Notion user info
- `POST /api/notion/search` - Search pages
- `GET /api/notion/pages/:pageId` - Get page
- `GET /api/notion/pages/:pageId/blocks` - Get page blocks
- `POST /api/notion/pages` - Create page
- `PATCH /api/notion/pages/:pageId` - Update page

### API Key Management
- `POST /api/api-keys` - Save OpenAI API key
- `GET /api/api-keys` - Get user's API keys
- `GET /api/api-keys/verify` - Verify API key
- `GET /api/api-keys/test-connection` - Test connection
- `DELETE /api/api-keys` - Delete API key
- `GET /api/api-keys/models` - Get available models
- `POST /api/api-keys/test-completion` - Test completion

## Security Considerations

1. **Environment Variables**: Never commit `.env` files to version control
2. **JWT Secrets**: Use cryptographically secure random strings
3. **Encryption Key**: Generate a strong 32-character key for API key encryption
4. **Rate Limiting**: Configured for auth endpoints to prevent brute force attacks
5. **Input Validation**: All inputs are validated and sanitized
6. **HTTPS**: Use HTTPS in production
7. **MongoDB**: Use MongoDB Atlas or properly secured MongoDB instance

## Error Handling

The API uses consistent error response format:
```json
{
  "status": "error",
  "message": "Error description",
  "errors": [] // For validation errors
}
```

## Success Response Format

```json
{
  "status": "success",
  "message": "Operation description",
  "data": {} // Response data
}
```

## Testing

Run the test suite:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

## Contributing

1. Follow the existing code style
2. Add tests for new features
3. Update documentation
4. Ensure all tests pass

## License

MIT License
