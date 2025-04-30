require("colors");
const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");
const { Buffer } = require("node:buffer");
const EventEmitter = require("events");

class TranscriptionService extends EventEmitter {
  constructor() {
    super();
    this.deepgramClient = createClient(process.env.DEEPGRAM_API_KEY);
    this.keepAlive;

    // Establish live transcription connection
    this.dgConnection = this.setupDeepgram();
  }
  setupDeepgram() {
    const deepgram = this.deepgramClient.listen.live({
      encoding: "mulaw",
      sample_rate: 8000,
      language: "multi", // Or specify a single language like 'en' if needed
      model: "nova-3",
      punctuate: true,
      interim_results: true,
      endpointing: 200,
      utterance_end_ms: 1000,
    });

    // Keep connection alive by sending periodic keep-alive messages
    if (this.keepAlive) clearInterval(this.keepAlive);
    this.keepAlive = setInterval(() => {
      console.log("deepgram: keepalive...");
      deepgram.keepAlive();
    }, 10 * 1000); // send every 10 seconds

    deepgram.addListener(LiveTranscriptionEvents.Open, () => {
      console.log("deepgram: connected");

      deepgram.addListener(LiveTranscriptionEvents.Transcript, (data) => {
        console.log("deepgram: transcript received");

        let parsedData;

        if (typeof data === "string") {
          try {
            parsedData = JSON.parse(data);
          } catch (err) {
            console.error("Failed to parse transcription data:", err);
            return; // Stop if parsing fails
          }
        } else if (typeof data === "object") {
          parsedData = data;
        } else {
          console.error("Unexpected data type from Deepgram:", typeof data);
          return;
        }

        try {
          const alternatives = parsedData.channel?.alternatives || [];
          const transcriptText = alternatives[0]?.transcript || "";

          if (transcriptText.trim().length === 0) return;

          console.log("Transcription text:", transcriptText);

          // Format data to match what app.js expects
          const formattedData = {
            text: transcriptText,
            isFinal: parsedData.is_final === true,
            speechFinal:
              parsedData.speech_final === true ||
              parsedData.utterance_end === true,
            utteranceEnd: parsedData.utterance_end === true,
          };

          this.emit("transcription", formattedData); // Emit the formatted data
        } catch (err) {
          console.error("Error accessing transcript:", err);
        }

        console.log("ws: transcript sent to client");
      });

      deepgram.addListener(LiveTranscriptionEvents.Close, () => {
        console.log("deepgram: disconnected");
        clearInterval(this.keepAlive);
        deepgram.finish();
      });

      deepgram.addListener(LiveTranscriptionEvents.Error, (error) => {
        console.log("deepgram: error received");
        console.error(error);
      });

      deepgram.addListener(LiveTranscriptionEvents.Warning, (warning) => {
        console.log("deepgram: warning received");
        console.warn(warning);
      });

      deepgram.addListener(LiveTranscriptionEvents.Metadata, (data) => {
        console.log("deepgram: metadata received");
        console.log("ws: metadata sent to client");
        console.log("ws: metadata Metadata to client..", data);
        this.emit("metadata", data); // Emit metadata to your application
      });
    });

    return deepgram;
  }

  /**
   * Send the payload to Deepgram
   * @param {String} payload A base64 MULAW/8000 audio stream
   */
  send(payload) {
    if (this.dgConnection.getReadyState() === 1) {
      this.dgConnection.send(Buffer.from(payload, "base64"));
    }
  }

  /**
   * Close the connection and cleanup
   */
  close() {
    if (this.dgConnection) {
      this.dgConnection.finish();
      clearInterval(this.keepAlive);
    }
  }
}

module.exports = { TranscriptionService };
