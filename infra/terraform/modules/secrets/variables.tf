# Variables for the secrets module (GCP Secret Manager).

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
  description = "Short project name used as a prefix in secret IDs (e.g. 'iexcel')."
}

variable "gcp_project_id" {
  type        = string
  description = "GCP project ID where secrets are provisioned."
}

variable "region" {
  type        = string
  description = "GCP region. Used for labeling; secret replication is set to automatic (multi-region) for high availability."
}

variable "deletion_protection" {
  type        = bool
  description = "If true, secrets cannot be deleted via Terraform destroy. Prevents accidental loss of production credentials. Always false for dev, true for staging and production."
}
