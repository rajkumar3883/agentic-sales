require('colors');
const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const { Buffer } = require('node:buffer');
const EventEmitter = require('events');

class TranscriptionService extends EventEmitter {
  constructor() {
    super();
    const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
    this.dgConnection = deepgram.listen.live({
      encoding: 'mulaw',
      sample_rate: '8000',
      language: 'multi',
      model: 'nova-3',
      punctuate: true,
      interim_results: true,
      endpointing: 200,
      utterance_end_ms: 300
    });

    this.speechFinal = true; // used to determine if we have seen speech_final=true indicating that deepgram detected a natural pause in the speakers speech.

    this.dgConnection.on(LiveTranscriptionEvents.Open, () => {
      this.dgConnection.on(LiveTranscriptionEvents.Transcript, (transcriptionEvent) => {
        const alternatives = transcriptionEvent.channel?.alternatives;
        let text = '';
        if (alternatives) {
          text = alternatives[0]?.transcript;
        }

        // If we receive an UtteranceEnd, emit a special flag to indicate speech has ended
        if (transcriptionEvent.type === 'UtteranceEnd') {
          console.log('UtteranceEnd received, emitting utterance end event'.yellow);
          this.emit('transcription', {
            text: '',
            isFinal: true,
            speechFinal: true,
            utteranceEnd: true
          });
          return;
        }

        // Stream every piece of text immediately with appropriate flags
        if (text.trim().length > 0) {
          console.log(`Streaming text: "${text}" is_final: ${transcriptionEvent.is_final}, speech_final: ${transcriptionEvent.speech_final}`.cyan);
          this.emit('transcription', {
            text: text,
            isFinal: transcriptionEvent.is_final === true,
            speechFinal: transcriptionEvent.speech_final === true,
            utteranceEnd: false
          });
        }

        // Track speech_final status
        if (transcriptionEvent.speech_final === true) {
          this.speechFinal = true;
          console.log('Speech marked as final'.green);
        } else if (transcriptionEvent.is_final === true) {
          // Reset speechFinal if we receive final text that isn't marked as speech_final
          this.speechFinal = false;
        }
      });

      this.dgConnection.on(LiveTranscriptionEvents.Error, (error) => {
        console.error('STT -> deepgram error');
        console.error(error);
      });

      this.dgConnection.on(LiveTranscriptionEvents.Warning, (warning) => {
        console.error('STT -> deepgram warning');
        console.error(warning);
      });

      this.dgConnection.on(LiveTranscriptionEvents.Metadata, (metadata) => {
        console.error('STT -> deepgram metadata');
        console.error(metadata);
      });

      this.dgConnection.on(LiveTranscriptionEvents.Close, () => {
        console.log('STT -> Deepgram connection closed'.yellow);
      });
    });
  }

  /**
   * Send the payload to Deepgram
   * @param {String} payload A base64 MULAW/8000 audio stream
   */
  send(payload) {
    if (this.dgConnection.getReadyState() === 1) {
      this.dgConnection.send(Buffer.from(payload, 'base64'));
    }
  }
}

module.exports = { TranscriptionService };