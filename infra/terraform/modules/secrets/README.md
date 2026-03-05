# Module: secrets

GCP Secret Manager placeholder slots for all 13 application secrets. Creates secret containers with no values — operators populate secret versions after initial infrastructure provisioning.

## Overview

This module creates the Secret Manager resource definition (the "slot") for each required secret. No `google_secret_manager_secret_version` resources are created here — secrets are populated by operators following the process in `docs/secret-population.md`.

Secret naming: `{project_name}-{environment}-{LOGICAL_NAME}`

Example: `iexcel-dev-DATABASE_URL`, `iexcel-production-LLM_API_KEY`

The IAM module reads `module.secrets.secret_names` to create least-privilege bindings granting each service account access only to its required secrets.

## Managed Secrets

| Logical Name | Consumer Service | Description |
|---|---|---|
| `DATABASE_URL` | api | PostgreSQL connection URL for the product database |
| `AUTH_DATABASE_URL` | auth | PostgreSQL connection URL for the auth database |
| `IDP_CLIENT_ID` | auth | External Identity Provider client ID (for federated login) |
| `IDP_CLIENT_SECRET` | auth | External Identity Provider client secret |
| `SIGNING_KEY_PRIVATE` | auth | RS256 private key for JWT signing (PEM format) |
| `SIGNING_KEY_PUBLIC` | auth | RS256 public key for JWT verification (PEM format) |
| `ASANA_CLIENT_ID` | api | Asana OAuth app client ID |
| `ASANA_CLIENT_SECRET` | api | Asana OAuth app client secret |
| `ASANA_ACCESS_TOKEN` | api | Asana personal access token |
| `GRAIN_API_KEY` | api | Grain.co API key |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | api | Google Workspace service account JSON key |
| `LLM_API_KEY` | api, mastra | LLM provider API key (OpenAI, Anthropic, etc.) |
| `EMAIL_PROVIDER_API_KEY` | api | Transactional email provider API key |

## Usage

```hcl
module "secrets" {
  source = "./modules/secrets"

  environment         = "dev"
  project_name        = "iexcel"
  gcp_project_id      = "iexcel-dev"
  region              = "us-central1"
  deletion_protection = false
}
```

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `environment` | `string` | yes | — | One of: dev, staging, production |
| `project_name` | `string` | yes | — | Short project name prefix |
| `gcp_project_id` | `string` | yes | — | GCP project ID |
| `region` | `string` | yes | — | GCP region (for labeling) |
| `deletion_protection` | `bool` | yes | — | Prevent secret deletion via Terraform destroy |

## Outputs

| Name | Description |
|------|-------------|
| `secret_names` | Map of logical name to GCP secret ID (consumed by iam module) |
| `secret_resource_ids` | Map of logical name to GCP resource path |
| `database_url_secret` | GCP secret ID for DATABASE_URL |
| `auth_database_url_secret` | GCP secret ID for AUTH_DATABASE_URL |
| `signing_key_private_secret` | GCP secret ID for SIGNING_KEY_PRIVATE |
| `signing_key_public_secret` | GCP secret ID for SIGNING_KEY_PUBLIC |

## Notes on DATABASE_URL and AUTH_DATABASE_URL

The database and auth-database modules also create Secret Manager secrets with connection strings (auto-generated at apply time). Those secrets (`{env}-db-url` and `{env}-auth-db-url`) are separate from the slots created here.

The slots in this module are populated by operators after apply using the values from the database module outputs — see `docs/secret-population.md` for the exact commands.

Application services reference the secrets from **this module** (not the database module secrets) because the IAM bindings in the `iam` module are tied to `module.secrets.secret_names`.
