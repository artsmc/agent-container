# Outputs from the api Cloud Run module.

output "service_url" {
  description = "Public HTTPS URL of the API Cloud Run service. Passed to the mastra module as api_base_url."
  value       = google_cloud_run_v2_service.service.uri
}

output "service_name" {
  description = "Name of the Cloud Run v2 service resource. Used for IAM bindings and deployment references."
  value       = google_cloud_run_v2_service.service.name
}

output "neg_self_link" {
  description = "Self-link of the Serverless NEG. Passed to the DNS module to attach as a backend to the api backend service stub."
  value       = google_compute_region_network_endpoint_group.neg.self_link
}

output "neg_id" {
  description = "ID of the Serverless NEG. Alternative to self_link for referencing the NEG resource."
  value       = google_compute_region_network_endpoint_group.neg.id
}
