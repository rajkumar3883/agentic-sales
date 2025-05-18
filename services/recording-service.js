const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();
// Initialize Supabase client
// const supabase = createClient(
//   process.env.NEXT_PUBLIC_SUPABASE_URL,
//   process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
// );
const { supabase } = require("../supabase-config");
async function recordingService(ttsService, callSid) {
  try {
    if (process.env.RECORDING_ENABLED === "true") {
      const client = require("twilio")(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );

      ttsService.generate(
        {
          partialResponseIndex: null,
          partialResponse: "This call will be recorded.",
        },
        0
      );
      const recording = await client.calls(callSid).recordings.create({
        recordingChannels: "dual",
        recordingStatusCallback: `https://${process.env.SERVER}/recording-status`,
        recordingStatusCallbackEvent: ["completed"],
      });

      console.log(`Recording Created: ${recording.sid}`.red);

      // Optional: Create an initial record in Supabase
      await supabase.from("call_recordings").insert({
        call_sid: callSid,
        recording_sid: recording.sid,
        status: "in_progress",
        created_at: new Date().toISOString(),
      });

      return recording.sid;
    }
  } catch (err) {
    console.log(err);
    throw err;
  }
}
module.exports = { recordingService };
