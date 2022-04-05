import { json, Response } from "@remix-run/node";
import { Storage } from "@google-cloud/storage";

// Lazy initialise GCP clients
let storage = null;
let bucket = null;

// Reject files larger than 10MB
const UPLOAD_THRESHOLD = 9_999_999;

// Signed URLs expire after 15 minutes
const DEFAULT_EXPIRY = 60 * 1000 * 15;

export async function action({ request }) {
  // Initialise GCP clients if required
  if (!storage) storage = new Storage();
  if (!bucket) bucket = storage.bucket(process.env.OUTPUT_BUCKET);

  // Parse request body
  const uploadList = JSON.parse((await request.formData())._fields.upload);
  if (!uploadList || uploadList.length < 1) {
    return json({ message: "Missing upload list" }, 400);
  }

  // Map upload requests to GCP API calls
  try {
    const res = await Promise.all(
      uploadList.map((upload) => {
        const { name, size } = upload;
        const uid = "abc123"; // FIXME generate an actual ID

        // Make sure we don't ingest large files
        if (size > UPLOAD_THRESHOLD) {
            return res.push({
                status: "rejected",
                reason: "FILE_SIZE_EXCEEDED",
                uid,
                name,
                size,
            })
        }

        // Generate a signed write link for client upload
        const [url] = bucket.file(name).getSignedUrl({
          version: "v4",
          action: "write",
          expires: Date.now() + DEFAULT_EXPIRY,
        });
        return res.push({
          status: "ready_to_upload",
          uid,
          name,
          size,
          url,
        });
      })
    );
    return new Response(res, { status: 201 });
  } catch (e) {
    console.error(`Failed to generate upload: ${e}`);
    return new Response({}, { status: 500 });
  }
}
