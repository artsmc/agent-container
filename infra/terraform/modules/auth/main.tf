# Auth module — Cloud Run v2 service for the custom OIDC / authentication service.
#
# Architecture:
#   internet → Global HTTPS LB → Serverless NEG → Cloud Run v2 (auth)
#
# This service handles:
#   - Custom OIDC provider (issuing ID tokens and access tokens)
#   - User authentication and session management
#   - JWT signing with RS256 keys stored in Secret Manager
#
# Secrets injected at runtime via Secret Manager (no plaintext in container env):
#   AUTH_DATABASE_URL, IDP_CLIENT_ID, IDP_CLIENT_SECRET,
#   SIGNING_KEY_PRIVATE, SIGNING_KEY_PUBLIC
#
# Traffic ingress is restricted to INTERNAL_LOAD_BALANCER so the service is
# only reachable via the HTTPS load balancer, not via its direct Cloud Run URL.

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_labels = {
    environment = var.environment
    project     = var.project_name
    managed-by  = "terraform"
    feature     = "36-terraform-app-deployment"
  }

  # Secrets required by the auth service. Keys are the env var names used
  # inside the container; values map to entries in var.secret_names.
  auth_secrets = {
    AUTH_DATABASE_URL   = "AUTH_DATABASE_URL"
    IDP_CLIENT_ID       = "IDP_CLIENT_ID"
    IDP_CLIENT_SECRET   = "IDP_CLIENT_SECRET"
    SIGNING_KEY_PRIVATE = "SIGNING_KEY_PRIVATE"
    SIGNING_KEY_PUBLIC  = "SIGNING_KEY_PUBLIC"
  }
}

# ─── Cloud Run v2 Service ──────────────────────────────────────────────────────

resource "google_cloud_run_v2_service" "service" {
  project  = var.gcp_project_id
  name     = "${local.name_prefix}-auth"
  location = var.region

  # Restrict ingress to load balancer traffic only. The direct Cloud Run URL
  # is not publicly accessible; all external traffic routes through the HTTPS LB.
  ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  labels = local.common_labels

  template {
    service_account = var.service_account

    # Route egress to the private VPC for Cloud SQL connectivity.
    # PRIVATE_RANGES_ONLY ensures public internet traffic does not traverse the connector.
    vpc_access {
      connector = var.vpc_connector_id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      name  = "auth"
      image = var.image_url

      ports {
        name           = "http1"
        container_port = 8090
      }

      # ── Secret environment variables ───────────────────────────────────────
      # Each secret is mounted as an env var from Secret Manager at runtime.
      # The service account must have secretmanager.secretAccessor on each secret.
      # Only "latest" version is referenced; rotate secrets by adding a new version.

      dynamic "env" {
        for_each = local.auth_secrets
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = var.secret_names[env.value]
              version = "latest"
            }
          }
        }
      }

      # ── Plain environment variables ────────────────────────────────────────

      env {
        name  = "AUTH_ISSUER_URL"
        value = "https://auth.${var.domain}"
      }

      env {
        name  = "PORT"
        value = "8090"
      }

      # ── Startup probe ──────────────────────────────────────────────────────
      # Checked on container startup. Cloud Run will not serve traffic until
      # this probe succeeds. More generous thresholds than liveness to allow
      # for database connection pool warm-up.

      startup_probe {
        http_get {
          path = "/health"
          port = 8090
        }
        initial_delay_seconds = 15
        period_seconds        = 5
        timeout_seconds       = 3
        failure_threshold     = 10
      }

      # ── Liveness probe ─────────────────────────────────────────────────────
      # Checked periodically after startup. Restarts the container if it fails.

      liveness_probe {
        http_get {
          path = "/health"
          port = 8090
        }
        initial_delay_seconds = 30
        period_seconds        = 30
        timeout_seconds       = 5
        failure_threshold     = 3
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        # cpu_idle = true allows CPU to be throttled when not serving requests.
        # Set to false if background goroutines require sustained CPU (e.g. cron jobs).
        cpu_idle = true
      }
    }

    labels = local.common_labels
  }
}

# ─── Public Invoker Binding ────────────────────────────────────────────────────
# Allow the load balancer to invoke the Cloud Run service without authentication.
# The service itself handles authentication at the application layer.
# Without this binding the LB would receive 403 responses from Cloud Run.

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  project  = var.gcp_project_id
  location = var.region
  name     = google_cloud_run_v2_service.service.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ─── Serverless NEG ───────────────────────────────────────────────────────────
# A Serverless Network Endpoint Group (NEG) maps the HTTPS load balancer backend
# to this Cloud Run service. The DNS module (feature 02) created a stub backend
# service for auth; the root main.tf attaches this NEG to complete the wiring.

resource "google_compute_region_network_endpoint_group" "neg" {
  project               = var.gcp_project_id
  name                  = "${local.name_prefix}-auth-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region

  cloud_run {
    service = google_cloud_run_v2_service.service.name
  }
}
