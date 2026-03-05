# Mastra module — Cloud Run v2 service for the AI agent orchestration layer.
#
# Architecture:
#   api → mastra (internal Cloud Run URL, INGRESS_TRAFFIC_INTERNAL_ONLY)
#   mastra → LLM provider APIs (external, via Cloud NAT)
#   mastra → api (callbacks and data fetching via api_base_url)
#
# This service handles:
#   - Mastra AI agent framework runtime
#   - LLM API calls (Anthropic / OpenAI)
#   - Agent workflows triggered by the API service
#
# Mastra is NOT publicly exposed. It has no Serverless NEG and no DNS routing.
# Only the API service (via its service account) can invoke mastra. All traffic
# from the internet is blocked by INGRESS_TRAFFIC_INTERNAL_ONLY.
#
# Secrets injected at runtime via Secret Manager:
#   LLM_API_KEY, MASTRA_CLIENT_SECRET
#
# LLM initialization can take 20-30 seconds on cold start; the startup probe
# has a longer initial delay (30s) to accommodate this.

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_labels = {
    environment = var.environment
    project     = var.project_name
    managed-by  = "terraform"
    feature     = "36-terraform-app-deployment"
  }

  # Secrets required by the mastra service.
  mastra_secrets = {
    LLM_API_KEY           = "LLM_API_KEY"
    MASTRA_CLIENT_SECRET  = "MASTRA_CLIENT_SECRET"
  }
}

# ─── Cloud Run v2 Service ──────────────────────────────────────────────────────

resource "google_cloud_run_v2_service" "service" {
  project  = var.gcp_project_id
  name     = "${local.name_prefix}-mastra"
  location = var.region

  # Restrict to internal traffic only — mastra is never exposed to the internet.
  # Only other Cloud Run services and VPC-connected resources can reach it.
  ingress = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  labels = local.common_labels

  template {
    service_account = var.service_account

    # Route egress via the VPC connector for outbound calls to:
    # - LLM provider APIs (via Cloud NAT)
    # - Internal API service callbacks
    vpc_access {
      connector = var.vpc_connector_id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      name  = "mastra"
      image = var.image_url

      ports {
        name           = "http1"
        container_port = 8081
      }

      # ── Secret environment variables ───────────────────────────────────────

      dynamic "env" {
        for_each = local.mastra_secrets
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
        name  = "API_BASE_URL"
        value = var.api_base_url
      }

      env {
        name  = "AUTH_ISSUER_URL"
        value = "https://auth.${var.domain}"
      }

      env {
        name  = "MASTRA_CLIENT_ID"
        value = var.mastra_client_id
      }

      env {
        name  = "LLM_PROVIDER"
        value = var.llm_provider
      }

      env {
        name  = "LLM_MODEL"
        value = var.llm_model
      }

      env {
        name  = "MASTRA_PORT"
        value = "8081"
      }

      env {
        name  = "MASTRA_HOST"
        value = "0.0.0.0"
      }

      # ── Startup probe ──────────────────────────────────────────────────────
      # LLM client initialization and model loading can take 20-30 seconds.
      # initial_delay_seconds = 30 gives the process time to load before probing.

      startup_probe {
        http_get {
          path = "/health"
          port = 8081
        }
        initial_delay_seconds = 30
        period_seconds        = 5
        timeout_seconds       = 5
        failure_threshold     = 12
      }

      # ── Liveness probe ─────────────────────────────────────────────────────

      liveness_probe {
        http_get {
          path = "/health"
          port = 8081
        }
        initial_delay_seconds = 60
        period_seconds        = 30
        timeout_seconds       = 10
        failure_threshold     = 3
      }

      resources {
        limits = {
          # Mastra runs LLM inference context and agent state in memory.
          # Allocate more memory than the API service for large context windows.
          cpu    = "2"
          memory = "2Gi"
        }
        # cpu_idle = false ensures CPU is always available for LLM response processing.
        # LLM streaming responses require sustained CPU even between requests.
        cpu_idle = false
      }
    }

    labels = local.common_labels
  }
}

# ─── API Service Account Invoker Binding ──────────────────────────────────────
# Grant the API service account permission to invoke mastra.
# Since mastra uses INGRESS_TRAFFIC_INTERNAL_ONLY, IAM auth is still enforced.
# The API service authenticates with its own service account identity when calling
# mastra, so this binding is required for the API → mastra call path.

resource "google_cloud_run_v2_service_iam_member" "api_invoker" {
  project  = var.gcp_project_id
  location = var.region
  name     = google_cloud_run_v2_service.service.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.api_service_account_email}"
}
