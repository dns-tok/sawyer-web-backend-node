const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');
const { auth } = require('../middleware/auth');
const responseHandler = require('../utils/response.handler');
const openaiService = require('../services/openai.service');
const agentService = require('../services/agent.service');
const { body, validationResult } = require('express-validator');





// Stream messages to a chat (for real-time responses)
router.post('/stream', [
  auth,
  body('message').notEmpty().trim(),
], async (req, res) => {
  // Set CORS headers first, before any other processing
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:5173');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control, X-Requested-With');
  
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { message } = req.body;
    const user = req.user;

    // Set up Server-Sent Events headers (CORS already set above)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Disable nginx buffering for streaming
    });

    try {
      // Get user's OpenAI API key
      const ApiKey = require('../models/ApiKey');
      const encryptionService = require('../services/encryption.service');
      
      const apiKeyDoc = await ApiKey.findOne({ 
        userId: user._id, 
        provider: 'openai', 
        isActive: true 
      }).select('+encryptedApiKey');

      if (!apiKeyDoc) {
        res.write(`data: ${JSON.stringify({
          type: 'error',
          message: 'No OpenAI API key found. Please add your OpenAI API key first.'
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        return res.end();
      }

      // Decrypt the API key
      const openaiApiKey = encryptionService.decrypt(apiKeyDoc.encryptedApiKey);

      // Use OpenAI API directly for streaming
      const { ChatOpenAI } = require('@langchain/openai');
      
      const model = new ChatOpenAI({
        openAIApiKey: openaiApiKey,
        modelName: 'gpt-3.5-turbo',
        streaming: true,
        temperature: 0.7,
      });

      // System prompt for Sawyer
      const systemPrompt = `You are Sawyer, an intelligent AI assistant designed to help users with their projects and tasks. You are knowledgeable, helpful, and always aim to provide clear and actionable responses. You have access to various integrations and tools to assist users in their workflow. Be concise but thorough in your responses.`;

      // Stream the response
      const stream = await model.stream([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ]);

      for await (const chunk of stream) {
        const content = chunk.content;
        if (content) {
          res.write(`data: ${JSON.stringify({
            type: 'token',
            content: content
          })}\n\n`);
        }
      }

    } catch (streamError) {
      console.error('Streaming error:', streamError);
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: 'Failed to generate streaming response'
      })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('Error in streaming endpoint:', error);
    
    // Handle authentication errors
    if (error.message && error.message.includes('token')) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication failed'
      });
    }
    
    if (!res.headersSent) {
      res.status(500).json({
        status: 'error',
        message: 'Failed to process streaming request'
      });
    }
  }
});



// Get all chats for the authenticated user
router.get('/', auth, async (req, res) => {
  try {
    const chats = await Chat.findByUserId(req.user._id, {
      select: 'title selectedModel createdAt updatedAt messageCount lastMessage'
    });

    return responseHandler.success(res, {
      chats: chats.map(chat => ({
        _id: chat._id,
        title: chat.title,
        selectedModel: chat.selectedModel,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        messageCount: chat.messageCount,
        lastMessage: chat.lastMessage
      }))
    }, 'Chats retrieved successfully');
  } catch (error) {
    console.error('Error fetching chats:', error);
    return responseHandler.error(res, 'Failed to fetch chats', 500, error);
  }
});

// Get a specific chat by ID
router.get('/:chatId', auth, async (req, res) => {
  try {
    const chat = await Chat.findByUserIdAndChatId(req.user._id, req.params.chatId);

    if (!chat) {
      return responseHandler.notFound(res, 'Chat not found');
    }

    return responseHandler.success(res, { chat }, 'Chat retrieved successfully');
  } catch (error) {
    console.error('Error fetching chat:', error);
    return responseHandler.error(res, 'Failed to fetch chat', 500, error);
  }
});

// Create a new chat
router.post('/', [
  auth,
  body('title').optional().trim().isLength({ max: 200 }),
  body('selectedModel').optional().isObject(),
  body('selectedModel.id').optional().notEmpty(),
  body('selectedModel.name').optional().notEmpty(),
  body('selectedModel.provider').optional().notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return responseHandler.validationError(res, errors.array(), 'Validation failed');
    }

    const { title, selectedModel } = req.body;

    const chat = new Chat({
      userId: req.user._id,
      title: title || 'New Chat',
      selectedModel: selectedModel || {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        provider: 'openai'
      },
      messages: []
    });

    const savedChat = await chat.save();

    return responseHandler.created(res, { chat: savedChat }, 'Chat created successfully');
  } catch (error) {
    console.error('Error creating chat:', error);
    return responseHandler.error(res, 'Failed to create chat', 500, error);
  }
});

// Send a message to a chat
router.post('/:chatId/messages', [
  auth,
  body('content').notEmpty().trim(),
  body('model').optional().isObject(),
  body('model.id').optional().notEmpty(),
  body('model.name').optional().notEmpty(),
  body('model.provider').optional().notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { content, model } = req.body;
    const { chatId } = req.params;

    // Find the chat
    let chat = await Chat.findByUserIdAndChatId(req.user._id, chatId);
    if (!chat) {
      return res.status(404).json({
        status: 'error',
        message: 'Chat not found'
      });
    }

    // Update model if provided
    if (model) {
      chat.selectedModel = model;
    }

    // Add user message
    await chat.addMessage({
      content,
      role: 'user',
      metadata: {
        model: chat.selectedModel?.id || 'gpt-3.5-turbo'
      }
    });

    try {
      // Generate AI response based on selected model
      const aiResponse = await generateAIResponse(
        req.user._id,
        chat.messages,
        chat.selectedModel || { id: 'gpt-3.5-turbo', provider: 'openai' }
      );

      // Add AI response message
      await chat.addMessage({
        content: aiResponse.content,
        role: 'assistant',
        metadata: {
          model: chat.selectedModel?.id || 'gpt-3.5-turbo',
          tokens: aiResponse.usage?.total_tokens
        }
      });

      // Reload chat to get updated data
      chat = await Chat.findByUserIdAndChatId(req.user._id, chatId);

      res.json({
        status: 'success',
        data: { 
          chat,
          lastMessage: chat.lastMessage
        }
      });
    } catch (aiError) {
      console.error('AI response error:', aiError);
      
      // Add error message
      await chat.addMessage({
        content: 'Sorry, I encountered an error while processing your message. Please try again.',
        role: 'assistant',
        metadata: {
          model: chat.selectedModel?.id || 'gpt-3.5-turbo',
          error: true
        }
      });

      res.status(500).json({
        status: 'error',
        message: 'Failed to generate AI response',
        error: aiError.message
      });
    }
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to send message'
    });
  }
});

// Handle preflight requests for streaming endpoint
router.options('/:chatId/messages/stream', (req, res) => {
  res.header('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:5173');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control, X-Requested-With');
  res.sendStatus(200);
});

// Stream messages to a chat (for real-time responses)
router.post('/:chatId/messages/stream', [
  auth,
  body('content').notEmpty().trim(),
  body('model').optional().isObject(),
  body('model.id').optional().notEmpty(),
  body('model.name').optional().notEmpty(),
  body('model.provider').optional().notEmpty()
], async (req, res) => {
  // Set CORS headers first, before any other processing
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:5173');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control, X-Requested-With');
  
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { content, model } = req.body;
    const { chatId } = req.params;

    // Find the chat
    let chat = await Chat.findByUserIdAndChatId(req.user._id, chatId);
    if (!chat) {
      return res.status(404).json({
        status: 'error',
        message: 'Chat not found'
      });
    }

    // Update model if provided
    if (model) {
      chat.selectedModel = model;
    }

    // Add user message
    await chat.addMessage({
      content,
      role: 'user',
      metadata: {
        model: chat.selectedModel?.id || 'gpt-4o-mini'
      }
    });

    // Set up Server-Sent Events headers (CORS already set above)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Disable nginx buffering for streaming
    });

    try {
      // Use agent service for OpenAI models (with or without Notion integration)
      if (chat.selectedModel?.provider === 'openai') {
        console.log('Using streaming agent service for user:', req.user._id);
        
        // Use agent service with streaming
        const streamResult = await agentService.sendMessageStreaming(
          req.user._id,
          chat.messages,
          chat.selectedModel.id
        );

        let fullResponse = '';
        let toolCalls = [];

        // Process streaming events - streamResult is already async iterable
        for await (const event of streamResult) {
          if (event.type === 'raw_model_stream_event') {
            // Send text deltas
            if (event.data?.type === 'output_text_delta' && event.data?.delta) {
              fullResponse += event.data.delta;
              res.write(`data: ${JSON.stringify({
                type: 'text_delta',
                content: event.data.delta
              })}\n\n`);
            }
          } else if (event.type === 'run_item_stream_event') {
            // console.log('Tool event:', JSON.stringify(event, null, 2)); // Debug log
            
            if (event.item?.type === 'tool_call_item') {
              // Tool call started
              const toolName = event.item?.name || event.item?.rawItem?.name || 'unknown tool';
              res.write(`data: ${JSON.stringify({
                type: 'tool_call_start',
                tool: toolName,
                details: event.item?.rawItem?.arguments || {}
              })}\n\n`);
            } else if (event.item?.type === 'tool_call_output_item') {
              // Tool call completed
              const toolName = event.item?.name || event.item?.rawItem?.name || 'unknown tool';
              toolCalls.push({
                name: toolName,
                output: event.item?.rawItem?.output || event.item?.output
              });
              res.write(`data: ${JSON.stringify({
                type: 'tool_call_end',
                tool: toolName,
                success: true
              })}\n\n`);
            }
          }
        }

        // Add AI response to chat
        await chat.addMessage({
          content: fullResponse,
          role: 'assistant',
          metadata: {
            model: chat.selectedModel?.id || 'gpt-4o-mini',
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined
          }
        });

        // Send completion event
        res.write(`data: ${JSON.stringify({
          type: 'completion',
          content: fullResponse,
          toolCalls
        })}\n\n`);

      } else {
        // For non-OpenAI models, use regular streaming (implement if needed)
        res.write(`data: ${JSON.stringify({
          type: 'error',
          message: 'Streaming only available for OpenAI models'
        })}\n\n`);
      }

    } catch (streamError) {
      console.error('Streaming error:', streamError);
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: 'Failed to generate streaming response'
      })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('Error in streaming endpoint:', error);
    
    // Handle authentication errors
    if (error.message && error.message.includes('token')) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication failed'
      });
    }
    
    if (!res.headersSent) {
      res.status(500).json({
        status: 'error',
        message: 'Failed to process streaming request'
      });
    }
  }
});

// Check agent capabilities and integration status
router.get('/integrations/agent/capabilities', auth, async (req, res) => {
  try {
    const capabilities = await agentService.getAgentCapabilities(req.user._id);
    
    res.json({
      status: 'success',
      data: capabilities
    });
  } catch (error) {
    console.error('Error checking agent capabilities:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to check agent capabilities'
    });
  }
});

// Legacy endpoint for backward compatibility
router.get('/integrations/notion/status', auth, async (req, res) => {
  try {
    const capabilities = await agentService.getAgentCapabilities(req.user._id);
    
    res.json({
      status: 'success',
      data: {
        hasNotionIntegration: capabilities.hasNotionIntegration,
        capabilities: capabilities.hasNotionIntegration 
          ? capabilities.capabilities.filter(cap => cap.includes('Notion'))
          : []
      }
    });
  } catch (error) {
    console.error('Error checking Notion integration status:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to check integration status'
    });
  }
});

// Update chat settings
router.patch('/:chatId', [
  auth,
  body('title').optional().trim().isLength({ max: 200 }),
  body('selectedModel').optional().isObject(),
  body('settings').optional().isObject(),
  body('settings.temperature').optional().isFloat({ min: 0, max: 2 }),
  body('settings.maxTokens').optional().isInt({ min: 1, max: 4000 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const chat = await Chat.findByUserIdAndChatId(req.user._id, req.params.chatId);
    if (!chat) {
      return res.status(404).json({
        status: 'error',
        message: 'Chat not found'
      });
    }

    const { title, selectedModel, settings } = req.body;

    if (title !== undefined) chat.title = title;
    if (selectedModel) chat.selectedModel = selectedModel;
    if (settings) chat.settings = { ...chat.settings, ...settings };

    const updatedChat = await chat.save();

    res.json({
      status: 'success',
      data: { chat: updatedChat }
    });
  } catch (error) {
    console.error('Error updating chat:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update chat'
    });
  }
});

// Delete a chat
router.delete('/:chatId', auth, async (req, res) => {
  try {
    const chat = await Chat.findByUserIdAndChatId(req.user._id, req.params.chatId);
    if (!chat) {
      return responseHandler.notFound(res, 'Chat not found');
    }

    await chat.softDelete();

    return responseHandler.success(res, null, 'Chat deleted successfully');
  } catch (error) {
    console.error('Error deleting chat:', error);
    return responseHandler.error(res, 'Failed to delete chat', 500, error);
  }
});

// Get available models based on user's API keys
router.get('/models/available', auth, async (req, res) => {
  try {
    const ApiKey = require('../models/ApiKey');
    
    // Get all active API keys for the user
    const apiKeys = await ApiKey.find({
      userId: req.user._id,
      isActive: true,
      isVerified: true
    });

    let allModels = [];

    // Collect models from each API key's metadata
    for (const apiKey of apiKeys) {
      if (apiKey.metadata && apiKey.metadata.models) {
        // Add provider context to each model and ensure they have the right structure
        const providerModels = apiKey.metadata.models.map(model => ({
          id: model.id,
          name: model.name || model.id,
          provider: apiKey.provider,
          context: model.context || getDefaultContext(model.id, apiKey.provider),
          maxTokens: model.maxTokens
        }));
        allModels.push(...providerModels);
      }
    }

    // If no models found, return empty array with message
    if (allModels.length === 0) {
      return responseHandler.success(res, {
        models: [],
        message: 'No models available. Please add and verify API keys first.'
      }, 'Available models retrieved successfully');
    }

    // Remove duplicates and sort by provider then name
    const uniqueModels = allModels.reduce((acc, model) => {
      const key = `${model.provider}-${model.id}`;
      if (!acc.some(m => `${m.provider}-${m.id}` === key)) {
        acc.push(model);
      }
      return acc;
    }, []);

    uniqueModels.sort((a, b) => {
      if (a.provider !== b.provider) {
        return a.provider.localeCompare(b.provider);
      }
      return a.name.localeCompare(b.name);
    });

    return responseHandler.success(res, { models: uniqueModels }, 'Available models retrieved successfully');
  } catch (error) {
    console.error('Error fetching user models:', error);
    return responseHandler.error(res, 'Failed to fetch available models', 500, error);
  }
});

// Helper function to get default context window for known models
function getDefaultContext(modelId, provider) {
  const defaults = {
    openai: {
      'gpt-4': 8192,
      'gpt-4-32k': 32768,
      'gpt-4-1106-preview': 128000,
      'gpt-4-turbo-preview': 128000,
      'gpt-3.5-turbo': 4096,
      'gpt-3.5-turbo-16k': 16384,
      'gpt-3.5-turbo-1106': 16384
    },
    anthropic: {
      'claude-3-opus-20240229': 200000,
      'claude-3-sonnet-20240229': 200000,
      'claude-3-haiku-20240307': 200000
    },
    google: {
      'gemini-pro': 30720,
      'gemini-pro-vision': 30720
    },
    mistral: {
      'mistral-tiny': 32000,
      'mistral-small': 32000,
      'mistral-medium': 32000,
      'mistral-large': 32000
    }
  };

  return defaults[provider]?.[modelId] || 4096;
}

// Helper function to generate AI response
async function generateAIResponse(userId, messages, selectedModel) {
  const provider = selectedModel.provider || 'openai';
  
  // Use agent service for OpenAI models (with or without Notion MCP integration)
  if (provider === 'openai') {
    try {
      console.log('Using agent service for user:', userId);
      
      // Use agent service (will automatically detect Notion integration)
      const agentResponse = await agentService.sendMessage(
        userId, 
        messages, 
        selectedModel.id
      );
      
      return {
        content: agentResponse.content,
        usage: agentResponse.usage,
        toolCalls: agentResponse.toolCalls
      };
    } catch (agentError) {
      console.warn('Agent service failed, falling back to OpenAI API:', agentError.message);
      // Fall through to regular OpenAI API call
    }
  }
  
  switch (provider) {
    case 'openai':
      // Convert messages to OpenAI format
      const openaiMessages = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      const response = await openaiService.makeOpenAIApiCall(
        userId,
        '/chat/completions',
        'POST',
        {
          model: selectedModel.id,
          messages: openaiMessages,
          max_tokens: 1500,
          temperature: 0.7
        }
      );

      return {
        content: response.choices[0].message.content,
        usage: response.usage
      };

    case 'anthropic':
      // TODO: Implement Anthropic service
      throw new Error('Anthropic provider not yet implemented');

    case 'google':
      // TODO: Implement Google service
      throw new Error('Google provider not yet implemented');

    case 'mistral':
      // TODO: Implement Mistral service
      throw new Error('Mistral provider not yet implemented');

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

module.exports = router;