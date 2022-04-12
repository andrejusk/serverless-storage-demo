const {
  createLogger,
  format: _format,
  transports: _transports,
} = require("winston");

const Logger = createLogger({
  level: "debug",
  format: _format.json(),
  transports: [new _transports.Console()],
});
module.exports = Logger;
