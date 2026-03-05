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
  description = "GCP region for all regional networking resources."
}

variable "private_subnet_cidr" {
  type        = string
  description = "CIDR range for the private subnet (Cloud Run VPC connector and Cloud SQL)."
  default     = "10.0.1.0/24"
}

variable "public_subnet_cidr" {
  type        = string
  description = "CIDR range for the public subnet (load balancer). Note: GCP global load balancers are not subnet-bound; this is reserved for potential regional resources."
  default     = "10.0.2.0/24"
}

variable "vpc_connector_cidr" {
  type        = string
  description = "CIDR /28 block for the Serverless VPC Access connector. Must not overlap with other subnets."
  default     = "10.8.0.0/28"
}
