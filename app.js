require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth.route');
const userRoutes = require('./routes/user.route');
// const apiKeysRoutes = require('./routes/apiKeys.route');
// const mcpRoutes = require('./routes/mcp');
// const chatRoutes = require('./routes/chat.route');

const errorHandler = require('./middleware/errorHandler');
const logger = require('./middleware/logger');
const responseHandler = require('./utils/response.handler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'X-Requested-With'],
  exposedHeaders: ['Content-Type', 'Cache-Control']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
// app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Custom middleware
app.use(logger);

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
// app.use('/api/notion', notionRoutes);
// app.use('/api/api-keys', apiKeysRoutes);
// app.use('/api/mcp', mcpRoutes);
// app.use('/api/chat', chatRoutes);
// app.use('/api/integrations', require('./routes/integrations'));
// app.use('/api/user-integrations', require('./routes/userIntegrations'));

// Error handling middleware (should be last)
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  responseHandler.notFound(res, 'Route not found');
});

// Database connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('Connected to MongoDB');
  app.listen(PORT, () => {
    console.log(`Sawyer.AI Backend is running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
  });
})
.catch((error) => {
  console.error('Database connection failed:', error);
  process.exit(1);
});

// Graceful shutdown
// process.on('SIGTERM', async () => {
//   console.log('SIGTERM received, shutting down gracefully');
  
  
//   // Close MongoDB connection
//   mongoose.connection.close(() => {
//     console.log('MongoDB connection closed');
//     process.exit(0);
//   });
// });

// process.on('SIGINT', async () => {
//   console.log('SIGINT received, shutting down gracefully');
// });

module.exports = app;
