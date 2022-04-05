const { Storage } = require("@google-cloud/storage");
const { PubSub } = require("@google-cloud/pubsub");
const { promisify } = require("util");
// FIXME non-'child_process' way to invoke?
// eslint-disable-next-line security/detect-child-process
const exec = promisify(require("child_process").exec);
const express = require("express");
const bodyParser = require("body-parser");

// Initialise GCP clients
const storage = new Storage();
const pubsub = new PubSub();

// Initialise configuration
const DEFAULT_PORT = 3002;

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

// Handle new file ingest controller
app.post("/", async (req, res, next) => {
  // Parse message
  const { message } = req.body;
  console.log("Handling Pub/Sub message", { message });

  // Parse event data
  const { data: rawData } = message;
  const file = JSON.parse(Buffer.from(rawData, "base64").toString());
  const { bucket, name } = file;
  console.log(`Converting 'gs://${bucket}/${name}' to PDF...`, { file });

  // Download uploaded file
  const destination = `/tmp/${name}`;
  console.log(`Downloading to temporary location '${destination}'...`);
  await storage.bucket(bucket).file(name).download({ destination });

  // Attmept to convert file to PDF.
  // If successful, upload to output bucket, notify success.
  // Otherwise, notify failure.
  try {
    const pdfFileName = await convertFile(name);
    if (pdfFileName) {
      await uploadOutput(`/tmp/${pdfFileName}`);
      await publishOutput({
        json: {
          foo: "bar",
        },
      });
    } else {
      await publishOutput({
        json: {
          foo: "bar",
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

/// Given a filename in `/tmp`, convert it to PDF, save it in `/tmp`
/// and return its new PDF filename
async function convertFile(fileName) {
  const cmd =
    "libreoffice --headless --convert-to pdf --outdir /tmp " +
    `"/tmp/${fileName}"`;
  console.log(`Invoking '${cmd}'`);
  const { stdout, stderr } = await exec(cmd);
  if (stderr) {
    throw stderr;
  }
  console.log(stdout);
  return fileName.replace(/\.\w+$/, ".pdf");
}

if (require.main === module) {
  const port = process.env.PORT ? parseInt(process.env.PORT) : DEFAULT_PORT;
  app.listen(port, () => {
    console.log("Listening on port", port);
  });
}
