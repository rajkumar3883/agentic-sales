require('dotenv').config();
const { Buffer } = require('node:buffer');
const EventEmitter = require('events');
const fetch = require('node-fetch');
const { v4: uuid } = require('uuid');

class ElevenLabsTTSService extends EventEmitter {
  constructor() {
    super();
    this.voiceId = 'broqrJkktxd1CclKTudW'; // Default voice ID
  }

  async generate(gptReply, interactionCount) {
    console.log('ElevenLabs TTS in');
    const { partialResponseIndex, partialResponse } = gptReply;

    if (!partialResponse) {
      return;
    }
      console.log('befoer ElevenLabs api call');
      console.log(gptReply);
    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: partialResponse,
            model_id: 'eleven_multilingual_v2',
            voice_settings: {
              stability: 0,
              similarity_boost: 0,
              use_speaker_boost: true,
              speed: 1.0,
            },
          }),
        }
      );
console.log('after ElevenLabs api call');
      if (response.status === 200) {
          try {
         console.log('befoer ElevenLabs api call response.status'); 
          const audioArrayBuffer = await response.arrayBuffer();
          const base64String = Buffer.from(audioArrayBuffer).toString('base64');
          console.log("base64String",base64String)
          this.emit('speech', partialResponseIndex, base64String, partialResponse, interactionCount);
        } catch (err) {
          console.log(err);
        }
      } else {
        console.log('ElevenLabs TTS error:');
        console.log(await response.text());
      }
    } catch (err) {
      console.error('Error occurred in ElevenLabsTTSService');
      console.error(err);
    }
  }
}

module.exports = { ElevenLabsTTSService };
