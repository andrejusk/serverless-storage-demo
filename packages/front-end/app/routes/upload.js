import Hashids from "hashids";
import crypto from "crypto";
import { json } from "@remix-run/node";
import { Storage } from "@google-cloud/storage";

// Initialise GCP clients if required
const storage = new Storage();
const bucket = storage.bucket(process.env.OUTPUT_BUCKET);
const hashids = new Hashids();

// Reject files 10MB or larger
const UPLOAD_SIZE_LIMIT = 9_999_999;

// Signed URLs expire after 15 minutes
const DEFAULT_EXPIRY = 60 * 1_000 * 15;

export async function action({ request }) {
  // Parse request body
  const uploadList = JSON.parse((await request.formData())._fields.upload);
  if (!uploadList || uploadList.length < 1) {
    return json({ message: "Missing upload list" }, 400);
  }

  // Map upload requests to GCP API calls
  try {
    const res = await Promise.all(
      uploadList.map(async (upload) => {
        const { name, size } = upload;
        const time = Date.now();
        const num = crypto.randomInt(42);
        const uid = hashids.encode([time, size, num]);
        if (!uid) throw `Failed to generate ID for file '${name}'`;

        // Make sure we don't ingest large files
        if (size > UPLOAD_SIZE_LIMIT) {
          return {
            status: "rejected",
            reason: "FILE_SIZE_EXCEEDED",
            uid,
            name,
            size,
          };
        }

        // Generate a signed write link for client upload
        const file = bucket.file(`${uid}__${name}`);
        // file.setMetadata({
        //   metadata: {
        //     uid,
        //     name,
        //     time,
        //   },
        // });

        const [url] = file.getSignedUrl({
          version: "v4",
          action: "write",
          expires: Date.now() + DEFAULT_EXPIRY,
        });
        return {
          status: "ready",
          uid,
          name,
          size,

          bucket: bucket.name,
          path: file.name,
          url,
        };
      })
    );
    return json({ res });
  } catch (e) {
    console.error(`Failed to generate upload: ${e}`);
    return json({ message: "Internal server error" }, { status: 500 });
  }
}
