const { Buffer } = require('node:buffer');
const EventEmitter = require('events');
const { ElevenLabsClient } = require('elevenlabs');

const elevenlabs = new ElevenLabsClient({ 
  apiKey: process.env.ELEVENLABS_API_KEY // Should use environment variable
});

class ElevenLabsTTSService extends EventEmitter {
  constructor(streamService) {
    super();
    this.streamService = streamService;
    this.chunkCounter = 0;
    this.oldText = "";
  }

  async generate(gptReply, interactionCount) {
    const { partialResponseIndex, partialResponse } = gptReply;
    if (!partialResponse) return;
    console.log("oldText",this.oldText)
    if (partialResponse.substring(0, 200) == this.oldText) {
      console.log("got same message again for tts returning..");     
      return;
    }
    this.oldText = partialResponse.substring(0, 200);
    console.log("Processing TTS for:", partialResponse.substring(0, 200) + "...");
    
    try {
      // Optimize TTS settings for speed
      const audioStream = await elevenlabs.textToSpeech.convertAsStream(
        "R53sbipjIDDg9zf1H4wF",
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

      // Send each chunk as it arrives
      let chunkCounter = 0;
      const markId = `tts_${Date.now()}_${interactionCount}`;
      
      for await (const chunk of audioStream) {
        chunkCounter++;
        const chunkBase64 = Buffer.from(chunk).toString('base64');
        
        // Send each chunk immediately to the stream service
        this.streamService.sendAudioChunk(
          partialResponseIndex, 
          chunkBase64, 
          `${markId}_chunk_${chunkCounter}`,
          chunkCounter === 1 // isFirst flag
        );
        
        // Also emit the chunk event if needed elsewhere
        this.emit('speech_chunk', partialResponseIndex, chunkBase64, partialResponse, interactionCount);
      }
      
      // Signal completion of this audio segment
      this.emit('speech_complete', partialResponseIndex, markId, partialResponse, interactionCount);
      
    } catch (err) {
      console.error("Error in ElevenLabs TTS:", err);
      // Emit error event so other components can respond
      this.emit('tts_error', err, partialResponseIndex, interactionCount);
    }
  }
}

module.exports = {
  ElevenLabsTTSService
};