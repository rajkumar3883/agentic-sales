require("dotenv").config();
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const client = require("twilio")(accountSid, authToken);
async function makeOutBoundCall(callerDetails) {
  console.log("phoneNumber", callerDetails.phoneNumber);
  console.log(`https://${process.env.SERVER}/incoming`);
  console.log(
    `https://${process.env.SERVER}/incoming?callbackKey=${callerDetails.callbackKey}`
  );
  //console.log(`http://${process.env.SERVER}/incoming?callbackKey=${callerDetails.callbackKey}`)
  if (callerDetails.phoneNumber && callerDetails.phoneNumber != "") {
    try {
      const call = await client.calls.create({
        url: `https://${process.env.SERVER}/incoming?callbackKey=${callerDetails.callbackKey}`,
        to: callerDetails.phoneNumber,
        from: FROM_NUMBER,
      });
      console.log(`Outbound call initiated with SID: ${call.sid}`);
      return call;
    } catch (error) {
      console.error("Error making outbound call:", error);
      throw error;
    }
  } else {
    console.log("Phone number is empty");
  }
}

module.exports = { makeOutBoundCall };
