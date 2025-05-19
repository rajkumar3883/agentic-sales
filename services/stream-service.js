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
    this.isCurrentlyPlayingAudio = false;
    this.lastInterruptionTime = null;
    this.lastActivityTime = Date.now();
    this.streamStartTime = null;
    
    // Debug audio state periodically 
    this.debugInterval = setInterval(() => {
      console.log(`[STREAM-DEBUG] isPlaying: ${this.isPlaying()}, activeStreams: ${this.activeStreams.size}`);
    }, 5000);
  }

  setStreamSid(streamSid) {
    this.streamSid = streamSid;
  }

  // Handle buffering of complete audio responses (original functionality)
  buffer(index, audio) {
    // Track that we're playing audio
    this.isCurrentlyPlayingAudio = true;
    this.streamStartTime = Date.now();
    this.lastActivityTime = Date.now();
    
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
      
      // Set flag to indicate audio is playing
      this.isCurrentlyPlayingAudio = true;
      this.streamStartTime = Date.now();
      console.log(`[STREAM] Started new audio stream: ${streamId}`);
    }

    // Update activity timestamp
    this.lastActivityTime = Date.now();

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
    
    // Set flag to indicate audio is done playing if no other streams are active
    this.activeStreams.delete(streamId);
    
    if (this.activeStreams.size === 0) {
      console.log(`[STREAM] All audio streams finished - setting isPlaying to false`);
      this.isCurrentlyPlayingAudio = false;
    }
    
    this.emit('audioStreamComplete', markLabel, streamInfo);
  }

  // Original method, kept for compatibility
  sendAudio(audio) {
    if (!this.ws || this.ws.readyState !== 1) {
      console.error('WebSocket not connected');
      return;
    }
    
    // Set flag to indicate audio is playing
    this.isCurrentlyPlayingAudio = true;
    this.streamStartTime = Date.now();
    this.lastActivityTime = Date.now();
    
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

  // Enhanced method to interrupt current audio
  clearAudio() {
    if (!this.ws || this.ws.readyState !== 1 || !this.streamSid) {
      console.error('Cannot clear audio: WebSocket not connected or no streamSid');
      return false;
    }
    
    // Don't interrupt too frequently (avoid multiple interruptions within 1 second)
    const now = Date.now();
    if (this.lastInterruptionTime && (now - this.lastInterruptionTime < 1000)) {
      console.log('Ignoring rapid interruption request');
      return false;
    }
    
    console.log(`[STREAM-CLEAR] Attempting to clear audio. isPlaying: ${this.isCurrentlyPlayingAudio}, activeStreams: ${this.activeStreams.size}`);
    
    // Force clear even if isPlaying flag is false
    this.ws.send(
      JSON.stringify({
        streamSid: this.streamSid,
        event: 'clear'
      })
    );
    
    console.log('[STREAM-CLEAR] Sent clear event to stop current audio');
    
    // Reset playing state
    this.isCurrentlyPlayingAudio = false;
    this.lastInterruptionTime = now;
    
    // Clear all active streams
    const hadActiveStreams = this.activeStreams.size > 0;
    this.activeStreams.clear();
    
    this.emit('audioCleared', { timestamp: now });
    return true;
  }
  
  // Check if system is currently speaking
  isPlaying() {
    // Auto-reset playing state if too much time has passed since last activity
    // (20 seconds is a reasonable timeout for audio playback)
    const silenceThreshold = 20000; // 20 seconds
    const now = Date.now();
    const timeSinceLastActivity = now - this.lastActivityTime;
    
    if (this.isCurrentlyPlayingAudio && timeSinceLastActivity > silenceThreshold) {
      console.log(`[STREAM] Auto-resetting isPlaying state after ${timeSinceLastActivity}ms of inactivity`);
      this.isCurrentlyPlayingAudio = false;
      this.activeStreams.clear();
    }
    
    return this.isCurrentlyPlayingAudio || this.activeStreams.size > 0;
  }
  
  cleanup() {
    if (this.debugInterval) {
      clearInterval(this.debugInterval);
    }
  }
}

module.exports = { StreamService };