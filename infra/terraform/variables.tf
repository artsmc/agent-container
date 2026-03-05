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

# ─── App Deployment (Feature 36) ──────────────────────────────────────────────

variable "auth_image_url" {
  type        = string
  description = "Full Artifact Registry image URL for the auth service, including tag (e.g. 'us-central1-docker.pkg.dev/iexcel-dev/iexcel-dev-auth/auth:sha-abc123'). Set by CI/CD pipeline on each deployment."
}

variable "api_image_url" {
  type        = string
  description = "Full Artifact Registry image URL for the api service, including tag."
}

variable "mastra_image_url" {
  type        = string
  description = "Full Artifact Registry image URL for the mastra service, including tag."
}

variable "ui_image_url" {
  type        = string
  description = "Full Artifact Registry image URL for the ui service, including tag."
}

# ─── Auth Scaling ──────────────────────────────────────────────────────────────

variable "auth_min_instances" {
  type        = number
  description = "Minimum Cloud Run instances for the auth service. Set to 0 for scale-to-zero (dev), >=1 to eliminate cold starts (prod)."
  default     = 0
}

variable "auth_max_instances" {
  type        = number
  description = "Maximum Cloud Run instances for the auth service."
  default     = 3
}

# ─── API Scaling ───────────────────────────────────────────────────────────────

variable "api_min_instances" {
  type        = number
  description = "Minimum Cloud Run instances for the api service. Set to 0 for scale-to-zero (dev), >=1 to eliminate cold starts (prod)."
  default     = 0
}

variable "api_max_instances" {
  type        = number
  description = "Maximum Cloud Run instances for the api service."
  default     = 5
}

# ─── Mastra Scaling ────────────────────────────────────────────────────────────

variable "mastra_min_instances" {
  type        = number
  description = "Minimum Cloud Run instances for the mastra AI agent service. LLM initialization is slow, so consider min=1 in staging and production."
  default     = 0
}

variable "mastra_max_instances" {
  type        = number
  description = "Maximum Cloud Run instances for the mastra service. LLM calls are CPU/memory intensive; keep max lower than the API service."
  default     = 3
}

# ─── UI Scaling ────────────────────────────────────────────────────────────────

variable "ui_min_instances" {
  type        = number
  description = "Minimum Cloud Run instances for the UI service. Set to 0 for scale-to-zero (dev), >=1 to eliminate cold starts (prod)."
  default     = 0
}

variable "ui_max_instances" {
  type        = number
  description = "Maximum Cloud Run instances for the UI service."
  default     = 3
}

# ─── Inter-service Config ──────────────────────────────────────────────────────

variable "mastra_url" {
  type        = string
  description = "Internal Cloud Run URL of the mastra service. Used to configure the MASTRA_URL env var in the api service. Leave empty on initial deployment; update after mastra is deployed and its URL is known via 'terraform output mastra_service_url'."
  default     = ""
}

# ─── LLM Configuration ────────────────────────────────────────────────────────

variable "llm_provider" {
  type        = string
  description = "LLM provider used by the mastra service. Must be 'openai' or 'anthropic'."
  default     = "anthropic"

  validation {
    condition     = contains(["openai", "anthropic"], var.llm_provider)
    error_message = "llm_provider must be one of: openai, anthropic."
  }
}

variable "llm_model" {
  type        = string
  description = "LLM model name used by the mastra service (e.g. 'claude-sonnet-4-20250514', 'gpt-4o'). Must be a valid model name for the selected llm_provider."
  default     = "claude-sonnet-4-20250514"
}
