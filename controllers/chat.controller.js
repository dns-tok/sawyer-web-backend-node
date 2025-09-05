const responseHandler = require('../utils/response.handler');

exports.stream = async (req, res) => {
  try {
    const { message, projectId } = req.body;
    const userId = req.user.id;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    // Get user's OpenAI API key
    const ApiKey = require('../models/ApiKey');
    const userApiKey = await ApiKey.findOne({
      where: {
        userId: userId,
        service: 'openai',
        isActive: true
      }
    });

    if (!userApiKey) {
      return res.status(400).json({
        success: false,
        message: 'OpenAI API key not found. Please add your OpenAI API key first.'
      });
    }

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Initialize OpenAI with user's API key
    const { ChatOpenAI } = require('@langchain/openai');
    const chatModel = new ChatOpenAI({
      openAIApiKey: userApiKey.encryptedKey,
      modelName: 'gpt-3.5-turbo',
      streaming: true,
      temperature: 0.7
    });

    // System prompt for Sawyer
    const systemPrompt = `You are Sawyer, an intelligent AI assistant designed to help with project management, development tasks, and productivity. You are knowledgeable, helpful, and always aim to provide clear and actionable advice. You can help with coding, planning, organizing work, and solving technical problems. Keep your responses concise and practical.`;

    // Create the full prompt
    const fullPrompt = `${systemPrompt}\n\nUser: ${message}\n\nSawyer:`;

    // Stream the response
    const stream = await chatModel.stream(fullPrompt);

    let fullResponse = '';
    
    for await (const chunk of stream) {
      const content = chunk.content;
      if (content) {
        fullResponse += content;
        // Send chunk to client
        res.write(`data: ${JSON.stringify({ content, type: 'chunk' })}\n\n`);
      }
    }

    // Save chat to database if projectId is provided
    if (projectId) {
      const Chat = require('../models/Chat');
      await Chat.create({
        projectId: projectId,
        userId: userId,
        message: message,
        response: fullResponse,
        timestamp: new Date()
      });
    }

    // Send completion signal
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();

  } catch (error) {
    console.error('Error in chat stream:', error);
    
    // Send error to client if connection is still open
    try {
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        message: 'Failed to generate response. Please check your OpenAI API key.' 
      })}\n\n`);
      res.end();
    } catch (writeError) {
      console.error('Error writing to response:', writeError);
    }
  }
};
