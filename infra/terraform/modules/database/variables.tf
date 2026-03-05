# Variables for the product database module (Cloud SQL for PostgreSQL).
# All variable names must match what root main.tf passes to this module.

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
  description = "GCP region for the Cloud SQL instance."
}

variable "instance_tier" {
  type        = string
  description = "Cloud SQL machine tier (e.g. 'db-f1-micro', 'db-custom-2-7680'). Note: db-f1-micro does not support regional HA."
}

variable "postgres_version" {
  type        = string
  description = "PostgreSQL version string for Cloud SQL (e.g. 'POSTGRES_15')."
  default     = "POSTGRES_15"

  validation {
    condition     = can(regex("^POSTGRES_[0-9]+$", var.postgres_version))
    error_message = "postgres_version must match POSTGRES_<major> format (e.g. POSTGRES_15)."
  }
}

variable "vpc_self_link" {
  type        = string
  description = "Self-link of the VPC network. Used as private_network for Cloud SQL PSA peering. Comes from module.networking.vpc_id."
}

variable "private_network_name" {
  type        = string
  description = "Name of the VPC network. Used for resource references. Comes from module.networking.network_name."
}

variable "backup_retention_days" {
  type        = number
  description = "Number of days to retain automated database backups. Also controls PITR log retention."

  validation {
    condition     = var.backup_retention_days >= 1 && var.backup_retention_days <= 365
    error_message = "backup_retention_days must be between 1 and 365."
  }
}

variable "deletion_protection" {
  type        = bool
  description = "Enable deletion protection on the Cloud SQL instance. Set true for staging and production to prevent accidental destruction."
}

variable "db_name" {
  type        = string
  description = "Name of the default database to create within the Cloud SQL instance."
  default     = "iexcel"
}
