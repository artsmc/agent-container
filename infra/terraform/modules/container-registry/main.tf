# Container registry module — GCP Artifact Registry (Docker format).
#
# Creates one repository per application in the app_names list. Using separate
# repositories per application provides:
#   - Fine-grained IAM: each Cloud Run service account gets read access only to
#     its own repository (enforced in the iam module).
#   - Independent cleanup policies: each repository manages its own image
#     lifecycle independently.
#   - Clear ownership: repository names map 1:1 to application names.
#
# Cleanup policy: the most_recent_versions condition retains the last N tagged
# images and deletes older ones. Untagged images (intermediate build layers)
# are deleted after 1 day to prevent unbounded storage growth.

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_labels = {
    environment = var.environment
    project     = var.project_name
    managed-by  = "terraform"
    feature     = "02-terraform-base-infra"
  }
}

# ─── Artifact Registry Repositories ───────────────────────────────────────────
# for_each iterates over app_names to create one repository per application.
# The repository ID follows the pattern: {project_name}-{environment}-{app_name}

resource "google_artifact_registry_repository" "app_repos" {
  for_each = toset(var.app_names)

  project       = var.gcp_project_id
  location      = var.region
  repository_id = "${local.name_prefix}-${each.key}"
  format        = "DOCKER"
  description   = "Docker image repository for the ${each.key} service in the ${var.environment} environment."

  labels = local.common_labels

  # Vulnerability scanning: automatically scan all pushed images for known CVEs.
  # Results are available in the GCP console and can trigger alerts.
  docker_config {
    immutable_tags = false # Allow overwriting tags (e.g. latest) for CI/CD workflows
  }

  # Cleanup policies to control image retention and storage costs.
  # Policy 1: Keep the most recent N tagged images per repository.
  # Policy 2: Delete untagged images older than 1 day (stale build artifacts).
  cleanup_policy_dry_run = false

  cleanup_policies {
    id     = "keep-recent-tagged"
    action = "KEEP"

    most_recent_versions {
      keep_count = var.image_retention_count
    }
  }

  cleanup_policies {
    id     = "delete-old-untagged"
    action = "DELETE"

    condition {
      tag_state    = "UNTAGGED"
      older_than   = "86400s" # 1 day in seconds
    }
  }
}
