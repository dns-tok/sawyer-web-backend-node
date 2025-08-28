# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Running the Application
- `npm run dev` - Start development server with nodemon auto-reload
- `npm start` - Start production server
- `npm run setup` - Run initial setup script

### Testing
- `npm test` - Run Jest test suite
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report

### Code Quality
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Run ESLint with auto-fix

## Architecture Overview

This is a Node.js/Express REST API backend for Sawyer.AI, an intelligent agent platform. The application follows a modular MVC pattern with clear separation of concerns.

### Core Structure
- **app.js** - Main Express application setup with middleware configuration
- **config/** - Database and encryption configuration
- **routes/** - Express route handlers (auth, users, integrations, projects, API keys)
- **controllers/** - Business logic for handling requests
- **services/** - External API integrations (OAuth, GitHub, Jira, OpenAI)
- **models/** - Mongoose MongoDB schemas
- **middleware/** - Custom middleware (auth, validation, error handling, logging)
- **utils/** - Helper functions and response handlers
- **validators/** - Input validation schemas using Joi

### Key Features
- JWT-based authentication with refresh tokens
- OAuth integrations (Notion, GitHub, Jira)
- OpenAI API key management with encryption
- Project management system
- MCP (Model Context Protocol) server support
- File upload handling for project assets

### Database
- MongoDB with Mongoose ODM
- Models include User, Project, ApiKey, UserIntegration, NotionIntegration, Chat, MCPServerConfig
- Connection configured in config/database.js

### Security Implementation
- API key encryption using AES-256-GCM (config/encryption.js)
- Rate limiting (configurable, currently disabled in app.js:42)
- Input validation and sanitization
- CORS with wildcard origin (configured for development)
- Helmet security headers
- Request logging middleware

### Integration Services
- **oauth.service.js** - Generic OAuth 2.0 flow implementation
- **github.service.js** - GitHub API integration
- **jira.service.js** - Jira API integration  
- **notion.service.js** - Notion API operations
- **openai.service.js** - OpenAI API interactions

### Testing Setup
- Jest configuration in jest.config.js
- Test files in tests/ directory
- Setup file: tests/setup.js
- Coverage reporting enabled for routes, services, middleware, models

## Environment Configuration

Required environment variables (see README.md for full list):
- `MONGODB_URI` - Database connection
- `JWT_SECRET` / `JWT_REFRESH_SECRET` - Authentication secrets
- `ENCRYPTION_KEY` - 32-character key for API key encryption
- OAuth credentials for various integrations

## Common Development Patterns

### Error Handling
- Centralized error handling in middleware/errorHandler.js
- Consistent response format using utils/response.handler.js
- Success/error responses follow standardized JSON structure

### Route Structure
Routes follow RESTful conventions with middleware chains:
1. Input validation (validators/)
2. Authentication (middleware/auth.js)
3. Controller logic
4. Response formatting

### Service Layer
External API integrations are abstracted into service classes with consistent error handling and token management.

### File Uploads
Handled by middleware/upload.js using multer, with organized storage in uploads/ directory by type (projects, user avatars).