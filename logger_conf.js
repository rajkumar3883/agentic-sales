const { createLogger, format, transports } = require("winston");

const logger = createLogger({
  level: "info",
  exitOnError: false,
  format: format.json(),
  transports: [
    new transports.File({
      filename: "/var/log/serverlog/app.log",
    }),
  ],
});

module.exports = logger;
