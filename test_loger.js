const logger = require("./logger_conf.js");


logger.info('App started!');
logger.error('Something went wrong!');
logger.warn('Warning: something might go wrong!');
let callSid=1;
let sequenceNumber=2;
const red='red';
let label="label";
logger.info("Hard coded message sent to initiate conversation for "+callSid);
logger.info(`Twilio -> Audio completed mark ${sequenceNumber}`);
