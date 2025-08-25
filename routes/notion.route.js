const express = require('express');
const { auth } = require('../middleware/auth');
const notionService = require('../services/notionService');

const router = express.Router();

// @route   GET /api/notion/auth-url
// @desc    Get Notion OAuth authorization URL
// @access  Private
router.get('/auth-url', auth, async (req, res) => {
  try {
    const state = req.user._id.toString(); // Use user ID as state for verification
    const authUrl = notionService.generateAuthUrl(state);

    res.json({
      status: 'success',
      data: {
        authUrl,
        state
      }
    });
  } catch (error) {
    console.error('Generate auth URL error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to generate authorization URL'
    });
  }
});

// @route   POST /api/notion/callback
// @desc    Handle Notion OAuth callback
// @access  Public (but validates state)
router.post('/callback', async (req, res) => {
  try {
    const { code, state } = req.body;

    if (!code) {
      return res.status(400).json({
        status: 'error',
        message: 'Authorization code is required'
      });
    }

    if (!state) {
      return res.status(400).json({
        status: 'error',
        message: 'State parameter is required'
      });
    }

    // Exchange code for tokens
    const tokenData = await notionService.exchangeCodeForToken(code);

    // Save integration
    const integration = await notionService.saveIntegration(state, tokenData);

    res.json({
      status: 'success',
      message: 'Notion integration connected successfully',
      data: {
        integration
      }
    });
  } catch (error) {
    console.error('Notion callback error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to connect Notion integration'
    });
  }
});

// @route   GET /api/notion/integration
// @desc    Get user's Notion integration status
// @access  Private
router.get('/integration', auth, async (req, res) => {
  try {
    const integration = await notionService.getUserIntegration(req.user._id);

    if (!integration) {
      return res.json({
        status: 'success',
        data: {
          connected: false,
          integration: null
        }
      });
    }

    res.json({
      status: 'success',
      data: {
        connected: true,
        integration
      }
    });
  } catch (error) {
    console.error('Get integration error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get integration status'
    });
  }
});

// @route   DELETE /api/notion/integration
// @desc    Disconnect Notion integration
// @access  Private
router.delete('/integration', auth, async (req, res) => {
  try {
    await notionService.disconnectIntegration(req.user._id);

    res.json({
      status: 'success',
      message: 'Notion integration disconnected successfully'
    });
  } catch (error) {
    console.error('Disconnect integration error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to disconnect integration'
    });
  }
});

// @route   GET /api/notion/test-connection
// @desc    Test Notion integration connection
// @access  Private
router.get('/test-connection', auth, async (req, res) => {
  try {
    const result = await notionService.testConnection(req.user._id);

    res.json({
      status: 'success',
      data: result
    });
  } catch (error) {
    console.error('Test connection error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to test connection'
    });
  }
});

// @route   GET /api/notion/user-info
// @desc    Get user info from Notion
// @access  Private
router.get('/user-info', auth, async (req, res) => {
  try {
    const userInfo = await notionService.getUserInfo(req.user._id);

    res.json({
      status: 'success',
      data: {
        user: userInfo
      }
    });
  } catch (error) {
    console.error('Get user info error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to get user info from Notion'
    });
  }
});

// @route   POST /api/notion/search
// @desc    Search pages in Notion workspace
// @access  Private
router.post('/search', auth, async (req, res) => {
  try {
    const { query = '', pageSize = 50 } = req.body;

    const results = await notionService.searchPages(req.user._id, query, pageSize);

    res.json({
      status: 'success',
      data: results
    });
  } catch (error) {
    console.error('Search pages error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to search pages'
    });
  }
});

// @route   GET /api/notion/pages/:pageId
// @desc    Get specific page from Notion
// @access  Private
router.get('/pages/:pageId', auth, async (req, res) => {
  try {
    const { pageId } = req.params;

    if (!pageId) {
      return res.status(400).json({
        status: 'error',
        message: 'Page ID is required'
      });
    }

    const page = await notionService.getPage(req.user._id, pageId);

    res.json({
      status: 'success',
      data: {
        page
      }
    });
  } catch (error) {
    console.error('Get page error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to get page'
    });
  }
});

// @route   GET /api/notion/pages/:pageId/blocks
// @desc    Get blocks (content) of a specific page
// @access  Private
router.get('/pages/:pageId/blocks', auth, async (req, res) => {
  try {
    const { pageId } = req.params;

    if (!pageId) {
      return res.status(400).json({
        status: 'error',
        message: 'Page ID is required'
      });
    }

    const blocks = await notionService.getPageBlocks(req.user._id, pageId);

    res.json({
      status: 'success',
      data: blocks
    });
  } catch (error) {
    console.error('Get page blocks error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to get page blocks'
    });
  }
});

// @route   POST /api/notion/pages
// @desc    Create a new page in Notion
// @access  Private
router.post('/pages', auth, async (req, res) => {
  try {
    const pageData = req.body;

    if (!pageData) {
      return res.status(400).json({
        status: 'error',
        message: 'Page data is required'
      });
    }

    const page = await notionService.createPage(req.user._id, pageData);

    res.status(201).json({
      status: 'success',
      message: 'Page created successfully',
      data: {
        page
      }
    });
  } catch (error) {
    console.error('Create page error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create page'
    });
  }
});

// @route   PATCH /api/notion/pages/:pageId
// @desc    Update a page in Notion
// @access  Private
router.patch('/pages/:pageId', auth, async (req, res) => {
  try {
    const { pageId } = req.params;
    const updateData = req.body;

    if (!pageId) {
      return res.status(400).json({
        status: 'error',
        message: 'Page ID is required'
      });
    }

    if (!updateData) {
      return res.status(400).json({
        status: 'error',
        message: 'Update data is required'
      });
    }

    const page = await notionService.updatePage(req.user._id, pageId, updateData);

    res.json({
      status: 'success',
      message: 'Page updated successfully',
      data: {
        page
      }
    });
  } catch (error) {
    console.error('Update page error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update page'
    });
  }
});

module.exports = router;
