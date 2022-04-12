resource "google_storage_bucket" "upload" {
  name          = "${var.service}-upload"
  location      = var.gcs_location
  force_destroy = true

  # Auto expire uploaded files in 24 hours
  lifecycle_rule {
    condition {
      age = 1
    }
    action {
      type = "Delete"
    }
  }

  cors {
    origin = ["*"]
    method = ["GET", "HEAD", "PUT"]
    response_header = [
      "Content-Type",
    ]
  }
}
resource "google_storage_bucket" "process" {
  name          = "${var.service}-process"
  location      = var.gcs_location
  force_destroy = true
}

# ----------------------------------------------------------------------------
# Upload Storage -> Pub/Sub notification
# ----------------------------------------------------------------------------
resource "google_pubsub_topic_iam_member" "upload" {
  topic  = google_pubsub_topic.upload.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:service-${data.google_project.default.number}@gs-project-accounts.iam.gserviceaccount.com"
}

resource "google_storage_notification" "upload" {
  bucket         = google_storage_bucket.upload.name
  payload_format = "JSON_API_V1"
  topic          = google_pubsub_topic.upload.id
  event_types    = ["OBJECT_FINALIZE"]

  depends_on = [
    google_pubsub_topic_iam_member.upload
  ]
}
