const { createLogger, format, transports } = require("winston");

const logger = createLogger({
  level: "info",
  exitOnError: false,
  format: format.json(),
  transports: [
    new transports.File({
      filename:
        "/Users/rajverma/Downloads/github/remote/agentic-sales/serverlog/app.log",
    }),
  ],
});

module.exports = logger;
