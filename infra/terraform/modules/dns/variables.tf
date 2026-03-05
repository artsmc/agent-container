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
