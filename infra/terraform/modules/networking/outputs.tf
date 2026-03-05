output "vpc_id" {
  description = "Self-link of the VPC network. Used by database modules for Cloud SQL private IP configuration."
  value       = google_compute_network.vpc.self_link
}

output "network_name" {
  description = "Name of the VPC network. Used by database and IAM modules."
  value       = google_compute_network.vpc.name
}

output "private_subnet_id" {
  description = "Self-link of the private subnet."
  value       = google_compute_subnetwork.private.self_link
}

output "public_subnet_id" {
  description = "Self-link of the public subnet."
  value       = google_compute_subnetwork.public.self_link
}

output "vpc_connector_id" {
  description = "Serverless VPC Access connector ID. Referenced by Cloud Run services (feature 36) to connect to the private VPC."
  value       = google_vpc_access_connector.connector.id
}

# In GCP, security group boundaries are expressed as network tags applied to
# resources. These tag names are passed to other modules so they can be
# consistently applied to the correct resource types.

output "container_security_group_id" {
  description = "Network tag to apply to Cloud Run containers. Controls which firewall rules apply to those instances."
  value       = local.container_tag
}

output "database_security_group_id" {
  description = "GCP firewall rule name governing database ingress. Cloud SQL does not accept tags — access is controlled by source IP range (private subnet CIDR)."
  value       = google_compute_firewall.allow_container_to_sql.name
}

output "lb_security_group_id" {
  description = "Network tag to apply to load balancer resources. Controls which firewall rules allow internet ingress."
  value       = local.lb_tag
}

output "private_subnet_cidr" {
  description = "CIDR of the private subnet. Used by IAM and database modules for source range restrictions."
  value       = var.private_subnet_cidr
}

output "psa_connection_id" {
  description = "ID of the Private Services Access connection. Database modules depend on this being established before Cloud SQL is created."
  value       = google_service_networking_connection.psa_connection.id
}
