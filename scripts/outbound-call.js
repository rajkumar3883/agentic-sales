require('dotenv').config();
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const client = require('twilio')(accountSid, authToken);
async function makeOutBoundCall(phoneNumber) {
  console.log("phoneNumber", phoneNumber);
  console.log(`https://${process.env.SERVER}/incoming`);
  if (phoneNumber && phoneNumber != "") {
    try {
      const call = await client.calls.create({
        url: `https://${process.env.SERVER}/incoming`,
        to: phoneNumber,
        from: FROM_NUMBER
      });
      console.log(call.sid);
    } catch (error) {
      console.error('Error making outbound call:', error);
    }
  } else {
    console.log("Phone number is empty");
  }
}

module.exports = { makeOutBoundCall };
