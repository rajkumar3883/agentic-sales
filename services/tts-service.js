const { Buffer } = require("node:buffer");
const EventEmitter = require("events");
const { ElevenLabsClient } = require("elevenlabs");
const logger = require("../logger_conf.js"); // Adjust path as needed
const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY, // Should use environment variable
});

class ElevenLabsTTSService extends EventEmitter {
  constructor(streamService) {
    super();
    this.streamService = streamService;
    this.chunkCounter = 0;
    this.oldText = "";
    this.timers = new Map(); // To track timing for each TTS request
  }

  async generate(gptReply, interactionCount) {
    const { partialResponseIndex, partialResponse } = gptReply;
    if (!partialResponse) return;

    // Start timing for this TTS request
    const startTime = Date.now();
    const requestId = `tts_${partialResponseIndex}_${interactionCount}`;
    this.timers.set(requestId, startTime);

    logger.info(
      `[TIMING] Starting TTS generation for interaction ${interactionCount}, index ${partialResponseIndex}`
    );

    // Check for duplicates
    if (partialResponse.substring(0, 100) == this.oldText) {
      console.log("got same message again for tts returning..");
      // Even for duplicates, we should emit the timing for tracking
      const elapsedTime = 0; // No actual processing time for duplicates
      this.emit(
        "speech_ready",
        requestId,
        elapsedTime,
        partialResponse,
        interactionCount
      );

      return;
    }
    this.oldText = partialResponse.substring(0, 100);
    try {
      // Optimize TTS settings for speed
      // Log the start of the actual API call
      logger.info(
        `[TIMING] Calling ElevenLabs API for interaction ${interactionCount}`
      );

      const audioStream = await elevenlabs.textToSpeech.convertAsStream(
        process.env.ELEVENLABS_VOICE_ID,
        {
          model_id: "eleven_multilingual_v2",
          output_format: "ulaw_8000",
          text: partialResponse,
          voice_settings: {
            stability: 0.3, // Lower for faster generation
            similarity_boost: 0.5, // Lower for faster generation
            use_speaker_boost: true,
          },
        }
      );
      // Log when we receive the stream
      logger.info(
        `[TIMING] Received audio stream from ElevenLabs for interaction ${interactionCount}`
      );

      // Send each chunk as it arrives
      let chunkCounter = 0;
      const markId = `tts_${Date.now()}_${interactionCount}`;
      const firstChunkTime = Date.now();
      let lastChunkTime;

      for await (const chunk of audioStream) {
        chunkCounter++;
        lastChunkTime = Date.now();
        const chunkBase64 = Buffer.from(chunk).toString("base64");

        // Send each chunk immediately to the stream service
        this.streamService.sendAudioChunk(
          partialResponseIndex,
          chunkBase64,
          `${markId}_chunk_${chunkCounter}`,
          chunkCounter === 1 // isFirst flag
        );
        // Log the first chunk timing
        if (chunkCounter === 1) {
          const timeToFirstChunk = lastChunkTime - startTime;
          logger.info(
            `[TIMING] First TTS chunk received after ${timeToFirstChunk}ms for interaction ${interactionCount}`
          );
        }
        // Also emit the chunk event if needed elsewhere
        this.emit(
          "speech_chunk",
          partialResponseIndex,
          chunkBase64,
          partialResponse,
          interactionCount
        );
      }
      // Calculate and log timing metrics
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const streamingTime = lastChunkTime ? lastChunkTime - firstChunkTime : 0;

      logger.info(
        `[TIMING] TTS complete for interaction ${interactionCount}. Total time: ${totalTime}ms, Streaming time: ${streamingTime}ms, Chunks: ${chunkCounter}`
      );

      // Signal completion of this audio segment
      this.emit(
        "speech_complete",
        partialResponseIndex,
        markId,
        partialResponse,
        interactionCount
      );
      // Emit our new speech_ready event with timing information
      this.emit(
        "speech_ready",
        requestId,
        totalTime,
        partialResponse,
        interactionCount
      );

      // Clean up the timer
      this.timers.delete(requestId);

      return totalTime; // Return the total processing time
    } catch (err) {
      // Calculate timing even for errors
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      console.error(`Error in ElevenLabs TTS (${totalTime}ms):`, err);
      logger.error(
        `[TIMING] TTS error after ${totalTime}ms for interaction ${interactionCount}:`,
        err
      );

      this.emit("tts_error", err, partialResponseIndex, interactionCount);
      // Clean up the timer
      this.timers.delete(requestId);

      return null;
    }
  }
}

module.exports = {
  ElevenLabsTTSService,
};
