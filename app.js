require('dotenv').config();
require('colors');
console.log("deep_gram", process.env.DEEPGRAM_API_KEY);
const express = require('express');
const ExpressWs = require('express-ws');
const { StreamService } = require('./services/stream-service');
const { TranscriptionService } = require('./services/transcription-service');
const { ElevenLabsTTSService } = require('./services/tts-service');
const { ExternalGptService } = require('./services/external-gpt-service');
const { recordingService } = require('./services/recording-service');
const { makeOutBoundCall } = require('./scripts/outbound-call.js');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const logger = require("./logger_conf.js");
const app = express();
ExpressWs(app);

const PORT = process.env.PORT || 3000;
const WEBSOCKET_URL = process.env.SERVER;

// Active call sessions store
const activeSessions = new Map();

// Timing utility functions
const createTimer = () => {
  const timer = {
    start: Date.now(),
    elapsed: function() {
      return Date.now() - this.start;
    },
    reset: function() {
      this.start = Date.now();
      return this;
    }
  };
  return timer;
};

// Home page with call form
app.get('/', async (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>AI Phone Assistant</title>
    </head>
    <body>
      <div class="container">
        <h1>AI Phone Assistant</h1>
        <form action="/makecall" method="get">
          <input type="text" id="phonenumber" name="phonenumber" placeholder="Enter phone number" required>
          <br>
          <button type="submit">Call</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

// Make outbound call endpoint
app.get('/makecall', (req, res) => {
  const phoneNumber = req.query.phonenumber;
  if (!phoneNumber) {
    return res.status(400).send("Phone number is required");
  }
  
  logger.info("Making outbound call to:", phoneNumber);
  makeOutBoundCall(phoneNumber)
    .then(() => {
      res.send(`Call initiated to ${phoneNumber}. Please wait for the connection.`);
    })
    .catch(err => {
      logger.error("Failed to make call:", err);
      res.status(500).send(`Failed to make call: ${err.message}`);
    });
});

// Handle incoming Twilio calls
app.post('/incoming', (req, res) => {
  logger.info("Incoming call received");
  
  try {
    const response = new VoiceResponse();
    const connect = response.connect();
    
    // Use the environment variable for the WebSocket URL
    const wsUrl = `wss://${WEBSOCKET_URL}/connection`;
    logger.info(`Connecting call to WebSocket: ${wsUrl}`);
    
    connect.stream({ url: wsUrl });
    
    res.type('text/xml');
    res.send(response.toString());
  } catch (err) {
    logger.error("Error handling incoming call:", err);
    res.status(500).send("Error handling call");
  }
});

// WebSocket connection endpoint for Twilio Media Streams
app.ws('/connection', (ws) => {
  logger.info("New WebSocket connection established");
  
  // Track connection state and resources
  const session = {
    streamSid: null,
    callSid: null,
    services: {},
    marks: [],
    active: true,
    startTime: Date.now(),
    transcriptionBuffer: '', // Buffer to accumulate finalizing transcription chunks
    timers: {
      transcription: createTimer(),
      gpt: createTimer(),
      tts: createTimer(),
      roundTrip: createTimer()
    },
    metrics: {
      rounds: []
    },
    currentRound: {
      input: '',
      transcriptionTime: 0,
      gptTime: 0,
      ttsTime: 0,
      interactionCount: 0
    }
  };
  
  // Helper function to log timing for the current round
  const logCurrentRoundTiming = () => {
    logger.info("[TIMING] Current round metrics:".cyan);
    logger.info(`  Round: ${session.currentRound.interactionCount}`.cyan);
    logger.info(`  Input: "${session.currentRound.input.substring(0, 30)}${session.currentRound.input.length > 30 ? '...' : ''}"`.cyan);
    logger.info(`  Transcription: ${session.currentRound.transcriptionTime}ms`.cyan);
    logger.info(`  GPT: ${session.currentRound.gptTime}ms`.cyan);
    logger.info(`  TTS: ${session.currentRound.ttsTime}ms`.cyan);
  };
  
  try {
    // Handle WebSocket errors
    ws.on('error', (error) => {
      logger.error("WebSocket error:", error);
      cleanupSession(session);
    });
    
    // Initialize services with streaming capabilities
    const streamService = new StreamService(ws);
    const transcriptionService = new TranscriptionService();
    const gptService = new ExternalGptService();
    const ttsService = new ElevenLabsTTSService(streamService);
    
    // Store services in session
    session.services = {
      streamService,
      transcriptionService,
      gptService,
      ttsService
    };
    
    // Handle incoming WebSocket messages
    ws.on('message', async function(data) {
      try {
        const msg = JSON.parse(data);
        
        if (msg.event === 'start') {
          // Initialize call session
          session.streamSid = msg.start.streamSid;
          session.callSid = msg.start.callSid;
          
          // Store session in active sessions map
          activeSessions.set(session.callSid, session);
          
          logger.info(`Call started: ${session.callSid} (Stream: ${session.streamSid})`.green);
          
          // Set up services
          streamService.setStreamSid(session.streamSid);
          gptService.registerSession(session.callSid);
          
          // Initialize recording if enabled
         // await recordingService(ttsService, session.callSid);
          
          // Send welcome message
          logger.info(`Sending welcome message for call ${session.callSid}`.blue);
          
          // Reset all timers for welcome message
          session.timers.roundTrip.reset();
          session.timers.gpt.reset();
          session.currentRound = {
            input: 'welcome',
            transcriptionTime: 0,
            interactionCount: 0,
            gptTime: 0,
            ttsTime: 0
          };
          
          const welcome = await gptService.completion(" ");
          
          // Record GPT time
          session.currentRound.gptTime = session.timers.gpt.elapsed();
          logger.info(`[TIMING] Welcome message - GPT: ${session.currentRound.gptTime}ms`.cyan);
          
          // Start timing TTS
          session.timers.tts.reset();
          
        } else if (msg.event === 'media') {
          // Process incoming audio
          transcriptionService.send(msg.media.payload);
          
        } else if (msg.event === 'mark') {
          // Track audio playback markers
          const label = msg.mark.name;
          logger.info(`Audio mark received (${msg.sequenceNumber}): ${label}`.dim.red);
          session.marks = session.marks.filter(m => m !== label);
          
        } else if (msg.event === 'stop') {
          // Handle call end
          logger.info(`Call ended: ${session.callSid}`.yellow);
          
          // Log detailed metrics about collected rounds
          logger.info(`[DEBUG] Total rounds collected: ${session.metrics.rounds.length}`.yellow);
          
          // Log overall timing metrics
          logger.info("[TIMING SUMMARY] Performance metrics by round:".magenta);
          
          if (session.metrics.rounds.length === 0) {
            logger.info("  No rounds data collected!".red);
          } else {
            session.metrics.rounds.forEach((round, index) => {
              logger.info(`Round ${round.round} (${index}): Input: "${round.input.substring(0, 30)}${round.input.length > 30 ? '...' : ''}"`.magenta);
              logger.info(`  Transcription: ${round.transcriptionTime}ms, GPT: ${round.gptTime}ms, TTS: ${round.ttsTime}ms, Total: ${round.roundTripTime}ms`.magenta);
            });
          }
          
          cleanupSession(session);
        }
      } catch (err) {
        logger.error("Error processing WebSocket message:", err);
      }
    });
    
    // Handle connection close
    ws.on('close', () => {
      logger.info(`WebSocket connection closed for call: ${session.callSid || 'unknown'}`);
      
      // Log any data we have before cleanup
      logger.info(`[DEBUG] At connection close - Total rounds collected: ${session.metrics.rounds.length}`.yellow);
      
      if (session.metrics.rounds.length > 0) {
        logger.info("[TIMING SUMMARY] Performance metrics by round:".magenta);
        session.metrics.rounds.forEach((round, index) => {
          logger.info(`Round ${round.round} (${index}): Input: "${round.input.substring(0, 30)}${round.input.length > 30 ? '...' : ''}"`.magenta);
          logger.info(`  Transcription: ${round.transcriptionTime}ms, GPT: ${round.gptTime}ms, TTS: ${round.ttsTime}ms, Total: ${round.roundTripTime}ms`.magenta);
        });
      }
      
      cleanupSession(session);
    });
    
    // Set up event handler for transcription service
    transcriptionService.on('transcription', async (data) => {
      if (!session.active) return;
      
      // Handle utterance end events
      if (data.utteranceEnd) {
        logger.info('Utterance end detected'.yellow);
        
        // If we have accumulated text, send it to GPT
        if (session.transcriptionBuffer.trim().length > 0) {
          logger.info(`Processing accumulated transcription: "${session.transcriptionBuffer}"`.cyan);
          
          // Start new round of interaction
          session.timers.roundTrip.reset();
          
          // Save the transcription time
          const transcriptionTime = session.timers.transcription.elapsed();
          logger.info(`[TIMING] Transcription processing time: ${transcriptionTime}ms`.cyan);
          
          // Prepare current round data
          session.currentRound = {
            input: session.transcriptionBuffer,
            transcriptionTime: transcriptionTime,
            interactionCount: session.metrics.rounds.length + 1,
            gptTime: 0,
            ttsTime: 0
          };
          
          logCurrentRoundTiming();
          
          // Start GPT timer
          session.timers.gpt.reset();
          
          await gptService.completion(session.transcriptionBuffer);
          session.transcriptionBuffer = ''; // Clear buffer after processing
        }
        return;
      }
      
      // Skip empty text
      if (!data.text || data.text.trim().length === 0) return;
      
      // If this is the first chunk of a new utterance, start the transcription timer
      if (session.transcriptionBuffer.length === 0) {
        session.timers.transcription.reset();
      }
      
      logger.info(`Transcription chunk: "${data.text}" (isFinal: ${data.isFinal}, speechFinal: ${data.speechFinal})`.yellow);
      
      // Check for user interruption based on any text (including non-final)
      if (session.marks.length > 0 && data.text.trim().length > 5) {
        logger.info('User interruption detected, clearing audio stream'.yellow);
        // Clear current audio when user interrupts
        ws.send(JSON.stringify({
          streamSid: session.streamSid,
          event: 'clear'
        }));
      }
      
      // Process finalized text chunks
      if (data.isFinal) {
        // Add to the buffer
        session.transcriptionBuffer += ` ${data.text}`;
        
        // If this is a speech_final event, process the accumulated text
        if (data.speechFinal) {
          logger.info(`Processing final transcription: "${session.transcriptionBuffer}"`.green);
          
          // Start new round of interaction
          session.timers.roundTrip.reset();
          
          // Save the transcription time
          const transcriptionTime = session.timers.transcription.elapsed();
          logger.info(`[TIMING] Transcription processing time: ${transcriptionTime}ms`.cyan);
          
          // Prepare current round data
          session.currentRound = {
            input: session.transcriptionBuffer,
            transcriptionTime: transcriptionTime,
            interactionCount: session.metrics.rounds.length + 1,
            gptTime: 0,
            ttsTime: 0
          };
          
          logCurrentRoundTiming();
          
          // Start GPT timer
          session.timers.gpt.reset();
          
          await gptService.completion(session.transcriptionBuffer);
          session.transcriptionBuffer = ''; // Clear buffer after processing
        }
      }
    });
    
    // Add connection_failed handler
    transcriptionService.on('connection_failed', () => {
      logger.error(`Deepgram connection failed for call ${session.callSid}`.red);
    });
    
    // Handle GPT responses
    gptService.on('gptreply', async (gptReply, interactionCount) => {
      if (!session.active) return;
      
      logger.info(`GPT response (${interactionCount}): "${gptReply.partialResponse.substring(0, 50)}..."`.green);
      
      // Record GPT time
      session.currentRound.gptTime = session.timers.gpt.elapsed();
      logger.info(`[TIMING] GPT processing time: ${session.currentRound.gptTime}ms`.cyan);
      
      logCurrentRoundTiming();
      
      // Start TTS timer
      session.timers.tts.reset();
      
      // Generate speech from GPT response
      await ttsService.generate(gptReply, interactionCount);
    });
    
    // Handle TTS speech generation
    ttsService.on('speech', (responseIndex, audio, label, interactionCount) => {
      if (!session.active) return;
      
      logger.info(`Speech generated (${interactionCount}): "${label.substring(0, 30)}..."`.blue);
      
      // Record TTS time
      session.currentRound.ttsTime = session.timers.tts.elapsed();
      
      // Record total round trip time
      const roundTripTime = session.timers.roundTrip.elapsed();
      
      logger.info(`[TIMING] TTS processing time: ${session.currentRound.ttsTime}ms, Total round trip: ${roundTripTime}ms`.cyan);
      
      logCurrentRoundTiming();
      
      // Create a complete round data object
      const roundData = {
        round: interactionCount,
        input: session.currentRound.input,
        transcriptionTime: session.currentRound.transcriptionTime,
        gptTime: session.currentRound.gptTime,
        ttsTime: session.currentRound.ttsTime,
        roundTripTime: roundTripTime
      };
      
      // Store complete metrics for this round
      session.metrics.rounds.push(roundData);
      
      // Debug log to confirm data was added
      logger.info(`[DEBUG] Added round ${interactionCount} to metrics. Total rounds: ${session.metrics.rounds.length}`.green);
      logger.info(`[DEBUG] Round data: ${JSON.stringify(roundData)}`.dim.green);
      
      // Send audio to Twilio
      streamService.buffer(responseIndex, audio);
    });
    
    // Track audio markers
    streamService.on('audiosent', (markLabel) => {
      session.marks.push(markLabel);
    });
    
  } catch (err) {
    console.error("Error in WebSocket connection:", err);
    cleanupSession(session);
  }
});

// Helper function to clean up resources when a call ends
function cleanupSession(session) {
  if (!session.active) return;
  
  logger.info(`Cleaning up session for call: ${session.callSid || 'unknown'}`);
  
  try {
    // Mark session as inactive
    session.active = false;
    
    // Close transcription service if exists
    if (session.services.transcriptionService) {
      // Add any necessary cleanup
    }
    
    // Clean up other services as needed
    
    // Remove from active sessions
    if (session.callSid) {
      activeSessions.delete(session.callSid);
    }
    
    // Log call duration
    const duration = Math.round((Date.now() - session.startTime) / 1000);
    logger.info(`Call duration: ${duration} seconds`.yellow);
    
    // Final check - log the rounds data again
    logger.info(`[FINAL DEBUG] Call ended. Total rounds collected: ${session.metrics.rounds.length}`.yellow);
    if (session.metrics.rounds.length > 0) {
      logger.info("[FINAL TIMING SUMMARY] Performance metrics by round:".magenta);
      session.metrics.rounds.forEach((round, index) => {
        logger.info(`Round ${round.round} (${index}): Input: "${round.input.substring(0, 30)}${round.input.length > 30 ? '...' : ''}"`.magenta);
        logger.info(`  Transcription: ${round.transcriptionTime}ms, GPT: ${round.gptTime}ms, TTS: ${round.ttsTime}ms, Total: ${round.roundTripTime}ms`.magenta);
      });
    }
  } catch (err) {
    logger.error("Error during session cleanup:", err);
  }
}

// Start the server
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`.green);
  logger.info(`WebSocket URL: wss://${WEBSOCKET_URL}/connection`.blue);
});