/*
  You can use this script to place an outbound call
  to your own mobile phone.
*/

require('dotenv').config();
FROM_NUMBER='+19472172705'
TO_NUMBER='+918802359520'
async function makeOutBoundCall() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  
  const client = require('twilio')(accountSid, authToken);

  await client.calls
    .create({
      url: `https://${process.env.SERVER}/incoming`,
      to: TO_NUMBER,
      from: FROM_NUMBER 
    })
    .then(call => console.log(call.sid));
}

makeOutBoundCall();