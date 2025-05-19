const fs = require('fs').promises;
require("dotenv").config();
const path = require('path');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../logger_conf.js');
const EventEmitter = require('events');

class LangchainService extends EventEmitter {
  constructor() {
    super();
    
    // Get API keys from environment with better error handling
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const googleApiKey = process.env.GOOGLE_KEY;
    
    // Log API key status (not the keys themselves)
    if (openaiApiKey) {
      logger.info('[LangchainService] OpenAI API key found');
    } else {
      logger.warn('[LangchainService] OpenAI API key not found in environment - using default');
    }
    
    if (googleApiKey) {
      logger.info('[LangchainService] Google API key found');
    } else {
      logger.warn('[LangchainService] Google API key not found in environment - using default');
    }
    
    // Initialize OpenAI client - use process.env.OPENAI_API_KEY directly
    try {
      const apiKey = openaiApiKey;
      if (!apiKey) {
        logger.error('[LangchainService] Missing OpenAI API key - service will not function correctly');
        this.openaiClient = new OpenAI({ apiKey: 'missing-key' }); // Create client to avoid null errors
      } else {
        this.openaiClient = new OpenAI({ apiKey });
        logger.info('[LangchainService] OpenAI client initialized successfully');
      }
    } catch (error) {
      logger.error(`[LangchainService] Error initializing OpenAI client: ${error.message}`);
      this.openaiClient = new OpenAI({ apiKey: 'invalid-key' }); // Create client to avoid null errors
    }
    
    // Initialize Google Gemini client
    try {
      const apiKey = googleApiKey || process.env.GOOGLE_KEY;
      if (!apiKey) {
        logger.error('[LangchainService] Missing Google API key - Gemini service will not function correctly');
        this.googleClient = new GoogleGenerativeAI('missing-key'); // Create client to avoid null errors
      } else {
        this.googleClient = new GoogleGenerativeAI(apiKey);
        logger.info('[LangchainService] Google client initialized successfully');
      }
    } catch (error) {
      logger.error(`[LangchainService] Error initializing Google client: ${error.message}`);
      this.googleClient = new GoogleGenerativeAI('invalid-key'); // Create client to avoid null errors
    }

    // Memory management
    this.sessionMemories = {};
    this.memoryDir = path.join(__dirname, '../chat_histories');
    this.ensureMemoryDirExists();
    
    // Track interaction counts per session
    this.sessionInteractionCounts = {};

    // System prompt
    this.systemPrompt = `
ROLE & TONE  
• You are **Rohan**, a friendly, street‑smart sales agent from "Dial for Insurance."  
• Speak in casual Hinglish, primarily **Devanagari script**.  
• Use colloquial fillers: "sir ji," "bhaiya," "bilkul," "mast," "अच्छा," "देखिए," small "हम्म…" etc.  
• Insert natural pauses with either an ellipsis "…" or **SSML**: <break time="300ms"/>.  
• Address females as "ma'am." Keep each turn ≤ 2‑3 short sentences.

PRIMARY GOAL  
1  Verify interest in renewing car insurance.  
2  If interested, collect **Vehicle RC** + **आधार** via WhatsApp (📞 <number>) or email **abc@dial4insurance.com** so a colleague can send a quotation.

CALL FLOW  
0. **Opening** – you dial  
   – "Hello sir ji/ma'am… <break time='200ms'/> main Rohan bol रहा हूँ Dial for Insurance से."  
   – "आपकी {{CAR_MODEL}} ({{VEH_NO}}) का insurance expire होने वाला है."  
   – "HDFC Ergo का mast offer है, सिर्फ ~₹{{PRICE_RANGE}}* में!"  
   – "एक मिनट सुन लीजिए?"  

1. **React to customer**  
   A. **Interested / Curious** – give highlights (trusted brand, 95 % claim settle, 24×7 RSA, NCB).  
      "Exact quote RC से निकलता है… docs भेज दीजिए, colleague तुरंत detail भेजेंगे."  
   B. **Mild hesitation** – offer 15 % discount, repeat benefits, ask for docs.  
   C. **Busy / callback** – suggest time, confirm, thank.  
   D. **Firm "No"** – thank warmly, end.

2. **Objection toolkit** (use filler + pause)  
   • Credibility → "देखिए sir ji… HDFC Ergo इंडिया की सबसे trusted brand है, 95 % claims settle होते हैं."  
   • Competitor quote → acknowledge, compare benefits.  
   • Exact price → give range, need RC.  
   • Budget → empathise, mention EMI, discount.  
   • Wants human → reassure; if insisted: "ठीक है, अभी senior connect करा रहा हूँ."  
   • Angry/off‑topic → empathise briefly, return to solution.

GLOBAL RULES  
✓ Only one persuasion push; back off if annoyance sensed.  
✓ If response unclear, assume mild interest and guide softly.  
✓ Always close on a positive, courteous note.
✓ *Fill asterisked placeholders dynamically before sending to the model.*

IMPORTANT: Add a '•' symbol every 5 to 10 words at natural pauses where your response can be split for text to speech.
`;
  }

