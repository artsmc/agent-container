# Outputs from the product database module.
# Consumed by root outputs.tf and the secret-population bootstrap process.

output "instance_id" {
  description = "Unique name of the Cloud SQL instance within the GCP project."
  value       = google_sql_database_instance.main.name
}

output "connection_string_secret_name" {
  description = "GCP Secret Manager secret ID holding the DATABASE_URL connection string. Consumed by Cloud Run services (feature 36) for environment variable injection."
  value       = google_secret_manager_secret.database_url.secret_id
}

output "private_ip" {
  description = "Private IP address allocated to the Cloud SQL instance via PSA peering. Only reachable from within the VPC."
  value       = google_sql_database_instance.main.private_ip_address
}

output "port" {
  description = "TCP port for PostgreSQL connections. Always 5432 for Cloud SQL."
  value       = 5432
}

output "database_name" {
  description = "Name of the default database created within the instance."
  value       = google_sql_database.main.name
}

output "app_user_name" {
  description = "Name of the application database user (not the postgres superuser)."
  value       = google_sql_user.app_user.name
}
