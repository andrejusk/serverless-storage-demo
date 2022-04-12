resource "google_pubsub_topic" "upload" {
  name                       = "${var.service}-upload"
  message_retention_duration = "86400s" # 24 hours, match 'upload' bucket lifecycle rule
}

resource "google_pubsub_topic" "ingest" {
  name                       = "${var.service}-ingest"
  message_retention_duration = "86600s"
}
resource "google_pubsub_topic" "process" {
  name                       = "${var.service}-process"
  message_retention_duration = "86600s"
}
