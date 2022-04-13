import type { NextApiRequest, NextApiResponse } from "next";

import { PubSub, Subscription, Topic } from "@google-cloud/pubsub";
import { Storage } from "@google-cloud/storage";
import crypto from "crypto";
import Hashids from "hashids";

import { FileUpload, ProcessStatus, UploadStatus } from "../index";

// Prefix files with unique IDs
const PREFIX = process.env.SERVICE_NAME || "srvls-demo";
const hashids = new Hashids();

// ----------------------------------------------------------------------------
// Initialise Google Storage APIs
// ----------------------------------------------------------------------------
const OUTPUT_BUCKET = process.env.OUTPUT_BUCKET;
if (!OUTPUT_BUCKET) throw "OUTPUT_BUCKET env var not defined";
const PROCESS_BUCKET = process.env.PROCESS_BUCKET;
if (!PROCESS_BUCKET) throw "PROCESS_BUCKET env var not defined";

const storage = new Storage();
const uploadBucket = storage.bucket(OUTPUT_BUCKET);
if (!uploadBucket.exists())
  throw `Bucket '${uploadBucket.name}' does not exist`;
const processBucket = storage.bucket(PROCESS_BUCKET);
if (!processBucket.exists())
  throw `Bucket '${processBucket.name}' does not exist`;

// Reject files 10MB or larger
const UPLOAD_SIZE_LIMIT = 9_999_999;

// Signed URLs expire after 15 minutes
const DEFAULT_EXPIRY = 60 * 1_000 * 15;

// ----------------------------------------------------------------------------
// Initialise PubSub APIs
// ----------------------------------------------------------------------------
if (!process.env.UPLOAD_TOPIC) throw "UPLOAD_TOPIC not set";
if (!process.env.INGEST_TOPIC) throw "INGEST_TOPIC not set";
if (!process.env.PROCESS_TOPIC) throw "PROCESS_TOPIC not set";
const pubsub = new PubSub();

const uploadTopic = pubsub.topic(process.env.UPLOAD_TOPIC);
if (!uploadTopic.exists()) throw `Topic '${uploadTopic.name}' does not exist`;
const ingestTopic = pubsub.topic(process.env.INGEST_TOPIC);
if (!ingestTopic.exists()) throw `Topic '${ingestTopic.name}' does not exist`;
const processTopic = pubsub.topic(process.env.PROCESS_TOPIC);
if (!processTopic.exists()) throw `Topic '${processTopic.name}' does not exist`;

const topicMap = [
  {
    key: "upload",
    topic: uploadTopic,
  },
  {
    key: "ingest",
    topic: ingestTopic,
  },
  {
    key: "process",
    topic: processTopic,
  },
];
const subscriptions = topicMap.map(({ key, topic }) =>
  topic.subscription(`${PREFIX}-frontend-${key}`)
);
subscriptions.forEach((sub) => sub.get());

/// T or object with message string
type ErrorResponse<T> =
  | T
  | {
      message: string;
    };

// Upload URL generator
//
// POST /upload { name=foobar.txt, size=123 }
// 200 OK { ... }, containing upload `uid`, `url`
const postHandler = async (
  req: NextApiRequest,
  res: NextApiResponse<ErrorResponse<FileUpload>>
) => {
  const num = crypto.randomInt(42);
  if (num > 37) {
    console.warn("🙈🙈🙈");
    return res.status(503).json({ message: "Service unavailable" });
  }

  const { body } = req;
  const file = body as FileUpload;
  const { name, size } = file;

  const time = Date.now();
  const uid = hashids.encode([time, size, num]);
  if (!uid) throw `Failed to generate ID for file '${name}'`;

  // Make sure we don't ingest large files
  if (size > UPLOAD_SIZE_LIMIT) {
    return res.status(400).json({
      ...file,
      status: UploadStatus.Rejected,
      reason: "FILE_SIZE_EXCEEDED",
    });
  }

  // Generate a signed write link for client upload
  const path = `${uid}__${name}`;
  const gsUrl = `gs://${uploadBucket.name}/${path}`;
  console.log(`Generating upload url for '${gsUrl}'...`);

  const consoleUrl =
    "https://console.cloud.google.com/storage/browser/_details/" +
    `${uploadBucket.name}/${encodeURIComponent(path)}`;

  const [url] = await uploadBucket.file(path).getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + DEFAULT_EXPIRY,
  });

  return res.status(200).json({
    ...file,
    status: UploadStatus.Ready,

    bucket: uploadBucket.name,
    path,
    url,
    gsUrl,
    consoleUrl,
  });
};

// Upload SSE endpoint
//
// GET /upload
// 200 OK "data: { ... stringified JSON ... }", stream until closed
const getHandler = async (req: NextApiRequest, res: NextApiResponse) => {
  // Read path parameter
  const rawPath = req.query["path"];
  const targetPath =
    rawPath.length && rawPath.length == 1 ? rawPath[0] : (rawPath as string);
  if (!targetPath) res.status(400).json({ message: "Bad Request" });

  // Ensure file path exists
  const uploadFile = uploadBucket.file(targetPath);
  const processFile = processBucket.file(targetPath);
  if (!uploadFile.exists() && !processFile.exists())
    res.status(404).json({ message: "Not Found" });

  // Write SSE header
  console.log("Writing SSE header");
  res.writeHead(200, {
    Connection: "keep-alive",
    "Content-Encoding": "none",
    "Cache-Control": "no-cache, no-transform",
    "Content-Type": "text/event-stream",
    "X-Accel-Buffering": "no",
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const callback: { (...args: any[]): void } = async (message) => {
    // Parse object
    const obj = JSON.parse(message.data.toString());
    const { status, path, kind, bucket } = obj;
    if (path !== targetPath) return;
    console.log(`Forwarding "${kind}" "${status}" message`);

    // Add extra fields
    const gsUrl = `gs://${bucket}/${path}`;
    const consoleUrl =
      "https://console.cloud.google.com/storage/browser/_details/" +
      `${bucket}/${encodeURIComponent(path)}`;

    // const meta = await storage.bucket(bucket).file(path).getMetadata();
    const resObj = { ...obj, gsUrl, consoleUrl };
    if (kind === "ingest-pdf" && status === ProcessStatus.Success) {
      const url = await storage
        .bucket(obj.pdfBucket)
        .file(obj.pdfPath)
        .getSignedUrl({
          version: "v4",
          action: "read",
          expires: Date.now() + DEFAULT_EXPIRY,
        });
      resObj.url = url;
    }
    message.ack();
    res.write(`data: ${JSON.stringify(resObj)}\n\n`);
  };
  subscriptions.forEach((sub) => {
    sub.on("message", callback);
  });

  const end = async () => {
    console.log("Cleaning up after request...");
    await Promise.all(subscriptions.map((sub) => sub.delete));
    return;
  };
  req.on("aborted", end);
  req.on("close", end);
};

/// Upload service controller
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ErrorResponse<FileUpload>>
) {
  console.log(`Handling "${req.method}" request...`);
  try {
    switch (req.method) {
      case "GET": {
        return getHandler(req, res);
      }
      case "POST": {
        return postHandler(req, res);
      }
      default: {
        return res.status(405).json({ message: "Method Not Allowed" });
      }
    }
  } catch (e) {
    console.error(`Failed to generate upload: ${e}`, { e });
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
