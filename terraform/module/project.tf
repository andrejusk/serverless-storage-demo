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
