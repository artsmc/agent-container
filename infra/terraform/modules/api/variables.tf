# Variables for the api Cloud Run module.

variable "environment" {
  type        = string
  description = "Deployment environment. One of: dev, staging, production."

  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "environment must be one of: dev, staging, production."
  }
}

variable "project_name" {
  type        = string
  description = "Short project name used as a prefix in resource names (e.g. 'iexcel')."
}

variable "gcp_project_id" {
  type        = string
  description = "GCP project ID where Cloud Run resources are provisioned."
}

variable "region" {
  type        = string
  description = "GCP region for the Cloud Run service."
}

variable "image_url" {
  type        = string
  description = "Full Artifact Registry image URL including tag (e.g. 'us-central1-docker.pkg.dev/project/iexcel-dev/api:sha-abc123')."
}

variable "service_account" {
  type        = string
  description = "Email of the service account to assign to this Cloud Run service. Sourced from the iam module."
}

variable "vpc_connector_id" {
  type        = string
  description = "Serverless VPC Access connector ID for private network egress. Sourced from the networking module."
}

variable "secret_names" {
  type        = map(string)
  description = "Map of logical secret name to GCP Secret Manager secret ID. Sourced from module.secrets.secret_names."
}

variable "domain" {
  type        = string
  description = "Base domain for this environment (e.g. 'dev.iexcel.app'). Used to construct AUTH_ISSUER_URL."
}

variable "auth_audience" {
  type        = string
  description = "JWT audience claim expected by the API when validating tokens issued by the auth service."
  default     = "iexcel-api"
}

variable "mastra_url" {
  type        = string
  description = "Internal Cloud Run service URL of the mastra service. Set to empty string for initial deployment; update after mastra is deployed."
  default     = ""
}

variable "min_instances" {
  type        = number
  description = "Minimum number of Cloud Run instances. Set to 0 for scale-to-zero (dev), >=1 for always-on (prod)."
  default     = 0

  validation {
    condition     = var.min_instances >= 0
    error_message = "min_instances must be >= 0."
  }
}

variable "max_instances" {
  type        = number
  description = "Maximum number of Cloud Run instances for autoscaling."
  default     = 5

  validation {
    condition     = var.max_instances >= 1
    error_message = "max_instances must be >= 1."
  }
}
