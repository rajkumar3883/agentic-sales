require("dotenv").config();
require("colors");
const express = require("express");
const ExpressWs = require("express-ws");
const cors = require("cors");
const { StreamService } = require("./services/stream-service");
const { TranscriptionService } = require("./services/transcription-service");
const { ElevenLabsTTSService } = require("./services/tts-service");
const { ExternalGptService } = require("./services/external-gpt-service");
const { recordingService } = require("./services/recording-service");
const { makeOutBoundCall } = require("./scripts/outbound-call.js");
const VoiceResponse = require("twilio").twiml.VoiceResponse;
const logger = require("./logger_conf.js");
//redis
const { setKey, getKey, deleteKey } = require("./services/redis-service.js");
const bodyParser = require("body-parser");
const app = express();
ExpressWs(app);
//
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
const PORT = process.env.PORT || 3000;
const WEBSOCKET_URL = process.env.SERVER;

// Active call sessions store
const activeSessions = new Map();
// Store CallerDetails for each call session
const callerDetailsStore = new Map();

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
const logTimingMetrics = (stage, metrics) => {
  const formattedMetrics = Object.entries(metrics)
    .map(([key, value]) => `${key}: ${value}ms`)
    .join(", ");

  logger.info(
    `[TIMING][Call: ${session.callSid}][Round: ${session.currentRound.interactionCount}][${stage}] ${formattedMetrics}`
  );
  console.log(
    `[TIMING][Call: ${session.callSid}][Round: ${session.currentRound.interactionCount}][${stage}]`
      .cyan,
    formattedMetrics
  );
};
// Function to save complete round metrics when a round finishes
const saveRoundMetrics = () => {
  // Calculate total round trip time
  const totalTime =
    session.currentRound.transcriptionTime +
    session.currentRound.gptTime +
    session.currentRound.ttsTime;

  // Set end time for this round
  session.currentRound.endTime = Date.now();
  session.currentRound.totalRoundTripTime = totalTime;

  // Create a complete metrics object for the round
  const roundMetrics = {
    ...session.currentRound,
    timestamp: new Date().toISOString(),
    actualRoundTripTime:
      session.currentRound.endTime - session.currentRound.startTime,
  };

  // Add to the session metrics history
  session.metrics.rounds.push(roundMetrics);

  // Log the complete round metrics
  logTimingMetrics("COMPLETE", {
    transcription: session.currentRound.transcriptionTime,
    gpt: session.currentRound.gptTime,
    tts: session.currentRound.ttsTime,
    calculated_total: totalTime,
    actual_total: roundMetrics.actualRoundTripTime,
  });

  // Store in Redis for later analysis
  const metricsKey = `metrics_${session.callSid}_round_${session.currentRound.interactionCount}`;
  setKey(metricsKey, JSON.stringify(roundMetrics), 86400); // Store for 24 hours

  // Reset for next round
  session.metrics.lastInteractionStartTime = null;
};
// Simple route to store data in Redis
app.post("/api/redis/set", async (req, res) => {
  console.log("in set key...");
  try {
    const { key, value, ttl } = req.body;
    console.log("key", key);
    if (!key || !value) {
      return res.status(400).json({
        success: false,
        error: "Key and value are required",
      });
    }

    //await redisService.set(key, value, ttl);
    await setKey(key, value);
    // res.send(`Key '${key}' cached.`);

    res.json({
      success: true,
      message: "Data stored successfully",
      key: key,
    });
  } catch (error) {
    logger.error("Failed to store data in Redis:", error);
    res.status(500).json({
      success: false,
      error: "Failed to store data",
    });
  }
});
// Optional: Route to get data
app.get("/api/redis/get/:key", async (req, res) => {
  try {
    const key = req.params.key;
    const value = await getKey(key);

    if (value === null) {
      return res.status(404).json({
        success: false,
        error: "Key not found",
      });
    }

    res.json({
      success: true,
      data: value,
    });
  } catch (error) {
    logger.error("Failed to get data from Redis:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get data",
    });
  }
});
// Optional: Route to delete data
app.delete("/api/redis/delete/:key", async (req, res) => {
  try {
    const key = req.params.key;
    await deleteKey(key);

    res.json({
      success: true,
      message: "Data deleted successfully",
    });
  } catch (error) {
    logger.error("Failed to delete data from Redis:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete data",
    });
  }
});
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
app.post("/makecall", async (req, res) => {
  console.log("req.body", req.body);
  const {
    phoneNumber,
    leadName,
    leadId,
    aiModel,
    ttsService,
    promptDetails,
    policyDetails,
  } = req.body;
  if (!phoneNumber) {
    return res.status(400).send("Phone number is required");
  }
  if (!leadName) {
    return res.status(400).send("Lead Name is required");
  }
  if (!leadId) {
    return res.status(400).send("Lead Id is required");
  }
  if (!promptDetails.id) {
    return res.status(400).send("Prompt Id is required");
  }
  const CallerDetails = {
    phoneNumber: phoneNumber,
    leadName: leadName,
    leadId: leadId,
    aiModel: aiModel,
    ttsService: ttsService,
    promptId: "prompt:" + promptDetails.id,
    policyId: policyDetails?.id || null,
    //"promptDetails": promptDetails,
    //"policyDetails": policyDetails,
    timestamp: req.body.timestamp,
  };
  console.log(CallerDetails);
  logger.info("Making outbound call to:", phoneNumber);
  try {
    // Store CallerDetails temporarily with a callback ID
    const callbackKey = `callback_${leadId}_${Date.now()}`;
    await setKey(callbackKey, JSON.stringify(CallerDetails), 3600); // Store for 1 hour

    // Pass the callback key to the outbound call
    const callResult = await makeOutBoundCall({
      ...CallerDetails,
      callbackKey: callbackKey,
    });

    res.json({
      success: true,
      message: `Call initiated to ${phoneNumber}`,
      callbackKey: callbackKey,
    });
  } catch (err) {
    logger.error("Failed to make call:", err);
    res.status(500).json({
      success: false,
      error: `Failed to make call: ${err.message}`,
    });
  }
});

