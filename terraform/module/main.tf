variable "project" {
  type    = string
  default = "andrejus-web"
}
variable "service" {
  type    = string
  default = "srvls-demo"
}
variable "gcs_location" {
  type    = string
  default = "EU"
}
variable "region" {
  type    = string
  default = "europe-west2"
}
variable "frontend_image" {
    type  = string
}
variable "ingest_image" {
    type = string
}
variable "ingestpdf_image" {
    type = string
}

# Enable required services
locals {
  services = ["compute", "eventarc", "pubsub", "run", "storage"]
}
resource "google_project_service" "service" {
  for_each           = local.services
  service            = "${each.value}.googleapis.com"
  disable_on_destroy = false
}

# Upload and processed buckets
resource "google_storage_bucket" "upload" {
  name          = "${var.service}-upload"
  location      = var.gcs_location
  force_destroy = true

  # Auto expire in 3 days
  lifecycle_rule {
    condition {
      age = 3
    }
    action {
      type = "Delete"
    }
  }
}
resource "google_storage_bucket" "processed" {
  name          = "${var.service}-processed"
  location      = var.gcs_location
  force_destroy = true
}

# Upload topic
resource "google_pubsub_topic" "upload" {
  name                       = "${var.service}-upload"
  # TODO make sure 3 days (match bucket lifecycle)
  message_retention_duration = "86600s"
}
resource "google_storage_notification" "upload" {
  bucket         = google_storage_bucket.upload.name
  payload_format = "JSON_API_V1"
  topic          = google_pubsub_topic.upload.id
  event_types    = ["OBJECT_FINALIZE"]
}

# Post-upload topic(s) and extensions, e.g. PDF
resource "google_pubsub_topic" "ingest" {
  name                       = "${var.service}-ingest"
  message_retention_duration = "86600s"
}
resource "google_cloud_run_service" "ingest" {
  name     = "${var.service}-ingest"
  location = var.region

  # TODO env variable buckets
  template {
    spec {
        containers {
            image = var.ingest_image
            resources {
                limits = {
                    "cpu" = "1000m"
                    "memory" = "512Mi"
                }
            }
            ports {
                name = "http1"
                container_port = 3001
            }
        }
        timeout_seconds = 30
    }
  }

  traffic {
      percent = 100
      latest_revision = true
  }
  autogenerate_revision_name = true
}
resource "google_pubsub_subscription" "ingest-upload" {
  name  = "${var.service}-ingest-upoad"
  topic = google_pubsub_topic.upload.name

  ack_deadline_seconds = 30

  push_config {
    push_endpoint = google_cloud_run_service.ingest.status[0].url

    attributes = {
      x-goog-version = "v1"
    }
  }
}
resource "google_cloud_run_service" "ingest-pdf" {
  name     = "${var.service}-ingest-pdf"
  location = var.region

  # TODO bucket env variables
  template {
    spec {
        containers {
            image = var.ingestpdf_image
            resources {
                limits = {
                    "cpu" = "1000m"
                    "memory" = "512Mi"
                }
            }
            ports {
                name = "http1"
                container_port = 3001
            }
        }
        timeout_seconds = 30
    }
  }

  traffic {
      percent = 100
      latest_revision = true
  }
  autogenerate_revision_name = true
}
resource "google_pubsub_subscription" "ingest-pdf" {
  name  = "${var.service}-ingest-pdf"
  topic = google_pubsub_topic.ingest.name

  ack_deadline_seconds = 30

  push_config {
    push_endpoint = google_cloud_run_service.ingest-pdf.status[0].url

    attributes = {
      x-goog-version = "v1"
    }
  }
}


# Front-end application
resource "google_cloud_run_service" "front-end" {
  name     = "${var.service}-frontend"
  location = var.region

  template {
    spec {
        containers {
            image = var.frontend_image
            resources {
                limits = {
                    "cpu" = "1000m"
                    "memory" = "512Mi"
                }
            }
            ports {
                name = "http1"
                container_port = 3000
            }
        }
        timeout_seconds = 30
    }
  }

  traffic {
      percent = 100
      latest_revision = true
  }
  autogenerate_revision_name = true
}

# TODO outputs, service URLs, buckets
