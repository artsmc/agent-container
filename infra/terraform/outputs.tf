# Root outputs — consumed by CI/CD pipelines, feature 36 (app deployment),
# and developer tooling. Sensitive values are marked sensitive = true.

# ─── Database ─────────────────────────────────────────────────────────────────

output "database_private_ip" {
  description = "Private IP address of the product Cloud SQL instance."
  value       = module.database.private_ip
}

output "database_connection_secret" {
  description = "GCP Secret Manager secret name holding DATABASE_URL for the product database."
  value       = module.database.connection_string_secret_name
}

output "auth_database_private_ip" {
  description = "Private IP address of the auth Cloud SQL instance."
  value       = module.auth_database.private_ip
}

output "auth_database_connection_secret" {
  description = "GCP Secret Manager secret name holding AUTH_DATABASE_URL."
  value       = module.auth_database.connection_string_secret_name
}

# ─── Container Registry ────────────────────────────────────────────────────────

output "container_registry_url" {
  description = "Base URL for the Artifact Registry (e.g. us-central1-docker.pkg.dev/project/iexcel-dev)."
  value       = module.container_registry.registry_url
}

output "repository_urls" {
  description = "Map of application name to full Artifact Registry repository URL."
  value       = module.container_registry.repository_urls
}

# ─── DNS and Load Balancer ─────────────────────────────────────────────────────

output "load_balancer_dns" {
  description = "Global IP address (as string) of the Cloud Load Balancer. Use for DNS A records in external DNS providers."
  value       = module.dns.load_balancer_dns
}

output "ui_backend_service_id" {
  description = "GCP backend service ID for the UI container. Consumed by feature 36 to attach Cloud Run NEGs."
  value       = module.dns.ui_backend_service_id
}

output "api_backend_service_id" {
  description = "GCP backend service ID for the API container. Consumed by feature 36 to attach Cloud Run NEGs."
  value       = module.dns.api_backend_service_id
}

output "auth_backend_service_id" {
  description = "GCP backend service ID for the Auth container. Consumed by feature 36 to attach Cloud Run NEGs."
  value       = module.dns.auth_backend_service_id
}

# ─── IAM Service Accounts ──────────────────────────────────────────────────────

output "api_service_account" {
  description = "Service account email for the API Cloud Run service."
  value       = module.iam.api_service_account
}

output "auth_service_account" {
  description = "Service account email for the Auth Cloud Run service."
  value       = module.iam.auth_service_account
}

output "mastra_service_account" {
  description = "Service account email for the Mastra Cloud Run service."
  value       = module.iam.mastra_service_account
}

output "ui_service_account" {
  description = "Service account email for the UI Cloud Run service."
  value       = module.iam.ui_service_account
}

output "cicd_service_account" {
  description = "Service account email for the CI/CD pipeline (Artifact Registry push, Cloud Run deploy, Terraform state)."
  value       = module.iam.cicd_service_account
}

# ─── Secrets ──────────────────────────────────────────────────────────────────

output "all_secret_names" {
  description = "Map of logical secret name to GCP Secret Manager secret ID. Consumed by feature 36 for secret injection into Cloud Run."
  value       = module.secrets.secret_names
}

# ─── Networking ────────────────────────────────────────────────────────────────

output "vpc_id" {
  description = "Self-link of the VPC network."
  value       = module.networking.vpc_id
}

output "vpc_connector_id" {
  description = "Serverless VPC Access connector ID for Cloud Run services."
  value       = module.networking.vpc_connector_id
}

# ─── App Service URLs (Feature 36) ─────────────────────────────────────────────

output "auth_service_url" {
  description = "Direct Cloud Run URL of the auth service. Use for health verification. Public access is via https://auth.{domain} through the load balancer."
  value       = module.auth.service_url
}

output "api_service_url" {
  description = "Direct Cloud Run URL of the api service. Use for health verification. Public access is via https://api.{domain} through the load balancer."
  value       = module.api.service_url
}

output "mastra_service_url" {
  description = "Internal Cloud Run URL of the mastra service. Copy this value into the mastra_url variable in your .tfvars file and re-apply to wire the API service to mastra."
  value       = module.mastra.service_url
}

output "ui_service_url" {
  description = "Direct Cloud Run URL of the UI service. Use for health verification. Public access is via https://app.{domain} through the load balancer."
  value       = module.ui.service_url
}
