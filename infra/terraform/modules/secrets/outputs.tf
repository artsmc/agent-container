# Outputs from the secrets module.
# Consumed by the iam module (for access bindings) and root outputs.tf.

output "secret_names" {
  description = "Map of logical secret name to GCP Secret Manager secret ID. Key is the logical name (e.g. 'DATABASE_URL'), value is the GCP secret ID (e.g. 'iexcel-dev-DATABASE_URL'). Consumed by the iam module to create least-privilege access bindings."
  value = {
    for name, secret in google_secret_manager_secret.app_secrets :
    name => secret.secret_id
  }
}

output "secret_resource_ids" {
  description = "Map of logical secret name to GCP Secret Manager secret resource ID (full resource path). Used for IAM binding resource references."
  value = {
    for name, secret in google_secret_manager_secret.app_secrets :
    name => secret.id
  }
}

# Individual named outputs for secrets consumed by other modules or CI/CD
# processes that reference specific secrets by name rather than iterating the map.

output "database_url_secret" {
  description = "GCP secret ID for DATABASE_URL. Populated by operators using the product database module output after initial provisioning."
  value       = google_secret_manager_secret.app_secrets["DATABASE_URL"].secret_id
}

output "auth_database_url_secret" {
  description = "GCP secret ID for AUTH_DATABASE_URL. Populated by operators using the auth-database module output after initial provisioning."
  value       = google_secret_manager_secret.app_secrets["AUTH_DATABASE_URL"].secret_id
}

output "signing_key_private_secret" {
  description = "GCP secret ID for SIGNING_KEY_PRIVATE (RS256 private key for JWT signing in the auth service)."
  value       = google_secret_manager_secret.app_secrets["SIGNING_KEY_PRIVATE"].secret_id
}

output "signing_key_public_secret" {
  description = "GCP secret ID for SIGNING_KEY_PUBLIC (RS256 public key for JWT verification)."
  value       = google_secret_manager_secret.app_secrets["SIGNING_KEY_PUBLIC"].secret_id
}
