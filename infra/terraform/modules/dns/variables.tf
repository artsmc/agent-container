# Variables for the dns module (Global Load Balancer + Cloud DNS).

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

variable "domain" {
  type        = string
  description = "Base domain for public DNS records (e.g. 'iexcel.app', 'dev.iexcel.app'). Subdomains app.{domain}, api.{domain}, and auth.{domain} are configured."

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]+[a-z0-9]$", var.domain))
    error_message = "domain must be a valid DNS name (lowercase alphanumeric with dots and hyphens)."
  }
}

variable "region" {
  type        = string
  description = "GCP region. Used for resource labeling. The global load balancer itself is region-agnostic."
}

variable "vpc_id" {
  type        = string
  description = "Self-link of the VPC network. Passed from module.networking.vpc_id. Reserved for future private DNS zone configuration if required."
}

# ─── Feature 36: App Deployment ────────────────────────────────────────────────

variable "neg_ids" {
  type = object({
    ui   = optional(string, null)
    api  = optional(string, null)
    auth = optional(string, null)
  })
  description = "Map of service name to Serverless NEG self-link from the corresponding app module. When a value is non-null, the NEG is attached to the matching backend service as a backend. Populated by feature 36 after Cloud Run services are deployed."
  default = {
    ui   = null
    api  = null
    auth = null
  }
}

variable "enable_ui_cdn" {
  type        = bool
  description = "Enable Cloud CDN on the UI backend service for static asset caching at Google's edge. Should be true in all environments once the UI is deployed."
  default     = false
}
