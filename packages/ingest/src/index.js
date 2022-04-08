const { Storage } = require("@google-cloud/storage");
const { PubSub } = require("@google-cloud/pubsub");
const bodyParser = require("body-parser");
const NodeClam = require("clamscan");
const express = require("express");

// Initialise GCP clients
const storage = new Storage();
const pubsub = new PubSub();

// Initialise configuration
const DEFAULT_PORT = 3001;

if (!process.env.OUTPUT_TOPIC) throw "OUTPUT_TOPIC not set";
if (!process.env.OUTPUT_PREFIX) throw "OUTPUT_PREFIX not set";
if (!process.env.OUTPUT_BUCKET) throw "OUTPUT_BUCKET not set";
const uploadOutput = storage.bucket(process.env.OUTPUT_BUCKET).upload;
const publishOutput = pubsub.topic(process.env.OUTPUT_TOPIC).publishMessage;

// Create service
const app = express();
module.exports = app;

// Accept JSON
app.use(bodyParser.json());

// Handle health check
app.get("/health", (_, res) => {
  res.status(200).json({ hello: "world" });
});

// Handle new file uploaded controller
app.post("/", async (req, res, next) => {
  // Parse message
  const { message } = req.body;
  console.log("Handling Pub/Sub message", { message });

  // Parse event data
  const { data: rawData } = message;
  const file = JSON.parse(Buffer.from(rawData, "base64").toString());
  const { bucket, name } = file;
  console.log(`Handling 'gs://${bucket}/${name}' ingest...`, { file });

  // Download uploaded file
  const destination = `/tmp/${name}`;
  console.log(`Downloading to temporary location '${destination}'...`);
  await storage.bucket(bucket).file(name).download({ destination });

  // TODO check file size

  // Attempt to check for viruses, either:
  //  - Succeed, upload to output bucket, notify success
  //  - Fail, delete from original bucket, notify failure
  try {
    const success = await checkFile(destination);
    if (success) {
      await uploadOutput(destination);
      await publishOutput({
        json: {
          uid: "abc123",
          status: "success",
          bucket: process.env.OUTPUT_BUCKET,
          file: name,
        },
      });
    } else {
      await storage.bucket(bucket).file(name).delete();
      await publishOutput({
        json: {
          uid: "abc123",
          status: "failure",
        },
      });
    }
    res.status(200).json({});
  } catch (e) {
    next(e);
  }
});

// Register service error handler
// eslint-disable-next-line no-unused-vars
const errHandler = (err, _, res, __) => {
  console.error(`Internal error: '${err.message}'`, { err });
  res.status(500).json({ message: "Internal server error" });
};
app.use(errHandler);

let clamscan = null;

/// Given a path to file, check it for viruses, and return if it is OK
async function checkFile(path) {
  // Initialise clamav client if needed
  if (!clamscan) {
    const clamConfig = {
      removeInfected: true,
      debugMode: false,
      scanRecursively: false,
      clamdscan: {
        socket: process.env.CLAMDSCAN_SOCKET || "/var/run/clamav/clamd.ctl",
        timeout: 120000,
        local_fallback: true,
        path: process.env.CLAMDSCAN_PATH || "/var/lib/clamav",
        config_file:
          process.env.CLAMDSCAN_CONFIG_FILE || "/etc/clamav/clamd.conf",
      },
    };
    console.log("Initialising clamscan", { clamConfig });
    clamscan = await new NodeClam().init(clamConfig);
  }
  console.log(`Scanning '${path}' using clamav`);
  const { isInfected, viruses } = await clamscan.scanFile(path);
  const status = isInfected
    ? `Infected, found '${viruses.join(", ")}'`
    : "OK, no viruses found";
  console.log(`Scan '${path}' result: ${status}`);
  return isInfected === false;
}

if (require.main === module) {
  const port = process.env.PORT ? parseInt(process.env.PORT) : DEFAULT_PORT;
  app.listen(port, () => {
    console.log("Listening on port", port);
  });
}
