require('dotenv').config();
const EventEmitter = require('events');
const fetch = require('node-fetch');

class ElevenLabsTTSService extends EventEmitter {
  constructor() {
    super();
    this.voiceId = process.env.ELEVENLABS_VOICE_ID || 'broqrJkktxd1CclKTudW';
  }

  async generate(gptReply, interactionCount) {
    console.log('ElevenLabs TTS in');
    const { partialResponseIndex, partialResponse } = gptReply;

    if (!partialResponse) {
      return;
    }

    console.log('Before ElevenLabs API call');
    console.log(gptReply);

    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg' // <-- Enables streaming
          },
          body: JSON.stringify({
            text: partialResponse,
            model_id: 'eleven_multilingual_v2',
            voice_settings: {
              stability: 0,
              similarity_boost: 0,
              use_speaker_boost: true,
              speed: 1.0
            }
          })
        }
      );

      if (!response.ok) {
        console.error('ElevenLabs TTS error:', await response.text());
        return;
      }

      // ✅ Emit the stream directly
      this.emit('speech-stream', {
        stream: response.body, // ReadableStream
        partialResponseIndex,
        partialResponse,
        interactionCount
      });

    } catch (err) {
      console.error('Error occurred in ElevenLabsTTSService:', err);
    }
  }
}

module.exports = { ElevenLabsTTSService };
