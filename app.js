require('dotenv').config();
require('colors');

const express = require('express');
const ExpressWs = require('express-ws');

//const { GptService } = require('./services/gpt-service');
const { StreamService } = require('./services/stream-service');
const { TranscriptionService } = require('./services/transcription-service');
  
const { ElevenLabsTTSService } = require('./services/tts-service');

//TextToSpeechService
//const { getChatCompletion } = require('./services/external-gpt-service');
const { ExternalGptService } = require('./services/external-gpt-service');

const { recordingService } = require('./services/recording-service');
const { makeOutBoundCall } = require('./scripts/outbound-call.js');

const VoiceResponse = require('twilio').twiml.VoiceResponse;

const app = express();
ExpressWs(app);
//const ttsService = new ElevenLabsTTSService(streamService);


const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
res.send("AI Backend service is running..");
});
app.get('/makecall', (req, res) => {
  const queries = req.query;
  const phoneNumber = queries.phonenumber;
  makeOutBoundCall(phoneNumber)
  res.send("call made to phoneNumber :"+phoneNumber);
});

app.post('/incoming', (req, res) => {
  console.log("landed in incoming")
  console.log("url", process.env.SERVER);
  try {
    const response = new VoiceResponse();
    const connect = response.connect();
    connect.stream({ url: `wss://${process.env.SERVER}/connection` });
  
    res.type('text/xml');
    res.end(response.toString());
  } catch (err) {
    console.log(err);
  }
});

app.ws('/connection', (ws) => {
  console.log("landed in connection")
  try {
    ws.on('error', console.error);
    // Filled in from start message
    let streamSid;
    let callSid;

    //const gptService = new GptService();
    const gptService = new ExternalGptService();

    const streamService = new StreamService(ws);
    const transcriptionService = new TranscriptionService();
    const ttsService = new ElevenLabsTTSService(streamService);
    
  
    let marks = [];
    let interactionCount = 0;
  
    // Incoming from MediaStream
    ws.on('message', function message(data) {
      const msg = JSON.parse(data);
      if (msg.event === 'start') {
        streamSid = msg.start.streamSid;
        callSid = msg.start.callSid;
        
        streamService.setStreamSid(streamSid);
        //gptService.setCallSid(callSid);

        // Set RECORDING_ENABLED='true' in .env to record calls
        recordingService(ttsService, callSid).then(async () => {
          console.log("under ttsService then");
          console.log(`Twilio -> Starting Media Stream for ${streamSid}`.underline.red);
          const reply ="Hello sir ji !";
            //await getChatCompletion("") || "Hi, how can I help?";
          ttsService.generate({ partialResponseIndex: null, partialResponse: reply }, 0);
          console.log("under ttsService then after");
        });
      } else if (msg.event === 'media') {
        transcriptionService.send(msg.media.payload);
      } else if (msg.event === 'mark') {
        const label = msg.mark.name;
        console.log(`Twilio -> Audio completed mark (${msg.sequenceNumber}): ${label}`.red);
        marks = marks.filter(m => m !== msg.mark.name);
      } else if (msg.event === 'stop') {
        console.log(`Twilio -> Media stream ${streamSid} ended.`.underline.red);
      }
    });
  
    transcriptionService.on('utterance', async (text) => {
      // This is a bit of a hack to filter out empty utterances
      if(marks.length > 0 && text?.length > 5) {
        console.log('Twilio -> Interruption, Clearing stream'.red);
        ws.send(
          JSON.stringify({
            streamSid,
            event: 'clear',
          })
        );
      }
    });
  
    transcriptionService.on('transcription', async (text) => {
       if (!text) return;

    console.log(`Interaction ${gptService.interactionCount} – STT -> GPT: ${text}`.yellow);
   await gptService.completion(text);
   });
    gptService.on('gptreply', async (gptReply, icount) => {
    console.log(`Interaction ${icount}: GPT -> TTS: ${gptReply.partialResponse}`.green);
    await ttsService.generate(gptReply, icount);
  });
    // gptService.on('gptreply', async (gptReply, icount) => {
    //   console.log(`Interaction ${icount}: GPT -> TTS: ${gptReply.partialResponse}`.green);
    //   console.log("before tts reply");
    //   ttsService.generate(gptReply, icount);
    //   console.log("feter tts reply");
    // });
  
    ttsService.on('speech', (responseIndex, audio, label, icount) => {
      console.log(`Interaction ${icount}: TTS_____ -> TWILIO: ${label}`.blue);
      console.log(`Interaction ${responseIndex}`);
  
      streamService.buffer(responseIndex, audio);
    });
  
    streamService.on('audiosent', (markLabel) => {
      console.log("audio sntttt.......>");
      marks.push(markLabel);
    });
  } catch (err) {
    console.log(err);
  }
});

app.listen(PORT);
console.log(`Server running on port ${PORT}`);
