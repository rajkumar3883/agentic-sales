require("dotenv").config();
require("colors");
//console.log("deep_gram", process.env.DEEPGRAM_API_KEY); // Confirm Deepgram API key presence
const express = require("express");
const ExpressWs = require("express-ws");
const { StreamService } = require("./services/stream-service");
const { TranscriptionService } = require("./services/transcription-service");
const { ElevenLabsTTSService } = require("./services/tts-service");
const { ExternalGptService } = require("./services/external-gpt-service");
const { recordingService } = require("./services/recording-service");
const { makeOutBoundCall } = require("./scripts/outbound-call.js");
const VoiceResponse = require("twilio").twiml.VoiceResponse;
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
    elapsed: function () {
      return Date.now() - this.start;
    },
    reset: function () {
      this.start = Date.now();
      return this;
    },
  };
  return timer;
};

// Home page with call form
app.get("/", async (req, res) => {
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
app.get("/makecall", (req, res) => {
  const phoneNumber = req.query.phonenumber;
  if (!phoneNumber) {
    return res.status(400).send("Phone number is required");
  }

  logger.info("Making outbound call to:", phoneNumber);
  makeOutBoundCall(phoneNumber)
    .then(() => {
      res.send(
        `Call initiated to ${phoneNumber}. Please wait for the connection.`
      );
    })
    .catch((err) => {
      console.error("Failed to make call:", err);
      res.status(500).send(`Failed to make call: ${err.message}`);
    });
});

// Handle incoming Twilio calls
app.post("/incoming", (req, res) => {
  logger.info("Incoming call received");

  try {
    const response = new VoiceResponse();
    const connect = response.connect();

    // Use the environment variable for the WebSocket URL
    const wsUrl = `wss://${WEBSOCKET_URL}/connection`;
    logger.info(`Connecting call to WebSocket: ${wsUrl}`);

    connect.stream({ url: wsUrl });

    res.type("text/xml");
    res.send(response.toString());
  } catch (err) {
    console.error("Error handling incoming call:", err);
    res.status(500).send("Error handling call");
  }
});

// WebSocket connection endpoint for Twilio Media Streams
app.ws("/connection", (ws) => {
  logger.info("New WebSocket connection established");

  // Track connection state and resources
  const session = {
    streamSid: null,
    callSid: null,
    services: {},
    marks: [],
    active: true,
    startTime: Date.now(),
    transcriptionBuffer: "", // Buffer to accumulate finalizing transcription chunks
    timers: {
      transcription: createTimer(),
      gpt: createTimer(),
      tts: createTimer(),
      roundTrip: createTimer(),
    },
    metrics: {
      rounds: [],
    },
    currentRound: {
      input: "",
      transcriptionTime: 0,
      gptTime: 0,
      ttsTime: 0,
      interactionCount: 0,
    },
  };

  try {
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
      ttsService,
    };

    // Handle incoming WebSocket messages
    ws.on("message", async function (data) {
      try {
        const msg = JSON.parse(data);

        if (msg.event === "start") {
          session.streamSid = msg.start.streamSid;
          session.callSid = msg.start.callSid;

          activeSessions.set(session.callSid, session);

          logger.info(
            `Call started: ${session.callSid} (Stream: ${session.streamSid})`
          );

          streamService.setStreamSid(session.streamSid);
          gptService.registerSession(session.callSid);

          session.timers.roundTrip.reset();
          session.timers.gpt.reset();
          session.currentRound = {
            input: "welcome",
            transcriptionTime: 0,
            interactionCount: 0,
            gptTime: 0,
            ttsTime: 0,
          };

          const welcome = await gptService.completion(" ");

          session.currentRound.gptTime = session.timers.gpt.elapsed();
          logger.info(
            `[TIMING] Welcome message - GPT: ${session.currentRound.gptTime}ms`
          );

          session.timers.tts.reset();
        } else if (msg.event === "media") {
          // Handle incoming audio and pass to transcription service
          transcriptionService.send(msg.media.payload);
        } else if (msg.event === "mark") {
          const label = msg.mark.name;
          logger.info(
            `Audio mark received (${msg.sequenceNumber}): ${label}`.dim.red
          );
          session.marks = session.marks.filter((m) => m !== label);
        } else if (msg.event === "stop") {
          logger.info(`Call ended: ${session.callSid}`.yellow);
          cleanupSession(session);
        }
      } catch (err) {
        console.error("Error processing WebSocket message:", err);
      }
    });

    ws.on("close", () => {
      logger.info(
        `WebSocket connection closed for call: ${session.callSid || "unknown"}`
      );
      cleanupSession(session);
    });

    transcriptionService.on("transcription", async (data) => {
      if (!session.active) return;

      if (data.utteranceEnd) {
        logger.info("utteranceEnd_data", data);
        if (session.transcriptionBuffer.trim().length > 0) {
          session.timers.roundTrip.reset();

          const transcriptionTime = session.timers.transcription.elapsed();
          logger.info(
            `[TIMING] Transcription processing time: ${transcriptionTime}ms`
          );

          session.currentRound = {
            input: session.transcriptionBuffer,
            transcriptionTime: transcriptionTime,
            interactionCount: session.metrics.rounds.length + 1,
            gptTime: 0,
            ttsTime: 0,
          };
          logger.info("buffer_transcription:", session.transcriptionBuffer);

          await gptService.completion(session.transcriptionBuffer);
          session.transcriptionBuffer = "";
        }
        return;
      }

      if (!data.text || data.text.trim().length === 0) return;

      if (session.transcriptionBuffer.length === 0) {
        session.timers.transcription.reset();
      }

      logger.info(`Transcription chunk: "${data.text}"`.yellow);

      if (session.marks.length > 0 && data.text.trim().length > 5) {
        logger.info("User interruption detected, clearing audio stream".yellow);
        ws.send(
          JSON.stringify({ streamSid: session.streamSid, event: "clear" })
        );
      }

      if (data.isFinal) {
        session.transcriptionBuffer += ` ${data.text}`;

        if (data.speechFinal) {
          logger.info(
            `Processing final transcription: "${session.transcriptionBuffer}"`
              .green
          );

          session.timers.roundTrip.reset();
          const transcriptionTime = session.timers.transcription.elapsed();
          logger.info(
            `[TIMING] Transcription processing time: ${transcriptionTime}ms`
          );

          session.currentRound = {
            input: session.transcriptionBuffer,
            transcriptionTime: transcriptionTime,
            interactionCount: session.metrics.rounds.length + 1,
            gptTime: 0,
            ttsTime: 0,
          };

          await gptService.completion(session.transcriptionBuffer);
          session.transcriptionBuffer = "";
        }
      }
    });

    transcriptionService.on("connection_failed", () => {
      console.error(`Deepgram connection failed for call ${session.callSid}`);
    });

    gptService.on("gptreply", async (gptReply, interactionCount) => {
      if (!session.active) return;

      session.currentRound.gptTime = session.timers.gpt.elapsed();
      logger.info(
        `[TIMING] GPT processing time: ${session.currentRound.gptTime}ms`
      );

      session.timers.tts.reset();

      await ttsService.generate(gptReply, interactionCount);
    });

    ttsService.on("speech_ready", (speechUrl) => {
      logger.info(`TTS audio ready for playback: ${speechUrl}`);
    });
  } catch (error) {
    console.error("Error handling WebSocket:", error);
  }
});

function cleanupSession(session) {
  session.active = false;
  activeSessions.delete(session.callSid);
}

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
