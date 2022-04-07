import Hashids from "hashids";
import crypto from "crypto";
import { json, LoaderFunction } from "@remix-run/node";
import { Storage } from "@google-cloud/storage";

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

// Upload URL generator
//
// GET /upload?name=foobar.txt&size=123
// 200 OK { ... }, containing upload `uid`, `url`
export const loader: LoaderFunction = async ({ request }) => {
  const params = new URL(request.url).searchParams;
  const name = params.get("name");
  if (!name) return json({ message: "Missing name param" }, { status: 400 });
  const sizeString = params.get("size");
  if (!sizeString)
    return json({ message: "Missing size param" }, { status: 400 });

  try {
    const size = parseInt(sizeString);
    const time = Date.now();
    const num = crypto.randomInt(42);
    const uid = hashids.encode([time, size, num]);
    if (!uid) throw `Failed to generate ID for file '${name}'`;

    // Make sure we don't ingest large files
    if (size > UPLOAD_SIZE_LIMIT) {
      return json({
        status: "rejected",
        reason: "FILE_SIZE_EXCEEDED",
        uid,
        name,
        size,
      });
    }

    // Generate a signed write link for client upload
    const path = `${uid}__${name}`;
    console.log(`Generating upload url for 'gs://${bucket.name}/${path}'...`);

    const [url] = await bucket.file(path).getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + DEFAULT_EXPIRY,
    });
    return json({
      status: "ready",
      uid,
      name,
      size,

      bucket: bucket.name,
      path,
      url,
    });
  } catch (e) {
    console.error(`Failed to generate upload: ${e}`, { e });
    return json({ message: "Internal server error" }, { status: 500 });
  }
};
