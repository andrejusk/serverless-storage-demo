import type { NextApiRequest, NextApiResponse } from "next";

import Hashids from "hashids";
import crypto from "crypto";
import { Storage } from "@google-cloud/storage";

import { FileUpload, UploadStatus } from "../index";

// Initialise GCP clients if required
const OUTPUT_BUCKET = process.env.OUTPUT_BUCKET;
if (!OUTPUT_BUCKET) throw "OUTPUT_BUCKET env var not defined";

const storage = new Storage();
const bucket = storage.bucket(OUTPUT_BUCKET);
if (!bucket.exists()) throw `Bucket '${bucket.name}' does not exist`;
const hashids = new Hashids();

// Reject files 10MB or larger
const UPLOAD_SIZE_LIMIT = 9_999_999;

// Signed URLs expire after 15 minutes
const DEFAULT_EXPIRY = 60 * 1_000 * 15;

type ErrorResponse = {
  message: string;
};

// Upload URL generator
//
// GET /upload?name=foobar.txt&size=123
// 200 OK { ... }, containing upload `uid`, `url`
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<FileUpload | ErrorResponse>
) {
  const num = crypto.randomInt(42);
  if (num > 37) {
    console.warn("🙈🙈🙈");
    return res.status(503).json({ message: "Service unavailable" });
  }

  const { body } = req;
  const file = body as FileUpload;
  const { name, size } = file;

  try {
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
    const gsUrl = `gs://${bucket.name}/${path}`
    console.log(`Generating upload url for '${gsUrl}'...`);

    const consoleUrl = 'https://console.cloud.google.com/storage/browser/_details/'
      + `${bucket.name}/${encodeURIComponent(path)}`;

    const [url] = await bucket.file(path).getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + DEFAULT_EXPIRY,
    });

    return res.status(200).json({
      ...file,
      status: UploadStatus.Ready,

      bucket: bucket.name,
      path,
      url,
      gsUrl,
      consoleUrl,
    });
  } catch (e) {
    console.error(`Failed to generate upload: ${e}`, { e });
    return res.status(500).json({ message: "Internal server error" });
  }
}
