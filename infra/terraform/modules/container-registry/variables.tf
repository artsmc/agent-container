# Variables for the container registry module (GCP Artifact Registry).

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
  description = "GCP project ID where resources are provisioned."
}

variable "region" {
  type        = string
  description = "GCP region for the Artifact Registry repositories. Images are stored regionally."
}

variable "app_names" {
  type        = list(string)
  description = "List of application names for which to create Artifact Registry repositories (e.g. ['auth', 'api', 'mastra', 'ui']). One repository is created per name."

  validation {
    condition     = length(var.app_names) > 0
    error_message = "app_names must contain at least one application name."
  }
}

variable "image_retention_count" {
  type        = number
  description = "Number of most-recent tagged images to retain per repository. Older tagged images are deleted by the cleanup policy."
  default     = 10

  validation {
    condition     = var.image_retention_count >= 1 && var.image_retention_count <= 100
    error_message = "image_retention_count must be between 1 and 100."
  }
}
