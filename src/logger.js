// logger.js
const winston = require("winston");
const path = require("path");
const fs = require("fs");

const logDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(({ timestamp, level, message }) =>
      `[${timestamp}] ${level.toUpperCase()}: ${message}`
    )
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message }) => `${level}: ${message}`)
      )
    }),
    new winston.transports.File({
      filename: path.join(logDir, "pritam.log"),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

module.exports = logger;
