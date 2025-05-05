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

class ExternalGptService extends EventEmitter {
  constructor() {
    super();
    this.sessionId = null;
    this.interactionCount = 0;
    this.callerDetails={};
  }
  registerSession(sessionId,callerDetails) {
    this.sessionId = sessionId;
    this.callerDetails=callerDetails;
    console.log(`[ExternalGptService] Registered session: ${sessionId}`);
  }
  async completion(text) {
     console.log(`[ExternalGptService] Session ${this.sessionId}`);
  try {
    const response = await axios.post(GPT_API_URL, {
      text,
      interactionCount: this.interactionCount,
      session_id:this.sessionId,
      callerDetails:this.callerDetails,

    });

    if (response.data && response.data.response) {
      const fullResponse = response.data.response;

      // Simulate streaming with • as pause markers
      const chunks = fullResponse.split('•').filter(Boolean);

      for (let chunk of chunks) {
        const gptReply = {
          partialResponseIndex: null,
          partialResponse: chunk.trim() + ' •',
        };

        this.emit('gptreply', gptReply, this.interactionCount);
        await new Promise(resolve => setTimeout(resolve, 200)); // Small delay to simulate stream
      }

      this.interactionCount++;
      return fullResponse;
    }

    console.error('Unexpected response from GPT API:', response.data);
    return 'Sorry, I could not process that.';
  } catch (error) {
    console.error('Error calling GPT API:', error.message);
    return 'Sorry, something went wrong.';
  }
}

}

module.exports = {
  ExternalGptService,
};
