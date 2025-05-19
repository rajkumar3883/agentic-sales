// const axios = require('axios');

// const GPT_API_URL = 'http://3.110.47.194/chat';
// let interactionCount=0
// async function getChatCompletion(text,interactionCount) {
//   try {
//     const response = await axios.post(GPT_API_URL, { text });
//       //console.log("GPT_api_response_from_hardik",response.data.response);
//       interactionCount = parseInt(interactionCount) + 1;
//     if (response.data && response.data.response) {
//       return response.data.response;
//     }

//     console.error('Unexpected response from GPT API:', response.data);
//     return 'Sorry, I could not process that.';
//   } catch (error) {
//     console.error('Error calling GPT API:', error.message);
//     return 'Sorry, something went wrong.';
//   }
// }

// module.exports = {
//   getChatCompletion,
// };

const axios = require('axios');
const EventEmitter = require('events');

const GPT_API_URL = 'http://15.207.109.182/chat';
const logger = require("./../logger_conf.js");
class ExternalGptService extends EventEmitter {
  constructor() {
    super();
    this.sessionId = null;
    this.interactionCount = 0;
    this.callerDetails = {};
    this.lastInterruptionTime = null;
  }
  
  registerSession(sessionId, callerDetails) {
    this.sessionId = sessionId;
    this.callerDetails = callerDetails;
    console.log(`[ExternalGptService] Registered session: ${sessionId}, callerDetails: ${callerDetails}`);
  }
  
  async completion(text) {
    console.log(`[ExternalGptService] Session ${this.sessionId}`);
    logger.info(`[ExternalGptService] Session ${this.sessionId}`);
    
    // Check if this is an interruption
    const isInterruption = text.includes('[User interrupted previous response]');
    
    if (isInterruption) {
      logger.info(`[INTERRUPTION] External GPT handling interruption`);
      console.log(`[INTERRUPTION-EXTERNAL-GPT] Processing interruption: ${text}`);
      
      // Extract the actual question for better handling
      const cleanText = text.replace('[User interrupted previous response]', '').trim();
      
      // Add clearer interruption context for the API
      text = `[IMPORTANT: User interrupted previous response. Answer directly and concisely.] ${cleanText}`;
      
      this.lastInterruptionTime = Date.now();
    }
    
    try {
      // Log the request details
      const logPrefix = isInterruption ? '[INTERRUPT-REQUEST]' : '[REQUEST]';
      console.log(`${logPrefix} Sending to External GPT API: "${text.substring(0, 50)}..."`);
      
      const response = await axios.post(GPT_API_URL, {
        text,
        interactionCount: this.interactionCount,
        session_id: this.sessionId,
        callerdetails: this.callerDetails,
        // Pass interruption flag to API if available
        isInterruption: isInterruption || false,
        priority: isInterruption ? 'high' : 'normal' // Request faster processing for interruptions
      });

      console.log("callerDetails", this.callerDetails);
      logger.info(this.callerDetails);
      
      if (response.data && response.data.response) {
        const fullResponse = response.data.response;

        // If this was an interruption, ensure the response is concise
        let chunks = fullResponse.split('•').filter(Boolean);
        
        if (isInterruption) {
          // For interruptions, emit chunks faster to reduce latency
          const delayBetweenChunks = 100; // faster for interruptions
          
          for (let chunk of chunks) {
            const gptReply = {
              partialResponseIndex: null,
              partialResponse: chunk.trim() + ' •',
            };

            this.emit('gptreply', gptReply, this.interactionCount);
            await new Promise(resolve => setTimeout(resolve, delayBetweenChunks));
          }
        } else {
          // Normal response handling
          const delayBetweenChunks = 200;
          
          for (let chunk of chunks) {
            const gptReply = {
              partialResponseIndex: null,
              partialResponse: chunk.trim() + ' •',
            };

            this.emit('gptreply', gptReply, this.interactionCount);
            await new Promise(resolve => setTimeout(resolve, delayBetweenChunks));
          }
        }

        this.interactionCount++;
        return fullResponse;
      }
      
      logger.error(`Unexpected response from GPT API  ${response.data}`);
      console.error('Unexpected response from GPT API:', response.data);
      return 'Sorry, I could not process that.';
    } catch (error) {
      console.error('Error calling GPT API:', error.message);
      logger.error(`Error calling GPT text:  ${text} interactionCount: ${this.interactionCount},session_id: ${this.sessionId},callerdetails: ${JSON.stringify(this.callerDetails)}`);
      logger.error(`Error calling GPT API  ${error.message} ${JSON.stringify(this.callerDetails)}`);
      return 'Sorry, something went wrong.';
    }
  }
}

module.exports = {
  ExternalGptService,
};
