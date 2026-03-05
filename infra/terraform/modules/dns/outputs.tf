# Outputs from the DNS module.
# Consumed by root outputs.tf and feature 36 (Cloud Run deployment).

output "load_balancer_dns" {
  description = "Global external IP address (as a string) of the Cloud Load Balancer. Use this value to configure A records in any external DNS provider, or verify it matches the Cloud DNS zone A records."
  value       = google_compute_global_address.lb_ip.address
}

output "load_balancer_id" {
  description = "Self-link of the global forwarding rule (HTTPS). Used by feature 36 to reference the load balancer when attaching NEG backends."
  value       = google_compute_global_forwarding_rule.https.id
}

output "ui_backend_service_id" {
  description = "Self-link of the UI backend service. Feature 36 calls google_compute_backend_service data source or adds NEG backends to this service ID."
  value       = google_compute_backend_service.services["ui"].id
}

output "api_backend_service_id" {
  description = "Self-link of the API backend service. Feature 36 calls google_compute_backend_service data source or adds NEG backends to this service ID."
  value       = google_compute_backend_service.services["api"].id
}

output "auth_backend_service_id" {
  description = "Self-link of the auth backend service. Feature 36 calls google_compute_backend_service data source or adds NEG backends to this service ID."
  value       = google_compute_backend_service.services["auth"].id
}

output "dns_zone_name" {
  description = "Name of the Cloud DNS managed zone. Used to add additional DNS records in other modules or manually."
  value       = google_dns_managed_zone.main.name
}

output "dns_name_servers" {
  description = "Authoritative name servers for the Cloud DNS managed zone. Update your domain registrar's NS records to these values to delegate DNS management to GCP."
  value       = google_dns_managed_zone.main.name_servers
}

output "ssl_certificate_id" {
  description = "Self-link of the Google-managed SSL certificate. Monitor the managed_status field for ACTIVE status before routing production traffic."
  value       = google_compute_managed_ssl_certificate.wildcard.id
}