// Handle incoming Twilio calls
app.post("/incoming", async (req, res) => {
  console.log("incoming called...");
  logger.info("Incoming call received");

  try {
    const response = new VoiceResponse();
    const connect = response.connect();
    // Get Call Parameters from Twilio
    const callSid = req.body.CallSid;
    const fromNumber = req.body.From;
    const toNumber = req.body.To;
    console.log("in try before callkey");
    console.log("req_body", req.body);
    //console.log("query_pass",req.query);
    console.log("call_ipddd", req.query.callbackKey);
    const callbackKey = req.query.callbackKey; // Pass this in outbound call parameters
    if (callbackKey) {
      console.log("in try in callkey");
      const callerDetailsJson = await getKey(callbackKey);
      if (callerDetailsJson) {
        console.log("in_callerDetailsJson_callkey", callerDetailsJson);
        const callerDetails = JSON.parse(callerDetailsJson);
        console.log("before setting to callerDetailsStore.set");
        callerDetailsStore.set(callSid, callerDetails);
        console.log("after setting to callerDetailsStore.set");
        logger.info(
          `Retrieved CallerDetails for CallSid: ${callSid}`,
          callerDetailsJson
        );
      }
    }
    console.log("before connection call");
    console.log("callSid", callSid);
    console.log("callSid_from", fromNumber);
    console.log("callSid_to", toNumber);
    console.log("WEBSOCKET_URL", WEBSOCKET_URL);
    console.log(`wss://${WEBSOCKET_URL}/connection?callSid=${callSid}`);
    // Use the environment variable for the WebSocket URL
    const wsUrl = `wss://${WEBSOCKET_URL}/connection?callSid=${callSid}`;
    console.log("after wsurl");
    logger.info(`Connecting call to WebSocket: ${wsUrl}`);
    console.log("before connect sterwma..");
    connect.stream({ url: wsUrl });
    console.log("after connect sterwma..");
    res.type("text/xml");
    res.send(response.toString());
    console.log("aftersend sterwma..");
  } catch (err) {
    console.error("Error handling incoming call:", err);
    res.status(500).send("Error handling call");
  }
});

