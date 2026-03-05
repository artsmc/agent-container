# API module — Cloud Run v2 service for the Fastify API backend.
#
# Architecture:
#   internet → Global HTTPS LB → Serverless NEG → Cloud Run v2 (api)
#   api → mastra (internal Cloud Run URL)
#   api → Cloud SQL product database (private IP via VPC connector)
#
# This service handles:
#   - REST API endpoints for the iExcel frontend
#   - Third-party integrations: Asana, Grain, Google, Email
#   - JWT validation using the auth service as the OIDC provider
#   - LLM orchestration via the internal mastra service
#
# Secrets injected at runtime via Secret Manager (no plaintext in container env):
#   DATABASE_URL, ASANA_CLIENT_ID, ASANA_CLIENT_SECRET, ASANA_ACCESS_TOKEN,
#   GRAIN_API_KEY, GOOGLE_SERVICE_ACCOUNT_JSON, EMAIL_PROVIDER_API_KEY, LLM_API_KEY
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

  # Secrets required by the API service. Keys are env var names used inside
  # the container; values map to logical names in var.secret_names.
  api_secrets = {
    DATABASE_URL              = "DATABASE_URL"
    ASANA_CLIENT_ID           = "ASANA_CLIENT_ID"
    ASANA_CLIENT_SECRET       = "ASANA_CLIENT_SECRET"
    ASANA_ACCESS_TOKEN        = "ASANA_ACCESS_TOKEN"
    GRAIN_API_KEY             = "GRAIN_API_KEY"
    GOOGLE_SERVICE_ACCOUNT_JSON = "GOOGLE_SERVICE_ACCOUNT_JSON"
    EMAIL_PROVIDER_API_KEY    = "EMAIL_PROVIDER_API_KEY"
    LLM_API_KEY               = "LLM_API_KEY"
  }
}

# ─── Cloud Run v2 Service ──────────────────────────────────────────────────────

resource "google_cloud_run_v2_service" "service" {
  project  = var.gcp_project_id
  name     = "${local.name_prefix}-api"
  location = var.region

  # Restrict ingress to load balancer traffic only.
  ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  labels = local.common_labels

  template {
    service_account = var.service_account

    # Route egress to the private VPC for Cloud SQL connectivity.
    # PRIVATE_RANGES_ONLY keeps public internet traffic off the connector.
    vpc_access {
      connector = var.vpc_connector_id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      name  = "api"
      image = var.image_url

      ports {
        name           = "http1"
        container_port = 8080
      }

      # ── Secret environment variables ───────────────────────────────────────

      dynamic "env" {
        for_each = local.api_secrets
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
        name  = "AUTH_AUDIENCE"
        value = var.auth_audience
      }

      # MASTRA_URL is the internal Cloud Run URL of the mastra service.
      # On initial deployment this may be empty; update after mastra is deployed.
      env {
        name  = "MASTRA_URL"
        value = var.mastra_url
      }

      env {
        name  = "PORT"
        value = "8080"
      }

      # ── Startup probe ──────────────────────────────────────────────────────

      startup_probe {
        http_get {
          path = "/health"
          port = 8080
        }
        initial_delay_seconds = 15
        period_seconds        = 5
        timeout_seconds       = 3
        failure_threshold     = 10
      }

      # ── Liveness probe ─────────────────────────────────────────────────────

      liveness_probe {
        http_get {
          path = "/health"
          port = 8080
        }
        initial_delay_seconds = 30
        period_seconds        = 30
        timeout_seconds       = 5
        failure_threshold     = 3
      }

      resources {
        limits = {
          # API handles business logic and integrations; allocate more memory
          # than the auth service for connection pools and in-memory caching.
          cpu    = "2"
          memory = "1Gi"
        }
        cpu_idle = true
      }
    }

    labels = local.common_labels
  }
}

# ─── Public Invoker Binding ────────────────────────────────────────────────────
# Allow the load balancer to invoke the Cloud Run service without authentication.
# The API service validates JWT tokens from the auth service at the application layer.

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  project  = var.gcp_project_id
  location = var.region
  name     = google_cloud_run_v2_service.service.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ─── Serverless NEG ───────────────────────────────────────────────────────────
# Maps the HTTPS load balancer backend to this Cloud Run service.

resource "google_compute_region_network_endpoint_group" "neg" {
  project               = var.gcp_project_id
  name                  = "${local.name_prefix}-api-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region

  cloud_run {
    service = google_cloud_run_v2_service.service.name
  }
}
