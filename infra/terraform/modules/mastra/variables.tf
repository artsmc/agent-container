# Variables for the mastra Cloud Run module.

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
  description = "Full Artifact Registry image URL including tag (e.g. 'us-central1-docker.pkg.dev/project/iexcel-dev/mastra:sha-abc123')."
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

variable "api_base_url" {
  type        = string
  description = "Internal Cloud Run service URL of the API service. Populated from module.api.service_url."
}

variable "domain" {
  type        = string
  description = "Base domain for this environment (e.g. 'dev.iexcel.app'). Used to construct AUTH_ISSUER_URL."
}

variable "api_service_account_email" {
  type        = string
  description = "Email of the API service account. Granted roles/run.invoker on the mastra service so the API can call mastra internally."
}

variable "mastra_client_id" {
  type        = string
  description = "Client ID used by the mastra service when authenticating with the auth service. Corresponds to the MASTRA_CLIENT_ID env var."
  default     = "mastra-agent"
}

variable "llm_provider" {
  type        = string
  description = "LLM provider identifier (e.g. 'anthropic', 'openai')."
  default     = "anthropic"
}

variable "llm_model" {
  type        = string
  description = "LLM model name to use for AI agent tasks (e.g. 'claude-sonnet-4-20250514', 'gpt-4o')."
  default     = "claude-sonnet-4-20250514"
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
  default     = 3

  validation {
    condition     = var.max_instances >= 1
    error_message = "max_instances must be >= 1."
  }
}
