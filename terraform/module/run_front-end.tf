locals {
  frontend_sa    = "${var.service}-frontend"
  frontend_email = "${local.frontend_sa}@${var.project}.iam.gserviceaccount.com"
}
resource "google_service_account" "front-end_sa" {
  account_id   = local.frontend_sa
  display_name = "Front-end application Service Account"
}

locals {
  frontend_buckets = toset([
    google_storage_bucket.upload.name,
    google_storage_bucket.process.name
  ])
}
resource "google_storage_bucket_iam_member" "frontend_admin" {
  for_each = local.frontend_buckets
  bucket   = each.value
  role     = "roles/storage.admin"
  member   = "serviceAccount:${local.frontend_email}"
}
resource "google_project_iam_member" "sign_url" {
  role    = "roles/iam.serviceAccountTokenCreator"
  member  = "serviceAccount:${local.frontend_email}"
  project = var.project
}

locals {
  frontend_topics = {
    "upload" : google_pubsub_topic.upload.name,
    "ingest" : google_pubsub_topic.ingest.name,
    "process" : google_pubsub_topic.process.name
  }
}
resource "google_pubsub_topic_iam_member" "frontend_subscriber" {
  for_each = local.frontend_topics
  topic    = each.value
  role     = "roles/pubsub.subscriber"
  member   = "serviceAccount:${local.frontend_email}"
}

resource "google_pubsub_subscription" "frontend_subscription" {
  for_each = local.frontend_topics
  name     = "${var.service}-frontend-${each.key}"
  topic    = each.value

  # 20 minutes
  message_retention_duration = "1200s"
  retain_acked_messages      = true

  ack_deadline_seconds = 20

  expiration_policy {
    ttl = "300000.5s"
  }
  enable_message_ordering = false
}

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
            "memory" = "1024Mi"
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
        env {
          name  = "PROCESS_BUCKET"
          value = google_storage_bucket.process.name
        }
        env {
          name  = "UPLOAD_TOPIC"
          value = google_pubsub_topic.upload.name
        }
        env {
          name  = "INGEST_TOPIC"
          value = google_pubsub_topic.ingest.name
        }
        env {
          name  = "PROCESS_TOPIC"
          value = google_pubsub_topic.process.name
        }
        env {
          name  = "SERVICE_NAME"
          value = var.service
        }
      }
      timeout_seconds      = 30
      service_account_name = local.frontend_email
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
data "google_iam_policy" "noauth" {
  binding {
    role = "roles/run.invoker"
    members = [
      "allUsers",
    ]
  }
}
resource "google_cloud_run_service_iam_policy" "noauth" {
  location = google_cloud_run_service.front-end.location
  project  = google_cloud_run_service.front-end.project
  service  = google_cloud_run_service.front-end.name

  policy_data = data.google_iam_policy.noauth.policy_data
}
