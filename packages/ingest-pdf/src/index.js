const { Storage } = require("@google-cloud/storage");
const { PubSub } = require("@google-cloud/pubsub");
const { promisify } = require("util");
// eslint-disable-next-line @typescript-eslint/no-var-requires, security/detect-child-process
const exec = promisify(require("child_process").exec);
const express = require("express");
const morgan = require("morgan");
const {
  createLogger,
  format: _format,
  transports: _transports,
} = require("winston");
const { json: _json } = require("body-parser");

// Initialise GCP clients
const storage = new Storage();
const pubsub = new PubSub();

// Initialise configuration
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3002;

if (!process.env.OUTPUT_TOPIC) throw "OUTPUT_TOPIC not set";
if (!process.env.OUTPUT_PREFIX) throw "OUTPUT_PREFIX not set";
if (!process.env.OUTPUT_BUCKET) throw "OUTPUT_BUCKET not set";
const outputBucket = storage.bucket(process.env.OUTPUT_BUCKET);
const outputTopic = pubsub.topic(process.env.OUTPUT_TOPIC);

// Create service
const app = express();
module.exports = app;

// Accept JSON
app.use(_json());

// Logger setup
const Logger = createLogger({
  level: "debug",
  format: _format.json(),
  transports: [new _transports.Console()],
});
const stream = {
  write: (message) => Logger.http(message),
};
app.use(morgan("common", { stream }));

// Handle health check
app.get("/health", (_, res) => {
  res.status(200).json({ hello: "world" });
});

// Handle new file ingest controller
app.post("/", async (req, res, next) => {
  // Parse event data
  const { message } = req.body;
  const { data: rawData } = message;
  const file = JSON.parse(Buffer.from(rawData, "base64").toString());
  Logger.info("Parsed Pub/Sub message data", { rawData, file });
  const { bucket, path } = file;
  Logger.info(`Converting 'gs://${bucket}/${path}' to PDF...`, { file });
  const uid = path.split("__")[0];

  // Define publisher
  const publishOutput = async (data) => {
    return await outputTopic.publishMessage({
      json: data,
      attributes: { path: encodeURIComponent(path) },
    });
  };

  // Fire & forget start message
  publishOutput({
    uid,
    kind: "ingest-pdf",
    status: "start",
  }).catch(Logger.error);

  // Download uploaded file
  const destination = `/tmp/${path}`;
  Logger.info(`Downloading to temporary location '${destination}'...`);
  try {
    const file = storage.bucket(bucket).file(path);
    await file.download({ destination });
  } catch (e) {
    return next(e);
  }

  // Attmept to convert file to PDF.
  // If successful, upload to output bucket, notify success.
  // Otherwise, notify failure.
  try {
    const pdfFileName = await convertFile(path);
    if (pdfFileName) {
      await outputBucket.upload(`/tmp/${pdfFileName}`);
      await publishOutput({
        uid,
        kind: "ingest-pdf",
        status: "success",
        bucket,
        path,
        pdfBucket: outputBucket.name,
        pdfPath: pdfFileName,
      });
    } else throw "No PDF output";
  } catch (e) {
    await publishOutput({
      uid,
      kind: "ingest-pdf",
      status: "failure",
      reason: e.message,
    });
  }
  res.status(200).json({});
});

// Register service error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const errHandler = (err, _, res, __) => {
  Logger.error(`Internal error: '${err.message}'`, { err });
  res.status(500).json({ message: "Internal server error" });
};
app.use(errHandler);

/// Given a filename in `/tmp`, convert it to PDF, save it in `/tmp`
/// and return its new PDF filename
async function convertFile(fileName) {
  const cmd =
    "libreoffice --headless --convert-to pdf --outdir /tmp " +
    `"/tmp/${fileName}"`;
  Logger.info(`Invoking '${cmd}'`);
  const { stdout, stderr } = await exec(cmd);
  if (stderr) {
    throw stderr;
  }
  Logger.info(stdout);
  return fileName.replace(/\.\w+$/, ".pdf");
}

if (require.main === module) {
  app.listen(PORT, () => {
    Logger.info("Listening on port", PORT);
  });
}
