resource "google_cloud_run_service" "ingest" {
  name     = "${var.service}-ingest"
  location = var.region

  template {
    spec {
      containers {
        image = var.ingest_image
        resources {
          limits = {
            "cpu"    = "1000m"
            "memory" = "2048Mi"
          }
        }
        ports {
          name           = "http1"
          container_port = 3001
        }
        env {
          name  = "OUTPUT_BUCKET"
          value = google_storage_bucket.process.name
        }
        env {
          name  = "OUTPUT_PREFIX"
          value = "/ingest"
        }
        env {
          name  = "OUTPUT_TOPIC"
          value = google_pubsub_topic.ingest.name
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
  upload_invoker_sa    = "${var.service}-upload-invoker"
  upload_invoker_email = "${local.upload_invoker_sa}@${var.project}.iam.gserviceaccount.com"
}
resource "google_service_account" "upload_invoker_sa" {
  account_id   = local.upload_invoker_sa
  display_name = "Pub/Sub adapter Service Account"
}
data "google_iam_policy" "upload_invoker" {
  binding {
    role = "roles/run.invoker"
    members = [
      "serviceAccount:${local.upload_invoker_email}",
    ]
  }
  depends_on = [
    google_service_account.upload_invoker_sa
  ]
}
resource "google_cloud_run_service_iam_policy" "upload_invoker" {
  location = google_cloud_run_service.ingest.location
  project  = google_cloud_run_service.ingest.project
  service  = google_cloud_run_service.ingest.name

  policy_data = data.google_iam_policy.upload_invoker.policy_data
}

resource "google_pubsub_subscription" "ingest_upload" {
  name  = "${var.service}-ingest-upload"
  topic = google_pubsub_topic.upload.name

  ack_deadline_seconds = 300

  push_config {
    push_endpoint = google_cloud_run_service.ingest.status[0].url

    attributes = {
      x-goog-version = "v1"
    }
    oidc_token {
      service_account_email = local.upload_invoker_email
    }
  }
  depends_on = [
    google_service_account.upload_invoker_sa
  ]
}
resource "google_service_account_iam_member" "pubsub_assume_sa" {
  service_account_id = google_service_account.upload_invoker_sa.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:service-${data.google_project.default.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}
