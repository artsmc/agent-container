# DNS module — GCP Global External Load Balancer + Cloud DNS managed zone.
#
# Architecture:
#   internet → Global IP → HTTPS LB → URL map → backend services (stubs)
#   internet → Global IP → HTTP LB  → redirect → HTTPS
#
# The URL map routes by hostname:
#   app.{domain}  → ui-backend  (Next.js SSR)
#   api.{domain}  → api-backend (Fastify API)
#   auth.{domain} → auth-backend (Custom OIDC)
#
# Backend services are initially created with no backends attached (stubs).
# Feature 36 (Cloud Run deployment) passes Serverless NEG self-links via
# var.neg_ids. When non-null, a dynamic backend block attaches the NEG to the
# corresponding backend service (in-place update, no resource recreation).
#
# SSL certificate: Google-managed wildcard cert for *.{domain}.
# Google handles certificate provisioning, rotation, and renewal automatically.
# The cert becomes ACTIVE once DNS propagates and Google can verify domain ownership.
#
# Note: ssl_certificate provisioning can take 10–60 minutes after the DNS A
# records are created. Deployments should wait for ACTIVE state before testing.

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_labels = {
    environment = var.environment
    project     = var.project_name
    managed-by  = "terraform"
    feature     = "02-terraform-base-infra"
  }

  # Subdomain-to-service mapping. Keys are used as resource name suffixes.
  services = {
    ui   = "app.${var.domain}"
    api  = "api.${var.domain}"
    auth = "auth.${var.domain}"
  }

  # DNS zone name: replace dots with hyphens (GCP zone names cannot contain dots).
  # e.g. "dev.iexcel.app" → "dev-iexcel-app"
  dns_zone_name = "${local.name_prefix}-zone"
}

# ─── Global External IP Address ────────────────────────────────────────────────
# A single anycast IP serves all three subdomains. The URL map routes by
# Host header after TLS termination at the load balancer.

resource "google_compute_global_address" "lb_ip" {
  project      = var.gcp_project_id
  name         = "${local.name_prefix}-lb-ip"
  address_type = "EXTERNAL"
  ip_version   = "IPV4"
  description  = "Global external IP for the ${var.project_name} ${var.environment} load balancer."
}

# ─── Google-Managed SSL Certificate ────────────────────────────────────────────
# Wildcard certificate covering *.{domain} for all subdomains.
# Google automatically provisions and renews this certificate.
# The certificate domain must exactly match how clients connect.

resource "google_compute_managed_ssl_certificate" "wildcard" {
  project     = var.gcp_project_id
  name        = "${local.name_prefix}-wildcard-cert"
  description = "Google-managed wildcard TLS certificate for *.${var.domain}."

  managed {
    domains = ["*.${var.domain}", var.domain]
  }
}

# ─── Health Checks ─────────────────────────────────────────────────────────────
# Separate health checks per service allow independent health monitoring and
# alerting. Cloud Run services respond on port 8080 with a /health endpoint
# (to be implemented in feature 05 and feature 35 respectively).
#
# For Cloud Run Serverless NEG backends (attached by feature 36), the LB uses
# HTTP health checks directed at the Cloud Run URL, not the IP-based checks here.
# These TCP health checks serve as stubs until NEGs are attached.

resource "google_compute_health_check" "services" {
  for_each = local.services

  project             = var.gcp_project_id
  name                = "${local.name_prefix}-${each.key}-health"
  description         = "HTTP health check for the ${each.key} backend service."
  check_interval_sec  = 10
  timeout_sec         = 5
  healthy_threshold   = 2
  unhealthy_threshold = 3

  http_health_check {
    port         = 80
    request_path = "/health"
  }
}

# ─── Backend Services (Stubs) ──────────────────────────────────────────────────
# Backend services are created without any backends attached (no backends block).
# Feature 36 will call google_compute_backend_service.add() or use
# google_compute_region_network_endpoint_group to attach Cloud Run NEGs.
#
# Protocol HTTPS is appropriate for Cloud Run Serverless NEGs which accept HTTPS.
# load_balancing_scheme = EXTERNAL_MANAGED uses the newer Envoy-based proxy,
# which is required for Serverless NEG backends.

resource "google_compute_backend_service" "services" {
  for_each = local.services

  project               = var.gcp_project_id
  name                  = "${local.name_prefix}-${each.key}-backend"
  description           = "Backend service for ${each.key} (${each.value}). Serverless NEG attached by feature 36 when var.neg_ids.${each.key} is set."
  protocol              = "HTTPS"
  port_name             = "https"
  timeout_sec           = 30
  load_balancing_scheme = "EXTERNAL_MANAGED"

  # Enable Cloud CDN on the UI backend only. CDN caches static Next.js assets
  # (/_next/static/**) at Google's edge POPs to reduce Cloud Run cold starts
  # and improve global response times.
  enable_cdn = each.key == "ui" ? var.enable_ui_cdn : false

  # Attach a Serverless NEG when one has been provisioned by the app module
  # (feature 36). The dynamic block produces an empty list (no backend block)
  # when neg_ids is null, making the backend service a no-backend stub for the
  # initial base infrastructure apply. Adding a NEG on a subsequent apply causes
  # an in-place update — no resource recreation.
  dynamic "backend" {
    for_each = var.neg_ids[each.key] != null ? [var.neg_ids[each.key]] : []
    content {
      group = backend.value
    }
  }

  # Health check is attached for monitoring; Serverless NEG backends do not use
  # traditional health check probes but GCP still requires the field.
  health_checks = [google_compute_health_check.services[each.key].id]

  # Log all requests for audit trail and debugging.
  log_config {
    enable      = true
    sample_rate = 1.0
  }
}

