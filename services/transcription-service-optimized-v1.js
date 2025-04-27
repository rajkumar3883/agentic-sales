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
      sample_rate: 8000,
      language: 'multi',
      model: 'nova-3',
      punctuate: true,
      interim_results: true,
      endpointing: 200,
      utterance_end_ms: 300 // reduced for faster pause detection
    });

    this.finalResult = '';
    this.debounceTimer = null;

    this.dgConnection.on(LiveTranscriptionEvents.Open, () => {
      console.log('STT -> Deepgram connection opened'.cyan);

      this.dgConnection.on(LiveTranscriptionEvents.Transcript, (transcriptionEvent) => {
        const alternatives = transcriptionEvent.channel?.alternatives;
        let text = alternatives?.[0]?.transcript || '';

        if (transcriptionEvent.type === 'UtteranceEnd') {
          console.log('STT -> UtteranceEnd received'.yellow);
          return;
        }

        if (transcriptionEvent.is_final && text.trim().length > 0) {
          this.finalResult += ` ${text}`;

          // Debounced emit (waits 300ms for more input before sending)
          if (this.debounceTimer) clearTimeout(this.debounceTimer);

          this.debounceTimer = setTimeout(() => {
            const finalText = this.finalResult.trim();
            if (finalText.length > 0) {
              console.log(`STT -> Emitting transcription: ${finalText}`.green);
              this.emit('transcription', finalText);
              this.finalResult = '';
            }
          }, 300);
        } else {
          // Emit live interim transcript (optional)
          this.emit('utterance', text);
        }
      });

      this.dgConnection.on(LiveTranscriptionEvents.Error, (error) => {
        console.error('STT -> Deepgram error'.red);
        console.error(error);
      });

      this.dgConnection.on(LiveTranscriptionEvents.Warning, (warning) => {
        console.warn('STT -> Deepgram warning'.yellow);
        console.warn(warning);
      });

      this.dgConnection.on(LiveTranscriptionEvents.Metadata, (metadata) => {
        console.log('STT -> Deepgram metadata'.gray);
        console.log(metadata);
      });

      this.dgConnection.on(LiveTranscriptionEvents.Close, () => {
        console.log('STT -> Deepgram connection closed'.magenta);
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
