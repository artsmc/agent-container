# UI module — Cloud Run v2 service for the Next.js frontend application.
#
# Architecture:
#   internet → Global HTTPS LB (with Cloud CDN) → Serverless NEG → Cloud Run v2 (ui)
#
# This service handles:
#   - Next.js server-side rendering (SSR) and static asset serving
#   - Browser-to-API communication via the public API URL
#   - Authentication redirects to the auth service
#
# The UI has no server-side secrets — it accesses data exclusively through the
# public API. NEXT_PUBLIC_* variables are safe to embed in the build and runtime
# environment because they are public URLs, not credentials.
#
# Cloud CDN is enabled on the backend service (configured in the DNS module) to
# cache static assets served by Next.js, reducing latency and Cloud Run load.
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
}

# ─── Cloud Run v2 Service ──────────────────────────────────────────────────────

resource "google_cloud_run_v2_service" "service" {
  project  = var.gcp_project_id
  name     = "${local.name_prefix}-ui"
  location = var.region

  # Restrict ingress to load balancer traffic only.
  ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  labels = local.common_labels

  template {
    service_account = var.service_account

    # VPC connector is included for network consistency and to allow the UI
    # service to reach internal GCP APIs (e.g. Secret Manager, logging) via
    # Private Google Access rather than the public internet.
    vpc_access {
      connector = var.vpc_connector_id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      name  = "ui"
      image = var.image_url

      ports {
        name           = "http1"
        container_port = 3000
      }

      # ── Plain environment variables ────────────────────────────────────────
      # The UI has no server-side secrets. NEXT_PUBLIC_* vars are baked into
      # the Next.js build but also exposed at runtime for SSR.

      env {
        name  = "NEXT_PUBLIC_API_URL"
        value = "https://api.${var.domain}"
      }

      env {
        name  = "NEXT_PUBLIC_AUTH_URL"
        value = "https://auth.${var.domain}"
      }

      env {
        name  = "PORT"
        value = "3000"
      }

      # ── Startup probe ──────────────────────────────────────────────────────
      # Next.js SSR startup is fast but involves hydration setup.
      # initial_delay_seconds = 20 covers the Node.js and Next.js cold start.

      startup_probe {
        http_get {
          path = "/"
          port = 3000
        }
        initial_delay_seconds = 20
        period_seconds        = 5
        timeout_seconds       = 3
        failure_threshold     = 10
      }

      # ── Liveness probe ─────────────────────────────────────────────────────

      liveness_probe {
        http_get {
          path = "/"
          port = 3000
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
        cpu_idle = true
      }
    }

    labels = local.common_labels
  }
}

# ─── Public Invoker Binding ────────────────────────────────────────────────────
# Allow the load balancer to invoke the Cloud Run service without authentication.

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  project  = var.gcp_project_id
  location = var.region
  name     = google_cloud_run_v2_service.service.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ─── Serverless NEG ───────────────────────────────────────────────────────────
# Maps the HTTPS load balancer backend (with Cloud CDN) to this Cloud Run service.
# Cloud CDN caches static assets at Google's edge, reducing Cold Start frequency
# for cached responses.

resource "google_compute_region_network_endpoint_group" "neg" {
  project               = var.gcp_project_id
  name                  = "${local.name_prefix}-ui-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region

  cloud_run {
    service = google_cloud_run_v2_service.service.name
  }
}
