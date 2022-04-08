# ----------------------------------------------------------------------------
# Terraform module input variables
# ----------------------------------------------------------------------------
variable "project" {
  type        = string
  default     = "andrejus-web"
  description = "GCP project to use for provisioning resources"
}
variable "service" {
  type        = string
  default     = "srvls-demo"
  description = "Service prefix for use in resource names"
}
variable "gcs_location" {
  type        = string
  default     = "EU"
  description = "Default Google Storage location to use"
}
variable "region" {
  type        = string
  default     = "europe-west2"
  description = "Default Google Compute region to use"
}
variable "frontend_image" {
  type        = string
  description = "Docker image to use for front-end service"
}
variable "ingest_image" {
  type        = string
  description = "Docker image to use for ingest service"
}
variable "ingestpdf_image" {
  type        = string
  description = "Docker image to use for ingest-pdf service"
}

# ----------------------------------------------------------------------------
# GCP project
# ----------------------------------------------------------------------------
data "google_project" "default" {
}

# ----------------------------------------------------------------------------
# Enable required Google Cloud services
# ----------------------------------------------------------------------------
locals {
  services = toset(["compute", "eventarc", "pubsub", "run", "storage"])
}
resource "google_project_service" "service" {
  for_each           = local.services
  service            = "${each.value}.googleapis.com"
  disable_on_destroy = false
}

# ----------------------------------------------------------------------------
# Storage buckets
# ----------------------------------------------------------------------------
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
resource "google_storage_bucket" "processed" {
  name          = "${var.service}-processed"
  location      = var.gcs_location
  force_destroy = true
}

# ----------------------------------------------------------------------------
# Pub/Sub topics
# ----------------------------------------------------------------------------
resource "google_pubsub_topic" "upload" {
  name                       = "${var.service}-upload"
  message_retention_duration = "86400s" # 24 hours, match 'upload' bucket lifecycle rule
}
resource "google_pubsub_topic" "ingest" {
  name                       = "${var.service}-ingest"
  message_retention_duration = "86600s"
}
resource "google_pubsub_topic" "processed" {
  name                       = "${var.service}-processed"
  message_retention_duration = "86600s"
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

# ----------------------------------------------------------------------------
# Upload ingest service and invoker service account
# ----------------------------------------------------------------------------
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
            "memory" = "512Mi"
          }
        }
        ports {
          name           = "http1"
          container_port = 3001
        }
        env {
          name  = "OUTPUT_BUCKET"
          value = google_storage_bucket.processed.name
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
  upload_invoker_sa = "${var.service}-upload-invoker"
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


# ----------------------------------------------------------------------------
# Ingest services, e.g. PDF converter
# ----------------------------------------------------------------------------
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
            "memory" = "512Mi"
          }
        }
        ports {
          name           = "http1"
          container_port = 3002
        }
        env {
          name  = "OUTPUT_BUCKET"
          value = google_storage_bucket.processed.name
        }
        env {
          name  = "OUTPUT_PREFIX"
          value = "/pdfs"
        }
        env {
          name  = "OUTPUT_TOPIC"
          value = google_pubsub_topic.processed.name
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
resource "google_pubsub_subscription" "ingest-pdf" {
  name  = "${var.service}-ingest-pdf"
  topic = google_pubsub_topic.ingest.name

  ack_deadline_seconds = 300

  push_config {
    push_endpoint = google_cloud_run_service.ingest-pdf.status[0].url

    attributes = {
      x-goog-version = "v1"
    }
  }
}


# ----------------------------------------------------------------------------
# Front-end application
# ----------------------------------------------------------------------------
resource "google_cloud_run_service" "front-end" {
  name     = "${var.service}-frontend"
  location = var.region

  template {
    spec {
      containers {
        image = var.frontend_image
        resources {
          limits = {
            "cpu"    = "1000m"
            "memory" = "512Mi"
          }
        }
        ports {
          name           = "http1"
          container_port = 3000
        }
        env {
          name  = "OUTPUT_BUCKET"
          value = google_storage_bucket.upload.name
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

# TODO outputs, service URLs, buckets
