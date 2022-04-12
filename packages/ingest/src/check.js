const NodeClam = require("clamscan");

const Logger = require("./logger");

let clamscan = null;

/// Given a path to file, check it for viruses, and return if it is OK
async function checkFile(path) {
  // Initialise clamav client if needed
  if (!clamscan) {
    Logger.debug("clamscan cache miss");
    const clamConfig = {
      removeInfected: false,
      debugMode: true,
      scanRecursively: false,
      clamdscan: {
        host: "localhost",
        port: 3310,
        timeout: 30000,
        localFallback: false,
      },
      preference: "clamdscan",
    };
    Logger.info("Initialising clamscan", { clamConfig });
    clamscan = await new NodeClam().init(clamConfig);
  }
  Logger.info(`Scanning '${path}' using clamav`);

  const { isInfected, viruses } = await clamscan.scanFile(path);
  const status = isInfected
    ? `Infected, found '${viruses.join(", ")}'`
    : "OK, no viruses found";
  Logger.info(`Scan '${path}' result: ${status}`);
  return [isInfected === false, status];
}
module.exports = checkFile;
