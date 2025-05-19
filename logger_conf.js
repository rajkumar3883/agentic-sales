const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss.SSS'
    }),
    winston.format.printf(info => `[${info.timestamp}] ${info.level}: ${info.message}`)
  ),
  transports: [
    new winston.transports.File({ filename: 'app.log', maxFiles: 5, maxsize: 10000000 }),
  ],
});

// Add a debug function to the logger
logger.debug = function(tag, message) {
  const timestamp = new Date().toISOString().slice(11, 23); // HH:MM:SS.sss
  const fullMessage = `[${timestamp}][${tag}] ${message}`;
  console.log(fullMessage);
  this.info(fullMessage);
};

module.exports = logger;
