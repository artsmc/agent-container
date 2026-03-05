# Module: iam

GCP IAM service accounts, least-privilege secret access bindings, Artifact Registry permissions, and Cloud Run/Cloud SQL role assignments.

## Overview

Creates one service account per application (`auth`, `api`, `mastra`, `ui`) plus a `cicd` service account, then applies the principle of least privilege:

- Each app service account gets `secretmanager.secretAccessor` only on the secrets it requires
- App service accounts get `artifactregistry.reader` at project level (needed for Cloud Run image pull)
- The cicd service account gets `artifactregistry.writer` and `secretmanager.secretAccessor` + `secretVersionManager` on all secrets
- No service account keys are generated — Cloud Run uses the SA identity natively; CI/CD uses Workload Identity Federation

## Secret Access Matrix

| Service Account | Secrets |
|---|---|
| `api` | DATABASE_URL, ASANA_CLIENT_ID, ASANA_CLIENT_SECRET, ASANA_ACCESS_TOKEN, GRAIN_API_KEY, GOOGLE_SERVICE_ACCOUNT_JSON, EMAIL_PROVIDER_API_KEY, LLM_API_KEY |
| `auth` | AUTH_DATABASE_URL, IDP_CLIENT_ID, IDP_CLIENT_SECRET, SIGNING_KEY_PRIVATE, SIGNING_KEY_PUBLIC |
| `mastra` | LLM_API_KEY |
| `ui` | (none) |
| `cicd` | All 13 secrets (secretAccessor + secretVersionManager) |

## Usage

```hcl
module "iam" {
  source = "./modules/iam"

  environment            = "dev"
  project_name           = "iexcel"
  gcp_project_id         = "iexcel-dev"
  region                 = "us-central1"
  app_names              = ["auth", "api", "mastra", "ui"]
  secret_names           = module.secrets.secret_names
  terraform_state_bucket = "iexcel-terraform-state"
}
```

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `environment` | `string` | yes | — | One of: dev, staging, production |
| `project_name` | `string` | yes | — | Short project name prefix |
| `gcp_project_id` | `string` | yes | — | GCP project ID |
| `region` | `string` | yes | — | GCP region |
| `app_names` | `list(string)` | yes | — | Application names to create SAs for |
| `secret_names` | `map(string)` | yes | — | Map from secrets module (logical name → GCP secret ID) |
| `terraform_state_bucket` | `string` | yes | — | GCS bucket name for Terraform state |

## Outputs

| Name | Description |
|------|-------------|
| `api_service_account` | Email of the API service account |
| `auth_service_account` | Email of the auth service account |
| `mastra_service_account` | Email of the mastra service account |
| `ui_service_account` | Email of the UI service account |
| `cicd_service_account` | Email of the CI/CD service account |
| `all_app_service_accounts` | Map of app name to service account email |

## Service Account Naming

Account IDs follow the pattern `{environment}-{app_name}` (e.g. `dev-api`, `production-auth`). GCP limits account IDs to 28 characters. The full email is:

```
{environment}-{app_name}@{gcp_project_id}.iam.gserviceaccount.com
```

## CI/CD Workload Identity Federation

The `cicd` service account should be configured for Workload Identity Federation in GitLab rather than using a downloaded key file. See the bootstrap documentation for setup instructions.

## Cloud SQL Access

The `api` and `auth` service accounts receive `roles/cloudsql.client` at the project level. This role is required for Cloud Run services to authenticate with Cloud SQL even when using private IP connectivity (the Cloud SQL API validates the SA identity on connection establishment).
