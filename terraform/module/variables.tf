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
