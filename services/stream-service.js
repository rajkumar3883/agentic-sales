const EventEmitter = require('events');
const uuid = require('uuid');

class StreamService extends EventEmitter {
  constructor(websocket) {
    super();
    this.ws = websocket;
    this.expectedAudioIndex = 0;
    this.audioBuffer = {};
    this.streamSid = '';
    this.activeStreams = new Map(); // Track active audio streams
    this.chunkSequence = 0;
  }

  setStreamSid(streamSid) {
    this.streamSid = streamSid;
  }

  // Handle buffering of complete audio responses (original functionality)
  buffer(index, audio) {
    // Escape hatch for intro message, which doesn't have an index
    if (index === null) {
      this.sendAudio(audio);
    } else if (index === this.expectedAudioIndex) {
      this.sendAudio(audio);
      this.expectedAudioIndex++;

      // Process any buffered audio segments that are now ready
      while (Object.prototype.hasOwnProperty.call(this.audioBuffer, this.expectedAudioIndex)) {
        const bufferedAudio = this.audioBuffer[this.expectedAudioIndex];
        this.sendAudio(bufferedAudio);
        this.expectedAudioIndex++;
      }
    } else {
      this.audioBuffer[index] = audio;
    }
  }

  // New method to handle streaming audio chunks
  sendAudioChunk(responseIndex, audioChunk, streamId, isFirst = false) {
    if (!this.ws || this.ws.readyState !== 1) {
      console.error('WebSocket not connected');
      return;
    }

    // If this is the first chunk of a new audio stream
    if (isFirst) {
      this.activeStreams.set(streamId, {
        responseIndex,
        chunkCount: 0,
        startTime: Date.now()
      });
    }

    // Update chunk count for this stream
    if (this.activeStreams.has(streamId)) {
      const streamInfo = this.activeStreams.get(streamId);
      streamInfo.chunkCount++;
    }

    // Send the audio chunk immediately
    this.ws.send(
      JSON.stringify({
        streamSid: this.streamSid,
        event: 'media',
        media: {
          payload: audioChunk,
        },
      })
    );

    this.chunkSequence++;
    
    // For debugging
    if (this.chunkSequence % 10 === 0) {
      console.log(`Sent ${this.chunkSequence} audio chunks so far`);
    }
  }

  // Mark the end of a streaming segment
  completeAudioStream(streamId) {
    if (!this.activeStreams.has(streamId)) return;
    
    const streamInfo = this.activeStreams.get(streamId);
    
    // Send a mark to track when this audio segment completes
    const markLabel = `${streamId}_complete`;
    this.ws.send(
      JSON.stringify({
        streamSid: this.streamSid,
        event: 'mark',
        mark: {
          name: markLabel
        }
      })
    );
    
    const processingTime = Date.now() - streamInfo.startTime;
    console.log(`Audio stream ${streamId} completed: ${streamInfo.chunkCount} chunks in ${processingTime}ms`);
    
    this.emit('audioStreamComplete', markLabel, streamInfo);
    this.activeStreams.delete(streamId);
  }

  // Original method, kept for compatibility
  sendAudio(audio) {
    this.ws.send(
      JSON.stringify({
        streamSid: this.streamSid,
        event: 'media',
        media: {
          payload: audio,
        },
      })
    );
    
    // When the media completes you will receive a `mark` message with the label
    const markLabel = uuid.v4();
    this.ws.send(
      JSON.stringify({
        streamSid: this.streamSid,
        event: 'mark',
        mark: {
          name: markLabel
        }
      })
    );
    
    this.emit('audiosent', markLabel);
  }

  // New method to interrupt current audio
  clearAudio() {
    if (this.ws && this.ws.readyState === 1 && this.streamSid) {
      this.ws.send(
        JSON.stringify({
          streamSid: this.streamSid,
          event: 'clear'
        })
      );
      console.log('Sent clear event to stop current audio');
      this.emit('audioCleared');
    }
  }
}

module.exports = { StreamService };