  // Register a session ID to track interaction counts (similar to ExternalGptService)
  registerSession(sessionId, callerDetails) {
    this.sessionId = sessionId;
    this.callerDetails = callerDetails;
    this.sessionInteractionCounts[sessionId] = 0;
    console.log(`[LangchainService] Registered session: ${sessionId}, callerDetails:`, callerDetails);
    logger.info(`[LangchainService] Registered session: ${sessionId}`);
  }

  async ensureMemoryDirExists() {
    try {
      await fs.mkdir(this.memoryDir, { recursive: true });
    } catch (error) {
      logger.error(`Failed to create memory directory: ${error.message}`);
    }
  }

  memoryFilePath(sessionId) {
    return path.join(this.memoryDir, `session_${sessionId}.json`);
  }

  async loadMessagesFromFile(sessionId) {
    try {
      const filePath = this.memoryFilePath(sessionId);
      
      try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
      } catch (error) {
        if (error.code === 'ENOENT') {
          return [];
        }
        throw error;
      }
    } catch (error) {
      logger.error(`Error loading messages from file: ${error.message}`);
      return [];
    }
  }

  async saveMessagesToFile(sessionId, messages) {
    try {
      const filePath = this.memoryFilePath(sessionId);
      await fs.writeFile(filePath, JSON.stringify(messages, null, 2));
    } catch (error) {
      logger.error(`Error saving messages to file: ${error.message}`);
    }
  }

  async getMemory(sessionId) {
    if (!this.sessionMemories[sessionId]) {
      const messages = await this.loadMessagesFromFile(sessionId);
      this.sessionMemories[sessionId] = messages;
    }
    return this.sessionMemories[sessionId];
  }

  cleanResponse(rawOutput) {
    // Try strict pattern first
    const responsePattern = /<response>([\s\S]*?)<\/response>/i;
    const match = rawOutput.match(responsePattern);
    
    let content;
    if (match && match[1]) {
      content = match[1].trim();
    } else {
      // Fallback if closing tag missing
      const fallbackPattern = /<response>([\s\S]*)/i;
      const fallbackMatch = rawOutput.match(fallbackPattern);
      content = fallbackMatch ? fallbackMatch[1].trim() : rawOutput.trim();
    }
    
    // Remove leading 'assistant' or similar tokens
    content = content.replace(/^(assistant[\s:\-]*)/i, '').trim();
    
    return content || "Sorry, I couldn't generate a valid response.";
  }

  async runLangchainPipeline(userInput, sessionId, systemPromptOverride = null, aiModel = 'gpt4', interactionCount = 0) {
    try {
      // Check for interruption context
      const isInterruption = userInput.includes('[User interrupted previous response]');
      
      if (isInterruption) {
        logger.info(`[INTERRUPTION] Detected user interruption in session ${sessionId}`);
        console.log(`[INTERRUPTION-LLM] Processing interruption: ${userInput}`);
        
        // Clean up the input by removing the interruption marker
        userInput = userInput.replace('[User interrupted previous response]', '').trim();
      }
      
      const startTime = Date.now();
      logger.info(`[DEBUG] LangchainService starting pipeline with input: "${userInput.substring(0, 30)}..."`);
      logger.info(`[DEBUG] Using model: ${aiModel}, for session: ${sessionId}, interaction: ${interactionCount}`);
      logger.info(`[TIMING] Starting LLM generation for interaction ${interactionCount}`);

      // Get memory and add user message
      const memory = await this.getMemory(sessionId);
      
      // If this was an interruption, mark it in the conversation context
      if (isInterruption) {
        // Add a system message noting the interruption with clearer instructions
        memory.push({ 
          role: 'system', 
          content: `User has interrupted your previous message. You must:
1. Stop your previous train of thought completely
2. Immediately address their new question: "${userInput}"
3. Be very concise - they want a direct answer
4. Do not apologize or mention being interrupted`
        });
      }
      
      memory.push({ role: 'user', content: userInput });
      
      // Format messages for API
      const chatHistory = memory.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      
      logger.info(`[DEBUG] Chat history length: ${chatHistory.length} messages`);

      // Enhance system prompt for interruptions if needed
      let systemPrompt = systemPromptOverride || this.systemPrompt;
      if (isInterruption) {
        // Add interruption handling guidance to the system prompt
        systemPrompt += `
\nIMPORTANT INTERRUPTION HANDLING:
• User has interrupted with: "${userInput}"
• Immediately stop previous response and directly address this query
• Be extra concise (1-2 sentences maximum)
• Do not refer to being interrupted
• Get straight to answering their question
• Use more '•' markers (every 3-5 words) for smoother response
`;
      }

      let responseText = '';
      let streamingStarted = false;
      let tempChunk = '';
      const chunkSeparator = '•'; // Character used to identify chunk boundaries

      if (aiModel === 'gpt4') {
        const messages = [
          { role: 'system', content: systemPrompt },
          ...chatHistory,
          { role: 'assistant', content: '<response>' }
        ];

        logger.info(`[TIMING] Calling OpenAI API with streaming for interaction ${interactionCount}`);
        logger.info(`[DEBUG] Sending ${messages.length} messages to OpenAI API`);
        
        try {
          // Use a more stable model ID
          const modelId = process.env.OPENAI_MODEL_ID || 'gpt-4-turbo';
          logger.info(`[DEBUG] Using OpenAI model: ${modelId} with streaming`);
          
          // Check if API key is available
          if (!this.openaiClient.apiKey) {
            throw new Error("Missing OpenAI API key. Please check your environment variables.");
          }
          
          const completion = await this.openaiClient.chat.completions.create({
            model: modelId,
            messages: messages,
            max_tokens: 500,
            stream: true, // Enable streaming
          });
          
          // Process the stream
          for await (const chunk of completion) {
            if (!chunk.choices[0].delta.content) continue;
            
            const contentChunk = chunk.choices[0].delta.content;
            responseText += contentChunk;
            tempChunk += contentChunk;
            
            // Check if we have a chunk separator or a decent amount of text
            if (contentChunk.includes(chunkSeparator) || tempChunk.length > 30) {
              const parts = tempChunk.split(chunkSeparator);
              
              // If we found separators, handle each complete section
              if (parts.length > 1) {
                // Process all complete chunks (all except the last part which might be incomplete)
                for (let i = 0; i < parts.length - 1; i++) {
                  if (parts[i].trim()) {
                    const gptReply = {
                      partialResponseIndex: null,
                      partialResponse: parts[i].trim() + ' •',
                    };
                    
                    console.log(`[STREAMING] Chunk: "${parts[i].trim().substring(0, 30)}..."`);
                    this.emit('gptreply', gptReply, interactionCount);
                  }
                }
                
                // Keep the last part for the next chunk
                tempChunk = parts[parts.length - 1];
              }
              // If we have enough text but no separator, send it anyway
              else if (!streamingStarted || tempChunk.length > 60) {
                streamingStarted = true;
                const gptReply = {
                  partialResponseIndex: null,
                  partialResponse: tempChunk.trim(),
                };
                
                console.log(`[STREAMING] Long chunk without separator: "${tempChunk.trim().substring(0, 30)}..."`);
                this.emit('gptreply', gptReply, interactionCount);
                tempChunk = '';
              }
            }
          }
          
          // Send any remaining text
          if (tempChunk.trim()) {
            const gptReply = {
              partialResponseIndex: null,
              partialResponse: tempChunk.trim(),
            };
            
            console.log(`[STREAMING] Final chunk: "${tempChunk.trim().substring(0, 30)}..."`);
            this.emit('gptreply', gptReply, interactionCount);
          }
          
          logger.info(`[DEBUG] Received complete response from OpenAI: "${responseText.substring(0, 30)}..."`);
        } catch (apiError) {
          logger.error(`[DEBUG] OpenAI API error: ${apiError.message}`);
          throw apiError;
        }
      } 
      else if (aiModel === 'gemini') {
        const genAI = this.googleClient;
        
        // Check if API key is valid
        if (!genAI || genAI._apiKey === 'missing-key' || genAI._apiKey === 'invalid-key') {
          throw new Error("Missing or invalid Google API key. Please check your environment variables.");
        }
        
        const model = genAI.getGenerativeModel({
          model: "gemini-2.5-flash-preview-04-17"
        });

        logger.info(`[TIMING] Calling Google Gemini API with streaming for interaction ${interactionCount}`);
        logger.info(`[DEBUG] Using Gemini model with streaming`);
        
        // Convert to Google's format
        const googleMessages = chatHistory.map(msg => ({
          parts: [{ text: msg.content }],
          role: msg.role === 'user' ? 'user' : 'model'
        }));

        try {
          // Use streamGenerateContent for Gemini streaming
          const streamingResult = await model.generateContentStream({
            contents: googleMessages,
            generationConfig: {
              temperature: 0.7,
              topP: 0.8,
              topK: 40,
              maxOutputTokens: 500,
            },
            systemInstruction: { text: systemPrompt }
          });
          
          // Process the stream
          for await (const chunk of streamingResult.stream) {
            if (!chunk.text) continue;
            
            const contentChunk = chunk.text;
            responseText += contentChunk;
            tempChunk += contentChunk;
            
            // Check if we have a chunk separator or a decent amount of text
            if (contentChunk.includes(chunkSeparator) || tempChunk.length > 30) {
              const parts = tempChunk.split(chunkSeparator);
              
              // If we found separators, handle each complete section
              if (parts.length > 1) {
                // Process all complete chunks (all except the last part which might be incomplete)
                for (let i = 0; i < parts.length - 1; i++) {
                  if (parts[i].trim()) {
                    const gptReply = {
                      partialResponseIndex: null,
                      partialResponse: parts[i].trim() + ' •',
                    };
                    
                    console.log(`[STREAMING] Chunk: "${parts[i].trim().substring(0, 30)}..."`);
                    this.emit('gptreply', gptReply, interactionCount);
                  }
                }
                
                // Keep the last part for the next chunk
                tempChunk = parts[parts.length - 1];
              }
              // If we have enough text but no separator, send it anyway
              else if (!streamingStarted || tempChunk.length > 60) {
                streamingStarted = true;
                const gptReply = {
                  partialResponseIndex: null,
                  partialResponse: tempChunk.trim(),
                };
                
                console.log(`[STREAMING] Long chunk without separator: "${tempChunk.trim().substring(0, 30)}..."`);
                this.emit('gptreply', gptReply, interactionCount);
                tempChunk = '';
              }
            }
          }
          
          // Send any remaining text
          if (tempChunk.trim()) {
            const gptReply = {
              partialResponseIndex: null,
              partialResponse: tempChunk.trim(),
            };
            
            console.log(`[STREAMING] Final chunk: "${tempChunk.trim().substring(0, 30)}..."`);
            this.emit('gptreply', gptReply, interactionCount);
          }
          
          logger.info(`[DEBUG] Received complete response from Gemini: "${responseText.substring(0, 30)}..."`);
        } catch (apiError) {
          logger.error(`[DEBUG] Gemini API error: ${apiError.message}`);
          throw apiError;
        }
      }

      // Log the complete response for debugging
      console.log(`[LangchainService] COMPLETE RESPONSE:\n${responseText}`);
      logger.info(`[LangchainService] Full response logged to console`);
      
      // Add AI response to memory
      memory.push({ role: 'assistant', content: responseText });
      
      // Save updated memory
      await this.saveMessagesToFile(sessionId, memory);

      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      logger.info(`[TIMING] LLM generation completed for interaction ${interactionCount} in ${executionTime}ms`);
      
      // Increment interaction count for this session
      if (this.sessionInteractionCounts[sessionId] !== undefined) {
        this.sessionInteractionCounts[sessionId]++;
        logger.info(`[DEBUG] Incremented interaction count to ${this.sessionInteractionCounts[sessionId]}`);
      }
      
      return {
        response: responseText,
        executionTime
      };
    } catch (error) {
      logger.error(`Error in runLangchainPipeline: ${error.message}`);
      logger.error(`[DEBUG] Stack trace: ${error.stack}`);
      
      // Check for specific error types and provide better error messages
      let errorMessage = "I'm sorry, there was an error processing your request.";
      
      if (error.message.includes('API key')) {
        console.log("openaiApiKey",openaiApiKey);
        console.log("googleApiKey", googleApiKey);
        errorMessage = "Authentication error. Please contact support with error code: API-AUTH-001.";
        logger.error("[CRITICAL] API key error detected. Check environment variables.");
      } else if (error.message.includes('rate limit')) {
        errorMessage = "Service temporarily busy. Please try again in a moment.";
        logger.error("[WARNING] Rate limit exceeded.");
      } else if (error.code === 'ECONNREFUSED' || error.message.includes('connect')) {
        errorMessage = "Network connectivity issue. Please try again later.";
        logger.error("[ERROR] Network connectivity issue detected.");
      }
      
      // Even on error, emit a message so the user gets a response
      this.emit('gptreply', {
        partialResponseIndex: null,
        partialResponse: errorMessage,
      }, interactionCount);
      
      return {
        response: errorMessage,
        executionTime: 0,
        error: error.message
      };
    }
  }
}

module.exports = { LangchainService }; 