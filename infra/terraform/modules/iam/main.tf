# IAM module — GCP service accounts, secret access bindings, and Artifact Registry permissions.
#
# Principle of least privilege is enforced at every level:
#   - Each application service account has access ONLY to the secrets it requires.
#   - No wildcard (*) permissions are granted anywhere.
#   - No service account keys are generated (Workload Identity Federation is used
#     for CI/CD; Cloud Run uses the service account identity natively).
#   - The cicd service account receives broader permissions (all secrets, registry
#     writer) to enable automated deployment pipelines.
#
# Secret access matrix:
#   api:    DATABASE_URL, ASANA_CLIENT_ID, ASANA_CLIENT_SECRET, ASANA_ACCESS_TOKEN,
#           GRAIN_API_KEY, GOOGLE_SERVICE_ACCOUNT_JSON, EMAIL_PROVIDER_API_KEY, LLM_API_KEY
#   auth:   AUTH_DATABASE_URL, IDP_CLIENT_ID, IDP_CLIENT_SECRET,
#           SIGNING_KEY_PRIVATE, SIGNING_KEY_PUBLIC
#   mastra: LLM_API_KEY
#   ui:     (none — UI is a Next.js SSR app; secrets are accessed server-side via the API)
#   cicd:   all secrets (for deployment automation and secret rotation scripts)
#
# Artifact Registry access:
#   app SAs: roles/artifactregistry.reader (pull images for Cloud Run)
#   cicd SA: roles/artifactregistry.writer (push images from CI/CD)

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_labels = {
    environment = var.environment
    project     = var.project_name
    managed-by  = "terraform"
    feature     = "02-terraform-base-infra"
  }

  # Secret access map: defines which logical secret names each app SA can access.
  # Keys must match logical names in var.secret_names (from secrets module).
  app_secret_access = {
    api = [
      "DATABASE_URL",
      "ASANA_CLIENT_ID",
      "ASANA_CLIENT_SECRET",
      "ASANA_ACCESS_TOKEN",
      "GRAIN_API_KEY",
      "GOOGLE_SERVICE_ACCOUNT_JSON",
      "EMAIL_PROVIDER_API_KEY",
      "LLM_API_KEY",
    ]
    auth = [
      "AUTH_DATABASE_URL",
      "IDP_CLIENT_ID",
      "IDP_CLIENT_SECRET",
      "SIGNING_KEY_PRIVATE",
      "SIGNING_KEY_PUBLIC",
    ]
    mastra = [
      "LLM_API_KEY",
    ]
    ui = [] # UI SA has no secret access; UI reads data via the API service
  }
}

# ─── Service Accounts ──────────────────────────────────────────────────────────
# Create named service accounts for each application plus cicd.
# Account IDs are capped at 28 characters by GCP; the pattern
# {env}-{app} fits within this limit for expected project_name lengths.
# The full SA email is: {account_id}@{project_id}.iam.gserviceaccount.com

resource "google_service_account" "app_service_accounts" {
  for_each = toset(var.app_names)

  project      = var.gcp_project_id
  account_id   = "${var.environment}-${each.key}"
  display_name = "${var.project_name} ${var.environment} ${each.key} service"
  description  = "Service account for the ${each.key} Cloud Run service in the ${var.environment} environment. Managed by Terraform."
}

resource "google_service_account" "cicd" {
  project      = var.gcp_project_id
  account_id   = "${var.environment}-cicd"
  display_name = "${var.project_name} ${var.environment} CI/CD"
  description  = "Service account for GitLab CI/CD pipelines. Has write access to Artifact Registry and all secrets. Managed by Terraform."
}

# ─── Secret Access Bindings — Application Service Accounts ─────────────────────
# Build a flat list of {sa, secret_name} pairs from the access matrix, then
# create one IAM binding per pair.
#
# Using secretmanager.secretAccessor grants the SA permission to read the
# latest secret version. This is the minimum required role for applications.
#
# for_each key: "{app_name}/{secret_name}" — uniquely identifies each binding.

