# Variables for the IAM module (GCP service accounts and access bindings).

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
  description = "GCP project ID where IAM resources are provisioned."
}

variable "region" {
  type        = string
  description = "GCP region. Used for Artifact Registry IAM bindings."
}

variable "app_names" {
  type        = list(string)
  description = "List of application names that require service accounts (e.g. ['auth', 'api', 'mastra', 'ui']). Must match the names used in the container-registry module."

  validation {
    condition     = length(var.app_names) > 0
    error_message = "app_names must contain at least one application name."
  }
}

variable "secret_names" {
  type        = map(string)
  description = "Map of logical secret name to GCP secret ID. Provided by module.secrets.secret_names. Used to construct least-privilege IAM bindings granting each service account access only to its required secrets."
}

variable "terraform_state_bucket" {
  type        = string
  description = "Name of the GCS bucket holding Terraform remote state. The cicd service account is granted objectAdmin access to manage state files."
}
