# Networking module — provisions the VPC, subnets, Cloud NAT, firewall rules,
# Private Services Access (PSA) for Cloud SQL, and Serverless VPC Access
# connector for Cloud Run.
#
# GCP uses network-level firewall rules with target tags rather than security
# groups attached to instances. Each logical security boundary is represented
# as a named network tag applied to resources (containers, databases, LB).
#
# Tag conventions:
#   container-tag  → applied to Cloud Run VPC connector / instances
#   lb-tag         → applied to load balancer (used in firewall egress rules)
# Cloud SQL is not tagged — it is protected by restricting source IP ranges
# to the private subnet CIDR.

locals {
  name_prefix    = "${var.project_name}-${var.environment}"
  container_tag  = "${local.name_prefix}-container"
  lb_tag         = "${local.name_prefix}-lb"
  common_labels = {
    environment  = var.environment
    project      = var.project_name
    managed-by   = "terraform"
    feature      = "02-terraform-base-infra"
  }
}

# ─── VPC ───────────────────────────────────────────────────────────────────────

resource "google_compute_network" "vpc" {
  project                 = var.gcp_project_id
  name                    = "${local.name_prefix}-vpc"
  auto_create_subnetworks = false
  description             = "VPC for ${var.project_name} ${var.environment} environment."
}

# ─── Subnets ───────────────────────────────────────────────────────────────────

# Private subnet: Cloud Run (via VPC connector) and Cloud SQL (via PSA peering).
resource "google_compute_subnetwork" "private" {
  project       = var.gcp_project_id
  name          = "${local.name_prefix}-private-subnet"
  network       = google_compute_network.vpc.id
  region        = var.region
  ip_cidr_range = var.private_subnet_cidr

  # Enable Private Google Access so resources in this subnet can reach GCP APIs
  # (Secret Manager, Artifact Registry) without a public IP.
  private_ip_google_access = true

  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

# Public subnet: reserved for potential regional resources co-located with the
# load balancer. GCP global load balancers are not subnet-bound but regional
# resources (e.g. NEGs, health-check probes) benefit from proximity.
resource "google_compute_subnetwork" "public" {
  project       = var.gcp_project_id
  name          = "${local.name_prefix}-public-subnet"
  network       = google_compute_network.vpc.id
  region        = var.region
  ip_cidr_range = var.public_subnet_cidr

  private_ip_google_access = false
}

# ─── Private Services Access (PSA) ─────────────────────────────────────────────
# Required for Cloud SQL private IP connectivity. Cloud SQL instances connect
# via VPC peering to a Google-managed services network. This block allocates
# an IP range for that peering and establishes the service networking connection.

resource "google_compute_global_address" "psa_range" {
  project       = var.gcp_project_id
  name          = "${local.name_prefix}-psa-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
  description   = "IP range allocated for Private Services Access peering (Cloud SQL)."
}

resource "google_service_networking_connection" "psa_connection" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.psa_range.name]
}

# ─── Cloud Router + NAT ────────────────────────────────────────────────────────
# Cloud NAT provides outbound internet access for Cloud Run services so they
# can call external APIs (Asana, Grain, LLM providers) from the private network.

resource "google_compute_router" "nat_router" {
  project     = var.gcp_project_id
  name        = "${local.name_prefix}-nat-router"
  network     = google_compute_network.vpc.id
  region      = var.region
  description = "Router for Cloud NAT outbound internet access."
}

