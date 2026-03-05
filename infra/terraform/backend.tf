# Remote state backend using GCS (Google Cloud Storage).
#
# IMPORTANT: Terraform backend blocks do not support variable interpolation.
# The bucket name is hardcoded here. The prefix is supplied at init time via
# -backend-config flag so that each environment writes to a separate state path.
#
# CI/CD init command pattern (see docs/bootstrap.md):
#   terraform init -backend-config="prefix=terraform/state/${ENV}"
#
# Local init example for dev:
#   terraform init -backend-config="prefix=terraform/state/dev"
#
# Credentials are supplied via the GOOGLE_APPLICATION_CREDENTIALS environment
# variable or Workload Identity Federation (GitHub Actions OIDC). Never embed
# credentials in this file.

terraform {
  backend "gcs" {
    bucket = "iexcel-terraform-state"
    # prefix is provided via -backend-config at init time:
    #   terraform init -backend-config="prefix=terraform/state/dev"
    #   terraform init -backend-config="prefix=terraform/state/staging"
    #   terraform init -backend-config="prefix=terraform/state/production"
  }
}
