# Secrets module — GCP Secret Manager placeholder slots.
#
# This module creates the secret resource definitions (containers) for all
# application secrets. It does NOT populate secret values — those are injected
# by operators after initial infrastructure provisioning following the process
# documented in docs/secret-population.md.
#
# Secret naming convention: {project_name}-{environment}-{LOGICAL_NAME}
# Example: iexcel-dev-DATABASE_URL, iexcel-production-LLM_API_KEY
#
# The 13 managed secrets cover:
#   Database:    DATABASE_URL, AUTH_DATABASE_URL
#   Auth/OIDC:   IDP_CLIENT_ID, IDP_CLIENT_SECRET, SIGNING_KEY_PRIVATE, SIGNING_KEY_PUBLIC
#   Integrations: ASANA_CLIENT_ID, ASANA_CLIENT_SECRET, ASANA_ACCESS_TOKEN,
#                 GRAIN_API_KEY, GOOGLE_SERVICE_ACCOUNT_JSON
#   AI/Email:    LLM_API_KEY, EMAIL_PROVIDER_API_KEY
#
# The DATABASE_URL and AUTH_DATABASE_URL secrets here are separate from the
# auto-generated secrets created by the database and auth-database modules.
# These slots are populated by operators using the database module outputs
# (see docs/secret-population.md). Cloud Run services reference these secrets
# (via IAM bindings in the iam module) rather than the database module secrets,
# which provides a clean separation of concerns:
#   - database module secret: auto-managed, used for bootstrapping and ops
#   - secrets module DATABASE_URL: operator-managed, used by application services

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_labels = {
    environment = var.environment
    project     = var.project_name
    managed-by  = "terraform"
    feature     = "02-terraform-base-infra"
  }

  # Canonical list of all logical secret names. Adding a secret here
  # automatically provisions the slot and exposes it in outputs.
  secret_logical_names = [
    "DATABASE_URL",
    "AUTH_DATABASE_URL",
    "IDP_CLIENT_ID",
    "IDP_CLIENT_SECRET",
    "SIGNING_KEY_PRIVATE",
    "SIGNING_KEY_PUBLIC",
    "ASANA_CLIENT_ID",
    "ASANA_CLIENT_SECRET",
    "ASANA_ACCESS_TOKEN",
    "GRAIN_API_KEY",
    "GOOGLE_SERVICE_ACCOUNT_JSON",
    "LLM_API_KEY",
    "EMAIL_PROVIDER_API_KEY",
  ]
}

# ─── Secret Slots ──────────────────────────────────────────────────────────────
# Create one secret resource per logical name using for_each.
# No secret versions are created here — the secret container exists but has
# no value until populated by the operator (see docs/secret-population.md).

resource "google_secret_manager_secret" "app_secrets" {
  for_each = toset(local.secret_logical_names)

  project   = var.gcp_project_id
  secret_id = "${local.name_prefix}-${each.key}"

  labels = merge(local.common_labels, {
    secret-type = lower(replace(each.key, "_", "-"))
  })

  # Auto replication distributes the secret across multiple GCP regions for
  # high availability. For compliance-sensitive deployments, switch to
  # user_managed replication with explicit region list.
  replication {
    auto {}
  }
}