resource "google_compute_router_nat" "nat" {
  project                            = var.gcp_project_id
  name                               = "${local.name_prefix}-nat"
  router                             = google_compute_router.nat_router.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "LIST_OF_SUBNETWORKS"

  # Provide NAT only for the private subnet where Cloud Run connectors reside.
  subnetwork {
    name                    = google_compute_subnetwork.private.id
    source_ip_ranges_to_nat = ["ALL_IP_RANGES"]
  }

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

# ─── Serverless VPC Access Connector ──────────────────────────────────────────
# Cloud Run services require a Serverless VPC Access connector to connect to
# private VPC resources (Cloud SQL via PSA, internal services).

resource "google_vpc_access_connector" "connector" {
  project       = var.gcp_project_id
  name          = "${local.name_prefix}-connector"
  region        = var.region
  network       = google_compute_network.vpc.name
  ip_cidr_range = var.vpc_connector_cidr

  # Minimum and maximum throughput instances. Kept minimal for dev; scale in
  # larger environments by bumping max_throughput.
  min_instances = 2
  max_instances = 3
}

# ─── Firewall Rules ────────────────────────────────────────────────────────────
# GCP firewall rules are network-scoped. Resources are identified by network
# tags (target_tags) or service accounts (target_service_accounts).
#
# Rule matrix:
#   allow-lb-ingress-http      → 0.0.0.0/0 :80  → lb-tag
#   allow-lb-ingress-https     → 0.0.0.0/0 :443 → lb-tag
#   allow-lb-to-container      → lb-tag :8080   → container-tag
#   allow-container-to-sql     → private-subnet :5432 → (all instances in VPC)
#   deny-all-ingress-container → all             → container-tag (lower priority)
#   allow-iap-ssh              → IAP range :22   → (optional, for debugging)

# Allow HTTP and HTTPS ingress to load balancer from the internet.
resource "google_compute_firewall" "allow_lb_ingress_http" {
  project     = var.gcp_project_id
  name        = "${local.name_prefix}-allow-lb-http"
  network     = google_compute_network.vpc.name
  description = "Allow HTTP (port 80) ingress to load balancer from the internet."
  direction   = "INGRESS"
  priority    = 1000

  allow {
    protocol = "tcp"
    ports    = ["80"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = [local.lb_tag]
}

resource "google_compute_firewall" "allow_lb_ingress_https" {
  project     = var.gcp_project_id
  name        = "${local.name_prefix}-allow-lb-https"
  network     = google_compute_network.vpc.name
  description = "Allow HTTPS (port 443) ingress to load balancer from the internet."
  direction   = "INGRESS"
  priority    = 1000

  allow {
    protocol = "tcp"
    ports    = ["443"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = [local.lb_tag]
}

# GCP global load balancers use health check probes from the 130.211.0.0/22
# and 35.191.0.0/16 ranges. Allow these to reach container instances.
resource "google_compute_firewall" "allow_lb_health_checks" {
  project     = var.gcp_project_id
  name        = "${local.name_prefix}-allow-lb-health"
  network     = google_compute_network.vpc.name
  description = "Allow GCP load balancer health check probes to reach container instances."
  direction   = "INGRESS"
  priority    = 1000

  allow {
    protocol = "tcp"
    ports    = ["8080"]
  }

  source_ranges = ["130.211.0.0/22", "35.191.0.0/16"]
  target_tags   = [local.container_tag]
}

# Allow load balancer to forward traffic to containers on port 8080.
resource "google_compute_firewall" "allow_lb_to_container" {
  project     = var.gcp_project_id
  name        = "${local.name_prefix}-allow-lb-to-container"
  network     = google_compute_network.vpc.name
  description = "Allow load balancer to forward requests to container instances on port 8080."
  direction   = "INGRESS"
  priority    = 900

  allow {
    protocol = "tcp"
    ports    = ["8080"]
  }

  source_tags = [local.lb_tag]
  target_tags = [local.container_tag]
}

# Allow outbound traffic from containers to the internet via Cloud NAT.
# This enables calling external APIs: Asana, Grain, LLM providers.
resource "google_compute_firewall" "allow_container_egress" {
  project     = var.gcp_project_id
  name        = "${local.name_prefix}-allow-container-egress"
  network     = google_compute_network.vpc.name
  description = "Allow containers to make outbound calls to external APIs via Cloud NAT."
  direction   = "EGRESS"
  priority    = 1000

  allow {
    protocol = "all"
  }

  destination_ranges = ["0.0.0.0/0"]
  target_tags        = [local.container_tag]
}

# Allow containers to connect to Cloud SQL on port 5432 within the private subnet.
resource "google_compute_firewall" "allow_container_to_sql" {
  project     = var.gcp_project_id
  name        = "${local.name_prefix}-allow-container-to-sql"
  network     = google_compute_network.vpc.name
  description = "Allow container instances to connect to Cloud SQL on port 5432."
  direction   = "INGRESS"
  priority    = 800

  allow {
    protocol = "tcp"
    ports    = ["5432"]
  }

  # Restrict: only traffic originating from the private subnet (container CIDR)
  # is permitted to reach the database.
  source_ranges = [var.private_subnet_cidr]
}

# Deny all other ingress to container instances. Lower priority number = higher
# priority in GCP. This default-deny is enforced by GCP's implicit deny rule
# (priority 65535), but an explicit rule documents intent.
resource "google_compute_firewall" "deny_all_container_ingress" {
  project     = var.gcp_project_id
  name        = "${local.name_prefix}-deny-container-ingress"
  network     = google_compute_network.vpc.name
  description = "Deny all non-lb ingress to container instances."
  direction   = "INGRESS"
  priority    = 2000

  deny {
    protocol = "all"
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = [local.container_tag]
}
