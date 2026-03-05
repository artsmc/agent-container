# Module: database

Cloud SQL for PostgreSQL — product database with private IP, automated backups, PITR, and connection string management via GCP Secret Manager.

## Overview

This module provisions:
- A Cloud SQL PostgreSQL instance (private IP only, no public endpoint)
- A dedicated application database and user
- A cryptographically random master password via `random_password`
- A Secret Manager secret containing the complete `DATABASE_URL` connection string

The module depends on Private Services Access (PSA) being established in the networking module before any Cloud SQL private IP allocation can succeed. The root `main.tf` enforces this with `depends_on = [module.networking]`.

## Usage

```hcl
module "database" {
  source = "./modules/database"

  environment           = "dev"
  project_name          = "iexcel"
  gcp_project_id        = "iexcel-dev"
  region                = "us-central1"
  instance_tier         = "db-f1-micro"
  postgres_version      = "POSTGRES_15"
  vpc_self_link         = module.networking.vpc_id
  private_network_name  = module.networking.network_name
  backup_retention_days = 3
  deletion_protection   = false
  db_name               = "iexcel"
}
```

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `environment` | `string` | yes | — | One of: dev, staging, production |
| `project_name` | `string` | yes | — | Short project name prefix (e.g. iexcel) |
| `gcp_project_id` | `string` | yes | — | GCP project ID |
| `region` | `string` | yes | — | GCP region for the Cloud SQL instance |
| `instance_tier` | `string` | yes | — | Cloud SQL machine tier (e.g. db-f1-micro) |
| `postgres_version` | `string` | no | `"POSTGRES_15"` | PostgreSQL version string |
| `vpc_self_link` | `string` | yes | — | VPC self_link for PSA private IP |
| `private_network_name` | `string` | yes | — | VPC network name |
| `backup_retention_days` | `number` | yes | — | Days to retain backups (1–365) |
| `deletion_protection` | `bool` | yes | — | Prevent Terraform from destroying the instance |
| `db_name` | `string` | no | `"iexcel"` | Name of the default database |

## Outputs

| Name | Description |
|------|-------------|
| `instance_id` | Cloud SQL instance name |
| `connection_string_secret_name` | Secret Manager secret ID holding DATABASE_URL |
| `private_ip` | Private IP address of the instance (VPC-internal only) |
| `port` | PostgreSQL port (always 5432) |
| `database_name` | Name of the created database |
| `app_user_name` | Name of the application database user |

## Security Notes

- The instance has no public IP (`ipv4_enabled = false`).
- All connections require TLS (`ssl_mode = ENCRYPTED_ONLY`).
- The generated password is stored only in Secret Manager and in Terraform state. State must be stored in an encrypted, access-controlled GCS bucket.
- The `lifecycle.ignore_changes = [secret_data]` on the secret version prevents Terraform from re-writing the secret on subsequent plans, but the initial version is written at apply time.
- For production, consider enabling `REGIONAL` availability by passing a custom `availability_type` variable (requires a compatible instance tier).
