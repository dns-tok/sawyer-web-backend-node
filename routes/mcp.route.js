const express = require('express');
const { auth } = require('../middleware/auth');
const mcpNotionServer = require('../mcp/notionServer');

const router = express.Router();

// @route   POST /api/mcp/initialize
// @desc    Initialize MCP server
// @access  Private
router.post('/initialize', auth, async (req, res) => {
  try {
    const result = await mcpNotionServer.initialize();
    
    res.json({
      status: 'success',
      data: result
    });
  } catch (error) {
    console.error('MCP initialize error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to initialize MCP server'
    });
  }
});

// @route   GET /api/mcp/tools
// @desc    List available MCP tools
// @access  Private
router.get('/tools', auth, async (req, res) => {
  try {
    const result = await mcpNotionServer.listTools();
    
    res.json({
      status: 'success',
      data: result
    });
  } catch (error) {
    console.error('MCP list tools error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to list tools'
    });
  }
});

// @route   POST /api/mcp/tools/call
// @desc    Call an MCP tool
// @access  Private
router.post('/tools/call', auth, async (req, res) => {
  try {
    const { name, arguments: args } = req.body;
    
    if (!name) {
      return res.status(400).json({
        status: 'error',
        message: 'Tool name is required'
      });
    }

    const result = await mcpNotionServer.callTool(name, args || {}, req.user._id);
    
    res.json({
      status: 'success',
      data: result
    });
  } catch (error) {
    console.error('MCP call tool error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to call tool'
    });
  }
});

// @route   GET /api/mcp/resources
// @desc    List available MCP resources
// @access  Private
router.get('/resources', auth, async (req, res) => {
  try {
    const result = await mcpNotionServer.listResources();
    
    res.json({
      status: 'success',
      data: result
    });
  } catch (error) {
    console.error('MCP list resources error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to list resources'
    });
  }
});

// @route   GET /api/mcp/resources/read
// @desc    Read an MCP resource
// @access  Private
router.get('/resources/read', auth, async (req, res) => {
  try {
    const { uri } = req.query;
    
    if (!uri) {
      return res.status(400).json({
        status: 'error',
        message: 'Resource URI is required'
      });
    }

    const result = await mcpNotionServer.readResource(uri, req.user._id);
    
    res.json({
      status: 'success',
      data: result
    });
  } catch (error) {
    console.error('MCP read resource error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to read resource'
    });
  }
});

module.exports = router;
