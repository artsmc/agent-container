# Outputs from the auth database module.
# Consumed by root outputs.tf and the secret-population bootstrap process.

output "instance_id" {
  description = "Unique name of the auth Cloud SQL instance within the GCP project."
  value       = google_sql_database_instance.auth.name
}

output "connection_string_secret_name" {
  description = "GCP Secret Manager secret ID holding the AUTH_DATABASE_URL connection string. Consumed by the auth Cloud Run service (feature 36) for environment variable injection."
  value       = google_secret_manager_secret.auth_database_url.secret_id
}

output "private_ip" {
  description = "Private IP address allocated to the auth Cloud SQL instance via PSA peering. Only reachable from within the VPC."
  value       = google_sql_database_instance.auth.private_ip_address
}

output "port" {
  description = "TCP port for PostgreSQL connections. Always 5432 for Cloud SQL."
  value       = 5432
}

output "database_name" {
  description = "Name of the default database created within the auth instance."
  value       = google_sql_database.auth.name
}

output "app_user_name" {
  description = "Name of the auth application database user."
  value       = google_sql_user.auth_app_user.name
}