// WebSocket connection endpoint for Twilio Media Streams
app.ws("/connection", (ws, req) => {
  console.log("in connection...");
  // Track connection state and resources
  const session = {
    streamSid: null,
    callSid: null,
    services: {},
    marks: [],
    active: true,
    startTime: Date.now(),
    transcriptionBuffer: "",
    timers: {
      transcription: createTimer(),
      gpt: createTimer(),
      tts: createTimer(),
      roundTrip: createTimer(),
    },
    metrics: {
      rounds: [],
      lastInteractionStartTime: null,
    },
    currentRound: {
      input: "",
      transcriptionTime: 0,
      gptTime: 0,
      ttsTime: 0,
      interactionCount: 0,
      startTime: null,
      endTime: null,
    },
    callerDetails: {},
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
    let callSid = null;
    // Handle incoming WebSocket messages
    ws.on("message", async function (data) {
      try {
        const msg = JSON.parse(data);

        if (msg.event === "start") {
          session.streamSid = msg.start.streamSid;
          session.callSid = msg.start.callSid;

          activeSessions.set(session.callSid, session);
          // Retrieve caller details
          const callerDetails = callerDetailsStore.get(session.callSid);

          if (callerDetails) {
            logger.info(
              `Retrieved CallerDetails for WebSocket CallSid: ${callSid}`
            );
            // Process with caller details
            session.callerDetails = callerDetails;
          }
          console.log("afgetete_ee", callerDetails);

          logger.info(
            `Call started: ${session.callSid} (Stream: ${session.streamSid})`
          );

          streamService.setStreamSid(session.streamSid);
          gptService.registerSession(session.callSid, callerDetails);

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
          // Log transcription time immediately
          logger.info(
            `[TIMING][Call: ${session.callSid}] Transcription processing time: ${transcriptionTime}ms`
          );

          session.currentRound = {
            input: session.transcriptionBuffer,
            transcriptionTime: transcriptionTime,
            interactionCount: session.metrics.rounds.length + 1,
            gptTime: 0,
            ttsTime: 0,
          };
          logger.info("buffer_transcription:", session.transcriptionBuffer);
          session.timers.gpt.reset(); // Make sure to reset GPT timer before
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
          session.timers.gpt.reset(); //
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
        `[TIMING][Call: ${session.callSid}] GPT processing time: ${session.currentRound.gptTime}ms`
      );

      logger.info(
        `[TIMING] GPT processing time: ${session.currentRound.gptTime}ms`
      );
      session.timers.tts.reset();
      await ttsService.generate(gptReply, interactionCount);
    });

    ttsService.on(
      "speech_ready",
      (requestId, ttsTime, partialResponse, interactionCount) => {
        if (!session.active) return;

        session.currentRound.ttsTime = ttsTime;

        // Log TTS time
        logger.info(
          `[TIMING][Call: ${session.callSid}][Round: ${session.currentRound.interactionCount}][TTS] Processing time: ${session.currentRound.ttsTime}ms`
        );

        // Now that all three services have completed, save the complete round metrics
        saveRoundMetrics();
      }
    );
  } catch (error) {
    console.error("Error handling WebSocket:", error);
  }
});

function cleanupSession(session) {
  if (session.metrics.rounds.length > 0) {
    // Calculate average times
    const avgTranscription =
      session.metrics.rounds.reduce(
        (sum, round) => sum + round.transcriptionTime,
        0
      ) / session.metrics.rounds.length;
    const avgGpt =
      session.metrics.rounds.reduce((sum, round) => sum + round.gptTime, 0) /
      session.metrics.rounds.length;
    const avgTts =
      session.metrics.rounds.reduce((sum, round) => sum + round.ttsTime, 0) /
      session.metrics.rounds.length;
    const avgTotal =
      session.metrics.rounds.reduce(
        (sum, round) => sum + round.actualRoundTripTime,
        0
      ) / session.metrics.rounds.length;

    const callDuration = Date.now() - session.startTime;

    // Log detailed summary
    logger.info(
      `[TIMING][Call: ${session.callSid}][SUMMARY] Call duration: ${callDuration}ms, Rounds: ${session.metrics.rounds.length}`
    );
    logger.info(
      `[TIMING][Call: ${
        session.callSid
      }][SUMMARY] Avg Services - Transcription: ${avgTranscription.toFixed(
        2
      )}ms, GPT: ${avgGpt.toFixed(2)}ms, TTS: ${avgTts.toFixed(2)}ms`
    );
    logger.info(
      `[TIMING][Call: ${
        session.callSid
      }][SUMMARY] Avg Round Trip: ${avgTotal.toFixed(2)}ms`
    );

    // Store call summary in Redis
    const summaryKey = `call_summary_${session.callSid}`;
    const summary = {
      callSid: session.callSid,
      callDuration,
      roundCount: session.metrics.rounds.length,
      averages: {
        transcription: avgTranscription,
        gpt: avgGpt,
        tts: avgTts,
        roundTrip: avgTotal,
      },
      callerDetails: session.callerDetails,
      timestamp: new Date().toISOString(),
    };

    setKey(summaryKey, JSON.stringify(summary), 604800); // Store for 7 days
  }

  session.active = false;
  activeSessions.delete(session.callSid);
}
//
// 1. Get metrics for a specific call
app.get("/api/metrics/call/:callSid", async (req, res) => {
  try {
    const callSid = req.params.callSid;

    // First try to get active session
    const activeSession = activeSessions.get(callSid);
    if (activeSession) {
      return res.json({
        success: true,
        active: true,
        data: {
          callSid,
          startTime: new Date(activeSession.startTime).toISOString(),
          duration: Date.now() - activeSession.startTime,
          rounds: activeSession.metrics.rounds,
          callerDetails: activeSession.callerDetails,
        },
      });
    }

    // If not active, try to get summary from Redis
    const summaryKey = `call_summary_${callSid}`;
    const summaryJson = await getKey(summaryKey);

    if (summaryJson) {
      const summary = JSON.parse(summaryJson);

      // Try to get individual rounds for detailed data
      const roundsData = [];
      try {
        // If you have a way to get keys by pattern
        const roundKeys = await getKeysByPattern(`metrics_${callSid}_round_*`);
        if (roundKeys && roundKeys.length > 0) {
          const roundDataPromises = roundKeys.map((key) => getKey(key));
          const roundJsonArray = await Promise.all(roundDataPromises);

          // Parse and sort by interaction count
          roundsData.push(
            ...roundJsonArray
              .map((json) => JSON.parse(json))
              .sort((a, b) => a.interactionCount - b.interactionCount)
          );
        }
      } catch (err) {
        logger.warn(
          `Could not retrieve detailed round data for call ${callSid}:`,
          err
        );
      }

      return res.json({
        success: true,
        active: false,
        data: {
          ...summary,
          rounds: roundsData,
        },
      });
    }

    res.status(404).json({
      success: false,
      error: "Call metrics not found",
    });
  } catch (error) {
    logger.error("Failed to get call metrics:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve call metrics",
    });
  }
});

