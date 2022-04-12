resource "google_cloud_run_service" "ingest-pdf" {
  name     = "${var.service}-ingest-pdf"
  location = var.region

  template {
    spec {
      containers {
        image = var.ingestpdf_image
        resources {
          limits = {
            "cpu"    = "1000m"
            "memory" = "1Gi"
          }
        }
        ports {
          name           = "http1"
          container_port = 3002
        }
        env {
          name  = "OUTPUT_BUCKET"
          value = google_storage_bucket.process.name
        }
        env {
          name  = "OUTPUT_PREFIX"
          value = "/pdfs"
        }
        env {
          name  = "OUTPUT_TOPIC"
          value = google_pubsub_topic.process.name
        }
      }
      timeout_seconds = 30
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }
  autogenerate_revision_name = true

  lifecycle {
    ignore_changes = [
      status
    ]
  }
}

locals {
  ingestpdf_invoker_sa    = "${var.service}-ingestpdf-invoker"
  ingestpdf_invoker_email = "${local.ingestpdf_invoker_sa}@${var.project}.iam.gserviceaccount.com"
}
resource "google_service_account" "ingestpdf_invoker_sa" {
  account_id   = local.ingestpdf_invoker_sa
  display_name = "Pub/Sub adapter Service Account"
}

data "google_iam_policy" "ingestpdf_invoker" {
  binding {
    role = "roles/run.invoker"
    members = [
      "serviceAccount:${local.ingestpdf_invoker_email}",
    ]
  }
  depends_on = [
    google_service_account.ingestpdf_invoker_sa
  ]
}
resource "google_cloud_run_service_iam_policy" "ingestpdf_pdf_invoker" {
  location = google_cloud_run_service.ingest-pdf.location
  project  = google_cloud_run_service.ingest-pdf.project
  service  = google_cloud_run_service.ingest-pdf.name

  policy_data = data.google_iam_policy.ingestpdf_invoker.policy_data
}

resource "google_pubsub_subscription" "ingest-pdf" {
  name  = "${var.service}-ingest-pdf"
  topic = google_pubsub_topic.ingest.name

  ack_deadline_seconds = 300

  # Only process successful file ingests
  filter = "attributes.status = \"success\""

  push_config {
    push_endpoint = google_cloud_run_service.ingest-pdf.status[0].url

    attributes = {
      x-goog-version = "v1"
    }
    oidc_token {
      service_account_email = local.ingestpdf_invoker_email
    }
  }
  depends_on = [
    google_service_account.ingestpdf_invoker_sa
  ]
}
