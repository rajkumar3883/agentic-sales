require('dotenv').config();
const { Buffer } = require('node:buffer');
const EventEmitter = require('events');
const fetch = require('node-fetch');
class ElevenLabsTTSService extends EventEmitter {
  constructor() {
    super();
    this.voiceId = 'bUTE2M5LdnqaUCd5tJB3'; // Default voice ID
  }

  async generate(gptReply, interactionCount) {
    console.log('ElevenLabs TTS in');
    const { partialResponseIndex, partialResponse } = gptReply;

    if (!partialResponse) {
      return;
    }
    console.log('before ElevenLabs streaming API call');
    console.log(gptReply);
    console.log(process.env.ELEVENLABS_API_KEY);

    
    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/R53sbipjIDDg9zf1H4wF/stream`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': "sk_3169168d7860aacb92dbabbf5d740d70e87dd9be50fa511c",
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg'
          },
          body: JSON.stringify({
            text: partialResponse.substr(0,100),
            model_id: 'eleven_multilingual_v2',
            output_format: "ulaw_8000",
            voice_settings: {
              stability: 0,
              similarity_boost: 0,
              use_speaker_boost: true,
              style: 0, // Optional
              speed: 1.0,
            },
          }),
        }
      );
      
      console.log('after ElevenLabs streaming API call');
     // Replace your current streaming handling code with this:
if (response.status === 200) {
  try {
    console.log('processing streaming response');
    
    // For collecting the entire audio
    const chunks = [];
    
    // node-fetch response.body is already a readable stream
    response.body.on('data', (chunk) => {
      // Add chunk to our array
      chunks.push(chunk);
      
      // Emit each chunk as it arrives if needed
      const chunkBase64 = Buffer.from(chunk).toString('base64');
      this.emit('speech_chunk', partialResponseIndex, chunkBase64, partialResponse, interactionCount);
    });
    
    response.body.on('end', () => {
      // Combine all chunks and emit the complete audio
      const completeAudioBuffer = Buffer.concat(chunks);
      const base64String = completeAudioBuffer.toString('base64');
      console.log("Complete base64String created");
      
      this.emit('speech', partialResponseIndex, base64String, partialResponse, interactionCount);
    });
    
    response.body.on('error', (err) => {
      console.error('Error in stream:', err);
    });
    
  } catch (err) {
    console.log('Error processing streaming response:');
    console.log(err);
  }
} else {
        console.log('ElevenLabs TTS streaming error:');
        console.log(await response.text());
      }
    } catch (err) {
      console.error('Error occurred in ElevenLabsTTSService');
      console.error(err);
    }
  }
}

module.exports = { ElevenLabsTTSService };