// 2. Get active calls with metrics
app.get("/api/metrics/active", async (req, res) => {
  try {
    const activeCallData = [];

    // Convert the Map to an array and extract the relevant info
    for (const [callSid, session] of activeSessions.entries()) {
      activeCallData.push({
        callSid,
        startTime: new Date(session.startTime).toISOString(),
        duration: Date.now() - session.startTime,
        rounds: session.metrics.rounds,
        currentRound: session.currentRound,
        callerDetails: session.callerDetails,
      });
    }

    res.json({
      success: true,
      data: activeCallData,
    });
  } catch (error) {
    logger.error("Failed to get active call metrics:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve active call metrics",
    });
  }
});

// 3. Get recent completed calls
app.get("/api/metrics/recent", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10; // Default to 10 recent calls

    // Try to get summaries from Redis
    let recentCalls = [];

    try {
      // If you have a way to get keys by pattern
      const summaryKeys = await getKeysByPattern(`call_summary_*`);

      if (summaryKeys && summaryKeys.length > 0) {
        // Get the most recent calls by sorting keys or timestamps
        const summaryPromises = summaryKeys
          .slice(0, limit * 2)
          .map((key) => getKey(key)); // Get more than we need in case some fail
        const summaryJsonArray = await Promise.all(summaryPromises);

        // Parse and filter valid JSON
        recentCalls = summaryJsonArray
          .filter((json) => json) // Filter out null or undefined
          .map((json) => {
            try {
              return JSON.parse(json);
            } catch (e) {
              return null;
            }
          })
          .filter((data) => data) // Filter out failed parses
          .sort((a, b) => {
            // Sort by timestamp if available, otherwise by any date property
            const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            return bTime - aTime; // Most recent first
          })
          .slice(0, limit); // Take only what we need
      }
    } catch (err) {
      logger.warn("Could not retrieve recent calls from Redis:", err);
    }

    res.json({
      success: true,
      data: recentCalls,
    });
  } catch (error) {
    logger.error("Failed to get recent call metrics:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve recent call metrics",
    });
  }
});

//
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
