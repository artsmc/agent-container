# Outputs from the IAM module.
# Service account emails are consumed by root outputs.tf, feature 36 (Cloud Run
# service deployment), and CI/CD pipeline configuration.

output "api_service_account" {
  description = "Email of the API Cloud Run service account. Assign to the Cloud Run API service in feature 36."
  value       = google_service_account.app_service_accounts["api"].email
}

output "auth_service_account" {
  description = "Email of the auth Cloud Run service account. Assign to the Cloud Run auth service in feature 36."
  value       = google_service_account.app_service_accounts["auth"].email
}

output "mastra_service_account" {
  description = "Email of the Mastra (AI agent) Cloud Run service account. Assign to the Cloud Run mastra service in feature 36."
  value       = google_service_account.app_service_accounts["mastra"].email
}

output "ui_service_account" {
  description = "Email of the UI Cloud Run service account. Assign to the Cloud Run UI service in feature 36."
  value       = google_service_account.app_service_accounts["ui"].email
}

output "cicd_service_account" {
  description = "Email of the CI/CD pipeline service account. Configure this in GitLab CI/CD as the Workload Identity Federation principal or as a key-based credential."
  value       = google_service_account.cicd.email
}

output "all_app_service_accounts" {
  description = "Map of application name to service account email. Used by feature 36 to assign identities to Cloud Run services."
  value = {
    for app_name, sa in google_service_account.app_service_accounts :
    app_name => sa.email
  }
}