# ─── URL Map — HTTPS ───────────────────────────────────────────────────────────
# Routes incoming HTTPS requests to the correct backend service based on the
# Host header. Requests that do not match any host rule return a 404.
# The default service (ui-backend) handles requests not matching any host rule.

resource "google_compute_url_map" "https" {
  project         = var.gcp_project_id
  name            = "${local.name_prefix}-https-url-map"
  description     = "HTTPS URL map with host-based routing for ${var.domain}."
  default_service = google_compute_backend_service.services["ui"].id

  host_rule {
    hosts        = ["app.${var.domain}"]
    path_matcher = "ui-paths"
  }

  host_rule {
    hosts        = ["api.${var.domain}"]
    path_matcher = "api-paths"
  }

  host_rule {
    hosts        = ["auth.${var.domain}"]
    path_matcher = "auth-paths"
  }

  path_matcher {
    name            = "ui-paths"
    default_service = google_compute_backend_service.services["ui"].id
  }

  path_matcher {
    name            = "api-paths"
    default_service = google_compute_backend_service.services["api"].id
  }

  path_matcher {
    name            = "auth-paths"
    default_service = google_compute_backend_service.services["auth"].id
  }
}

# ─── URL Map — HTTP to HTTPS Redirect ──────────────────────────────────────────
# All HTTP (port 80) traffic is redirected to HTTPS with a 301 permanent redirect.
# The redirect preserves the original path and query string.

resource "google_compute_url_map" "http_redirect" {
  project     = var.gcp_project_id
  name        = "${local.name_prefix}-http-redirect"
  description = "HTTP to HTTPS redirect for all ${var.domain} traffic."

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

# ─── HTTPS Target Proxy ────────────────────────────────────────────────────────

resource "google_compute_target_https_proxy" "main" {
  project          = var.gcp_project_id
  name             = "${local.name_prefix}-https-proxy"
  description      = "HTTPS target proxy for the ${var.project_name} ${var.environment} load balancer."
  url_map          = google_compute_url_map.https.id
  ssl_certificates = [google_compute_managed_ssl_certificate.wildcard.id]

  # Enforce TLS 1.2+ (TLS 1.0 and 1.1 are deprecated and insecure).
  ssl_policy = google_compute_ssl_policy.modern.id
}

# ─── HTTP Target Proxy ─────────────────────────────────────────────────────────

resource "google_compute_target_http_proxy" "redirect" {
  project     = var.gcp_project_id
  name        = "${local.name_prefix}-http-redirect-proxy"
  description = "HTTP target proxy that redirects all traffic to HTTPS."
  url_map     = google_compute_url_map.http_redirect.id
}

# ─── SSL Policy ────────────────────────────────────────────────────────────────
# MODERN profile enforces TLS 1.2+ and uses a curated set of modern cipher suites.
# This satisfies SOC2 and PCI-DSS requirements for in-transit encryption.

resource "google_compute_ssl_policy" "modern" {
  project         = var.gcp_project_id
  name            = "${local.name_prefix}-ssl-policy"
  description     = "SSL policy enforcing TLS 1.2+ with modern cipher suites."
  profile         = "MODERN"
  min_tls_version = "TLS_1_2"
}

# ─── Global Forwarding Rules ───────────────────────────────────────────────────
# Two forwarding rules share the same global IP: one for HTTPS (443) and one
# for HTTP (80, which redirects to HTTPS).

resource "google_compute_global_forwarding_rule" "https" {
  project               = var.gcp_project_id
  name                  = "${local.name_prefix}-https-forwarding"
  description           = "Forward HTTPS traffic (port 443) from the global IP to the HTTPS proxy."
  ip_address            = google_compute_global_address.lb_ip.address
  ip_protocol           = "TCP"
  port_range            = "443"
  target                = google_compute_target_https_proxy.main.id
  load_balancing_scheme = "EXTERNAL_MANAGED"

  labels = local.common_labels
}

resource "google_compute_global_forwarding_rule" "http_redirect" {
  project               = var.gcp_project_id
  name                  = "${local.name_prefix}-http-redirect-forwarding"
  description           = "Forward HTTP traffic (port 80) from the global IP to the HTTP redirect proxy."
  ip_address            = google_compute_global_address.lb_ip.address
  ip_protocol           = "TCP"
  port_range            = "80"
  target                = google_compute_target_http_proxy.redirect.id
  load_balancing_scheme = "EXTERNAL_MANAGED"

  labels = local.common_labels
}

# ─── Cloud DNS Managed Zone ────────────────────────────────────────────────────
# Public managed zone for the domain. NS and SOA records are automatically
# created by GCP. After provisioning, update your domain registrar's name
# servers to the values in the name_servers output.

resource "google_dns_managed_zone" "main" {
  project     = var.gcp_project_id
  name        = local.dns_zone_name
  dns_name    = "${var.domain}."
  description = "Public DNS managed zone for ${var.domain} (${var.environment} environment)."
  visibility  = "public"

  labels = local.common_labels

  dnssec_config {
    state = "on"
  }
}

# ─── DNS A Records ─────────────────────────────────────────────────────────────
# Create A records pointing each subdomain to the global load balancer IP.
# TTL of 300 seconds (5 minutes) balances propagation speed and DNS cache load.
# Increase TTL to 3600+ once the infrastructure is stable.

resource "google_dns_record_set" "subdomains" {
  for_each = local.services

  project      = var.gcp_project_id
  managed_zone = google_dns_managed_zone.main.name
  name         = "${each.value}."
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_global_address.lb_ip.address]
}

# Root domain A record (points bare domain to the LB IP as well).
resource "google_dns_record_set" "root" {
  project      = var.gcp_project_id
  managed_zone = google_dns_managed_zone.main.name
  name         = "${var.domain}."
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_global_address.lb_ip.address]
}