locals {
  # Expand the access matrix into a flat map, filtering out SAs that have no
  # secrets (ui) and skipping secrets not present in var.secret_names (defensive).
  app_secret_bindings = {
    for pair in flatten([
      for app_name, secret_list in local.app_secret_access : [
        for secret_name in secret_list : {
          app_name    = app_name
          secret_name = secret_name
        }
        # Only create bindings for SAs that are in var.app_names
        if contains(var.app_names, app_name)
      ]
    ]) :
    "${pair.app_name}/${pair.secret_name}" => pair
    # Only bind secrets that exist in the secrets module output
    if contains(keys(var.secret_names), pair.secret_name)
  }
}

resource "google_secret_manager_secret_iam_member" "app_secret_access" {
  for_each = local.app_secret_bindings

  project   = var.gcp_project_id
  secret_id = var.secret_names[each.value.secret_name]
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.app_service_accounts[each.value.app_name].email}"
}

# ─── Secret Access Bindings — CI/CD Service Account ──────────────────────────
# cicd SA gets secretAccessor on all secrets for deployment automation.
# This enables: secret rotation scripts, initial secret population via gcloud,
# and any pipeline that needs to read or inject secrets.

resource "google_secret_manager_secret_iam_member" "cicd_secret_access" {
  for_each = var.secret_names

  project   = var.gcp_project_id
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cicd.email}"
}

# cicd SA also gets secretVersionManager to create/update secret versions
# (needed for automated secret rotation and initial population scripts).
resource "google_secret_manager_secret_iam_member" "cicd_secret_version_manager" {
  for_each = var.secret_names

  project   = var.gcp_project_id
  secret_id = each.value
  role      = "roles/secretmanager.secretVersionManager"
  member    = "serviceAccount:${google_service_account.cicd.email}"
}

# ─── Artifact Registry — Application Service Accounts (Reader) ─────────────────
# App SAs need reader access to pull images when Cloud Run starts container instances.
# Binding is at the project level (not per-repository) because Cloud Run pulls
# images from whichever repository contains its service's image.

resource "google_project_iam_member" "app_registry_reader" {
  for_each = toset(var.app_names)

  project = var.gcp_project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${google_service_account.app_service_accounts[each.key].email}"
}

# ─── Artifact Registry — CI/CD Service Account (Writer) ───────────────────────
# cicd SA needs writer access to push built images from CI/CD pipelines.
# Writer includes: push images, create tags, delete old images.

resource "google_project_iam_member" "cicd_registry_writer" {
  project = var.gcp_project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.cicd.email}"
}

# ─── Cloud Run — Application Service Accounts ─────────────────────────────────
# App SAs need run.invoker to be invocable by the load balancer and
# run.developer to allow Cloud Run service deployments.
# The cicd SA deploys Cloud Run services; app SAs are the runtime identity.

resource "google_project_iam_member" "app_run_invoker" {
  for_each = toset(var.app_names)

  project = var.gcp_project_id
  role    = "roles/run.invoker"
  member  = "serviceAccount:${google_service_account.app_service_accounts[each.key].email}"
}

resource "google_project_iam_member" "cicd_run_developer" {
  project = var.gcp_project_id
  role    = "roles/run.developer"
  member  = "serviceAccount:${google_service_account.cicd.email}"
}

# ─── Cloud SQL — Application Service Accounts ─────────────────────────────────
# App SAs that access Cloud SQL (api and auth) need cloudsql.client to
# establish connections. This is required even when using private IP because
# Cloud Run's VPC connector still authenticates via IAM.

resource "google_project_iam_member" "cloudsql_client" {
  for_each = toset([for app in var.app_names : app if contains(["api", "auth"], app)])

  project = var.gcp_project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.app_service_accounts[each.key].email}"
}

# ─── GCS State Bucket — CI/CD Service Account ─────────────────────────────────
# cicd SA needs objectAdmin on the Terraform state bucket to run terraform
# plan and apply from GitLab pipelines.

resource "google_storage_bucket_iam_member" "cicd_state_bucket_admin" {
  bucket = var.terraform_state_bucket
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.cicd.email}"
}
