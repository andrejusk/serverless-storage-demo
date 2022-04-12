const { Storage } = require("@google-cloud/storage");
const { PubSub } = require("@google-cloud/pubsub");
const { json: _json } = require("body-parser");
const express = require("express");
const morgan = require("morgan");
const { unlinkSync } = require("fs");

const { http, info, warn, error } = require("./logger");

// Initialise GCP clients
const storage = new Storage();
const pubsub = new PubSub();

// Initialise configuration
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

if (!process.env.OUTPUT_PREFIX) throw "OUTPUT_PREFIX not set";

if (!process.env.OUTPUT_BUCKET) throw "OUTPUT_BUCKET not set";
const outputBucket = storage.bucket(process.env.OUTPUT_BUCKET);
if (!outputBucket.exists()) throw "OUTPUT_BUCKET does not exist";

if (!process.env.OUTPUT_TOPIC) throw "OUTPUT_TOPIC not set";
const outputTopic = pubsub.topic(process.env.OUTPUT_TOPIC);

// Create service
const app = express();
module.exports = app;

// Accept JSON
app.use(_json());

// Logger setup
const stream = {
  write: (message) => http(message),
};
app.use(morgan("common", { stream }));

// Handle health check
app.get("/health", (_, res) => {
  res.status(200).json({ hello: "world" });
});

// Handle new file uploaded controller
app.post("/", async (req, res, next) => {
  // Parse message
  const { message } = req.body;
  info("Handling Pub/Sub message", { pubsubMessage: message });

  // Parse event data
  const { data: rawData } = message;
  const file = JSON.parse(Buffer.from(rawData, "base64").toString());
  const { bucket, name: path } = file;
  info(`Handling 'gs://${bucket}/${path}' ingest...`, { file });
  const uid = path.split("__")[0];

  // Define publisher
  const publishOutput = async (data) => {
    return await outputTopic.publishMessage({
      json: data,
      attributes: {
        path: encodeURIComponent(path),
        status: data.status,
      },
    });
  };
  await publishOutput({
    uid,
    kind: "ingest-pdf",
    status: "start",
  });

  // Download uploaded file
  const destination = `/tmp/${path}`;
  info(`Downloading to temporary location '${destination}'...`);
  const uploadFile = storage.bucket(bucket).file(path);
  await uploadFile.download({ destination });

  // Attempt to check for viruses, either:
  //  - Succeed, upload to output bucket, notify success
  //  - Fail, delete from original bucket, notify failure
  try {
    // FIXME
    warn("LGTM");
    const safe = true;
    const reason = "N/A";
    await new Promise((res) => setTimeout(res, 700));
    // const [safe, reason] = await checkFile(destination);

    if (safe) {
      await uploadFile.setMetadata({
        metadata: { uid },
      });
      await outputBucket.upload(destination);
      await outputBucket.file(path).setMetadata({
        metadata: { uid },
      });
      await publishOutput({
        uid,
        kind: "ingest",
        status: "success",
        bucket: outputBucket.name,
        path,
      });
    } else {
      await storage.bucket(bucket).file(path).delete();
      await publishOutput({
        uid,
        kind: "ingest",
        status: "failure",
        path,
        reason,
      });
    }
  } catch (e) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    unlinkSync(destination);
    return next(e);
  }

  // Delete file on complete
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  unlinkSync(destination);

  res.status(200).json({});
});

// Register service error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const errHandler = (err, _, res, __) => {
  error(`Internal error: '${err.message}'`, { err });
  res.status(500).json({ message: "Internal server error" });
};
app.use(errHandler);

if (require.main === module) {
  app.listen(PORT, () => {
    info(`Listening on port '${PORT}'...`);
  });
}
