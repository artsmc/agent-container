# Outputs from the container registry module.
# Consumed by root outputs.tf, the iam module (for IAM bindings), and
# CI/CD pipelines for push/pull commands.

output "registry_url" {
  description = "Base URL for the Artifact Registry in the format {region}-docker.pkg.dev/{project_id}/{name_prefix}. Use as a prefix when tagging images for push."
  # This is a logical base URL — individual repository URLs are in repository_urls.
  # The value here represents the registry host + project path.
  value       = "${var.region}-docker.pkg.dev/${var.gcp_project_id}/${var.project_name}-${var.environment}"
}

output "repository_urls" {
  description = "Map of application name to full Artifact Registry repository URL. Key is the app name (e.g. 'api'), value is the full pull/push URL."
  value = {
    for app_name, repo in google_artifact_registry_repository.app_repos :
    app_name => "${var.region}-docker.pkg.dev/${var.gcp_project_id}/${repo.repository_id}"
  }
}

output "repository_ids" {
  description = "Map of application name to Artifact Registry repository resource ID. Used by the iam module to create IAM bindings."
  value = {
    for app_name, repo in google_artifact_registry_repository.app_repos :
    app_name => repo.id
  }
}
