# Outputs from the mastra Cloud Run module.
# Note: mastra has no Serverless NEG because it is not publicly exposed
# via the load balancer. It is accessible only internally by the API service.

output "service_url" {
  description = "Internal HTTPS URL of the mastra Cloud Run service. Passed to the api module as mastra_url after initial deployment."
  value       = google_cloud_run_v2_service.service.uri
}

output "service_name" {
  description = "Name of the Cloud Run v2 service resource. Used for IAM bindings and deployment references."
  value       = google_cloud_run_v2_service.service.name
}
