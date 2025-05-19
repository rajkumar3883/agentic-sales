require("colors");
const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");
const { Buffer } = require("node:buffer");
const EventEmitter = require("events");
const logger = require("../logger_conf.js");

class TranscriptionService extends EventEmitter {
  constructor() {
    super();
    this.deepgramClient = createClient(process.env.DEEPGRAM_API_KEY);
    this.keepAlive = null;
    this.isConnected = false;
    this.connectionClosed = false;

    // Establish live transcription connection
    this.dgConnection = this.setupDeepgram();
  }
  
  setupDeepgram() {
    try {
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
        if (this.isConnected && !this.connectionClosed) {
          try {
            console.log("deepgram: keepalive...");
            deepgram.keepAlive();
          } catch (err) {
            logger.error(`Deepgram keepalive error: ${err.message}`);
            this.stopKeepAlive();
          }
        } else {
          // Don't try to keep closed connections alive
          this.stopKeepAlive();
        }
      }, 10 * 1000); // send every 10 seconds

      deepgram.addListener(LiveTranscriptionEvents.Open, () => {
        console.log("deepgram: connected");
        this.isConnected = true;
        this.connectionClosed = false;

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
          this.handleDisconnection();
        });

        deepgram.addListener(LiveTranscriptionEvents.Error, (error) => {
          console.log("deepgram: error received");
          console.error(error);
          // Don't try to recover, just mark as closed
          this.handleDisconnection();
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
    } catch (err) {
      logger.error(`Failed to setup Deepgram: ${err.message}`);
      this.emit("connection_failed", err);
      return null;
    }
  }

  /**
   * Send the payload to Deepgram
   * @param {String} payload A base64 MULAW/8000 audio stream
   */
  send(payload) {
    if (!this.dgConnection) return;
    
    try {
      if (this.dgConnection.getReadyState() === 1) {
        this.dgConnection.send(Buffer.from(payload, "base64"));
      }
    } catch (err) {
      logger.error(`Error sending to Deepgram: ${err.message}`);
      // Consider the connection broken
      this.handleDisconnection();
    }
  }
  
  /**
   * Handle connection disconnection
   */
  handleDisconnection() {
    this.isConnected = false;
    this.connectionClosed = true;
    this.stopKeepAlive();
    this.emit("connection_closed");
  }
  
  /**
   * Stop the keep-alive interval
   */
  stopKeepAlive() {
    if (this.keepAlive) {
      clearInterval(this.keepAlive);
      this.keepAlive = null;
    }
  }

  /**
   * Close the connection and cleanup
   */
  close() {
    try {
      this.connectionClosed = true;
      this.isConnected = false;
      this.stopKeepAlive();
      
      if (this.dgConnection) {
        // Only try to finish if the connection appears to be active
        if (this.dgConnection.getReadyState() === 1) {
          try {
            this.dgConnection.finish();
          } catch (err) {
            logger.error(`Error finishing Deepgram connection: ${err.message}`);
          }
        }
        // Remove all event listeners
        this.dgConnection.removeAllListeners();
      }
    } catch (err) {
      logger.error(`Error closing transcription service: ${err.message}`);
    }
  }
}

module.exports = { TranscriptionService };
