# Module: auth-database

Cloud SQL for PostgreSQL — dedicated auth/OIDC service database with private IP, automated backups, PITR, and connection string management via GCP Secret Manager.

## Overview

A separate Cloud SQL instance for the OIDC/auth service. Isolation from the product database provides:

- **Security boundary**: compromised product DB credentials cannot be used to access auth data
- **Independent scaling**: session and token workloads differ from product data workloads
- **Independent backup/restore**: auth data can be restored without touching product data

All resource names include an `auth` infix to differentiate them from the product database module resources within the same GCP project.

## Usage

```hcl
module "auth_database" {
  source = "./modules/auth-database"

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
  db_name               = "iexcel_auth"
}
```

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `environment` | `string` | yes | — | One of: dev, staging, production |
| `project_name` | `string` | yes | — | Short project name prefix (e.g. iexcel) |
| `gcp_project_id` | `string` | yes | — | GCP project ID |
| `region` | `string` | yes | — | GCP region for the Cloud SQL instance |
| `instance_tier` | `string` | yes | — | Cloud SQL machine tier |
| `postgres_version` | `string` | no | `"POSTGRES_15"` | PostgreSQL version string |
| `vpc_self_link` | `string` | yes | — | VPC self_link for PSA private IP |
| `private_network_name` | `string` | yes | — | VPC network name |
| `backup_retention_days` | `number` | yes | — | Days to retain backups (1–365) |
| `deletion_protection` | `bool` | yes | — | Prevent Terraform from destroying the instance |
| `db_name` | `string` | no | `"iexcel_auth"` | Name of the default database |

## Outputs

| Name | Description |
|------|-------------|
| `instance_id` | Auth Cloud SQL instance name |
| `connection_string_secret_name` | Secret Manager secret ID holding AUTH_DATABASE_URL |
| `private_ip` | Private IP address of the auth instance |
| `port` | PostgreSQL port (always 5432) |
| `database_name` | Name of the created auth database |
| `app_user_name` | Name of the auth application database user |

## Security Notes

- Backup window is offset from the product database (02:00 UTC vs 03:00 UTC) to avoid I/O contention on shared Cloud SQL infrastructure.
- The secret version `lifecycle.ignore_changes` prevents re-writing the connection string on subsequent applies, preserving any manual rotation applied outside Terraform.
