# Root-level input variables for the iExcel Terraform configuration.
# Values are supplied per environment via environments/{env}.tfvars files.

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
  description = "Short project name used as a prefix in all resource names and labels (e.g. 'iexcel')."
  default     = "iexcel"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,18}[a-z0-9]$", var.project_name))
    error_message = "project_name must be lowercase alphanumeric with hyphens, 3–20 characters, starting with a letter."
  }
}

variable "gcp_project_id" {
  type        = string
  description = "GCP project ID where all resources will be provisioned."
}

variable "region" {
  type        = string
  description = "GCP region for all regional resources (e.g. 'us-central1')."
}

variable "cloud_provider" {
  type        = string
  description = "Cloud provider selection. Only 'gcp' is supported in this configuration."
  default     = "gcp"

  validation {
    condition     = var.cloud_provider == "gcp"
    error_message = "cloud_provider must be 'gcp'. AWS support is not implemented in this configuration."
  }
}

variable "domain" {
  type        = string
  description = "Base domain for public DNS records (e.g. 'iexcel.app', 'dev.iexcel.app')."
}

# ─── Networking ────────────────────────────────────────────────────────────────

variable "vpc_cidr" {
  type        = string
  description = "CIDR block for the VPC (used as the primary IP range for the network)."
  default     = "10.0.0.0/16"
}

variable "private_subnet_cidr" {
  type        = string
  description = "CIDR for the private subnet (containers and databases)."
  default     = "10.0.1.0/24"
}

variable "public_subnet_cidr" {
  type        = string
  description = "CIDR for the public subnet (load balancer)."
  default     = "10.0.2.0/24"
}

variable "vpc_connector_cidr" {
  type        = string
  description = "CIDR range for the Serverless VPC Access connector used by Cloud Run. Must be a /28 not in use by other subnets."
  default     = "10.8.0.0/28"
}

# ─── Database ─────────────────────────────────────────────────────────────────

variable "db_instance_tier" {
  type        = string
  description = "Cloud SQL machine tier for the product database (e.g. 'db-f1-micro', 'db-custom-2-7680')."
}

variable "auth_db_instance_tier" {
  type        = string
  description = "Cloud SQL machine tier for the auth database."
}

variable "postgres_version" {
  type        = string
  description = "PostgreSQL major version string for Cloud SQL (e.g. 'POSTGRES_15')."
  default     = "POSTGRES_15"
}

variable "backup_retention_days" {
  type        = number
  description = "Number of days to retain automated database backups."

  validation {
    condition     = var.backup_retention_days >= 1 && var.backup_retention_days <= 365
    error_message = "backup_retention_days must be between 1 and 365."
  }
}

variable "deletion_protection" {
  type        = bool
  description = "Enable deletion protection on databases and secrets. Should be true for staging and production."
}

variable "db_name" {
  type        = string
  description = "Name of the default database created in the product Cloud SQL instance."
  default     = "iexcel"
}

variable "auth_db_name" {
  type        = string
  description = "Name of the default database created in the auth Cloud SQL instance."
  default     = "iexcel_auth"
}

# ─── Container Registry ────────────────────────────────────────────────────────

variable "image_retention_count" {
  type        = number
  description = "Number of most-recent tagged images to retain per repository in Artifact Registry."
  default     = 10

  validation {
    condition     = var.image_retention_count >= 1 && var.image_retention_count <= 100
    error_message = "image_retention_count must be between 1 and 100."
  }
}

# ─── State Backend ─────────────────────────────────────────────────────────────

variable "terraform_state_bucket" {
  type        = string
  description = "Name of the GCS bucket that holds Terraform remote state. Must exist before terraform init."
  default     = "iexcel-terraform-state"
}
