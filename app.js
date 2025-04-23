require('dotenv').config();
require('colors');
const logger = require("./logger_conf.js");
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

const PUBLIC_URL= process.env.PUBLIC_URL;
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Call Phone</title>
      <style>
        body {
          background-color: #f0f2f5;
          font-family: Arial, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
        }
        .container {
          background: #ffffff;
          padding: 30px 40px;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          text-align: center;
        }
        input[type="text"] {
          padding: 10px;
          width: 250px;
          border: 1px solid #ccc;
          border-radius: 6px;
          margin-top: 10px;
          margin-bottom: 20px;
          font-size: 16px;
        }
        button {
          padding: 10px 20px;
          background-color: #4CAF50;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 16px;
        }
        button:hover {
          background-color: #45a049;
        }
        h1 {
          margin-bottom: 20px;
          color: #333;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Make a Call</h1>
        <form action="http://15.207.109.182/makecall" method="get">
          <input type="text" id="phonenumber" name="phonenumber" placeholder="Enter phone number" required>
          <br>
          <button type="submit">Call</button>
        </form>
      </div>
    </body>
    </html>
  `);
});
app.get('/makecall', (req, res) => {
  const queries = req.query;
  const phoneNumber = queries.phonenumber;
  logger.info("got request to make call for mobile : "+phoneNumber);
  makeOutBoundCall(phoneNumber)
  logger.info("Call made to mobile : "+phoneNumber);
  res.send("call made to phoneNumber :"+phoneNumber);
});

app.post('/incoming', (req, res) => {
  console.log("landed in incoming")
  console.log("url", process.env.SERVER);
  try {
   console.log("in incoming try");
    const response = new VoiceResponse();
console.log("in incoming try after response");
    const connect = response.connect();
console.log("in incoming try after connect");
    connect.stream({ url: `wss://${process.env.SERVER}/connection` });
  console.log("in incoming try after stream");
console.log(`wss://${process.env.SERVER}/connection`);
    res.type('text/xml');
    res.end(response.toString());
  } catch (err) {
    console.log(err);
  }
});

app.ws('/connection', (ws) => {
  console.log("landed in connection");
  logger.info("webstream stablished for call connection");
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
       //logger.info("web stream on message function called");
      if (msg.event === 'start') {
        streamSid = msg.start.streamSid;
        callSid = msg.start.callSid;
        logger.info("call callSid generated :"+callSid);
        logger.info("call streamSid generated :"+streamSid);
        streamService.setStreamSid(streamSid);
        gptService.registerSession(callSid);
        //gptService.setCallSid(callSid);

        // Set RECORDING_ENABLED='true' in .env to record calls
        recordingService(ttsService, callSid).then(async () => {
          console.log("under ttsService then");
          logger.info("recordingService for  :"+callSid);
          logger.info(`Twilio -> Starting Media Stream for ${streamSid}`);
          const reply ="Hello sir!";
logger.info("Hard coded message sent to initiate conversation for "+callSid);           
 //await getChatCompletion("") || "Hi, how can I help?";
let before_tts =Date.now();
          ttsService.generate({ partialResponseIndex: null, partialResponse: reply }, 0);
let after_tts =Date.now();
let timeTaken = after_tts-before_tts;
 logger.info(`Time taken: ${timeTaken}ms for callSid : ${callSid}`);
      // logger.info("TTS generated for hardocded message for "+callSid);
 //logger.info("TTS timetake for "+);
          console.log("under ttsService then after");
        });
      } else if (msg.event === 'media') {
       //logger.info(`Time taken: ${timeTaken}ms for callSid : ${callSid}`);
        transcriptionService.send(msg.media.payload);
      } else if (msg.event === 'mark') {
        const label = msg.mark.name;
        logger.info(`Twilio -> Audio completed mark (${msg.sequenceNumber})`);
        marks = marks.filter(m => m !== msg.mark.name);
      } else if (msg.event === 'stop') {
        logger.info(`Twilio -> Media stream ${streamSid} ended.`);
      }
    });
  
    transcriptionService.on('utterance', async (text) => {
      // This is a bit of a hack to filter out empty utterances
      if(marks.length > 0 && text?.length > 5) {
        logger.info('Twilio -> Interruption, Clearing stream');
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

   logger.info(`Interaction ${gptService.interactionCount} – STT -> GPT: ${text}`);
   await gptService.completion(text);
   });
    gptService.on('gptreply', async (gptReply, icount) => {
    logger.info(`Interaction ${icount}: GPT -> TTS: ${gptReply.partialResponse}`);
    await ttsService.generate(gptReply, icount);
  });
    // gptService.on('gptreply', async (gptReply, icount) => {
    //   console.log(`Interaction ${icount}: GPT -> TTS: ${gptReply.partialResponse}`.green);
    //   console.log("before tts reply");
    //   ttsService.generate(gptReply, icount);
    //   console.log("feter tts reply");
    // });
  
    ttsService.on('speech', (responseIndex, audio, label, icount) => {
      logger.info(`Interaction ${icount}: TTS_____ -> TWILIO: `);
      logger.info(`Interaction ${responseIndex}`);
  
      streamService.buffer(responseIndex, audio);
    });
  
    streamService.on('audiosent', (markLabel) => {
      logger.info("audio sntttt.......>");
      marks.push(markLabel);
    });
  } catch (err) {
    console.log(err);
  }
});

app.listen(PORT);
logger.info(`Server running on port ${PORT}`);
