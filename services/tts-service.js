const { Buffer } = require('node:buffer');
const { Readable } = require('stream');
const EventEmitter = require('events');
const { ElevenLabsClient } = require('elevenlabs');

const elevenlabs = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });

class ElevenLabsTTSService extends EventEmitter {
  constructor(streamService) {
    super();
    this.streamService = streamService;
  }

  async generate(gptReply, interactionCount) {
    const { partialResponseIndex, partialResponse } = gptReply;
    if (!partialResponse) return;

    try {
      const stream = await elevenlabs.textToSpeech.convert(
        process.env.ELEVENLABS_VOICE_ID || "N2al4jd45e882svx17SU",
        {
          model_id: "eleven_multilingual_v2",
          output_format: "ulaw_8000",
          text: partialResponse,
          voice_settings:{
	        stability:.5,
	        similarity_boost:.8,
	        use_speaker_boost:1,
          },
        }
      );

      const audioBuffer = await this._streamToBuffer(stream);
      const base64String = audioBuffer.toString('base64');

      this.emit('speech', partialResponseIndex, base64String, partialResponse, interactionCount);
    } catch (err) {
      console.error("Error in ElevenLabs TTS:", err);
    }
  }

  // Helper to convert a ReadableStream to a Buffer
  async _streamToBuffer(readable) {
    const chunks = [];
    for await (const chunk of readable) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
}

module.exports = {
  ElevenLabsTTSService
};
