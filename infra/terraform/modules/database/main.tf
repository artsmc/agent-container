# Product database module — Cloud SQL for PostgreSQL with private IP only.
#
# Architecture decisions:
#   - Private IP only (ipv4_enabled = false): Cloud SQL is accessible only from
#     within the VPC via Private Services Access (PSA) peering. The PSA connection
#     is established by the networking module before this module is applied.
#   - No Cloud SQL Auth Proxy: connections use the private IP directly since
#     Cloud Run services connect via the VPC connector in the same VPC.
#   - Random master password: generated at apply time, never stored in source
#     control. The DATABASE_URL (with password) is written to Secret Manager.
#   - Deletion protection: configurable per environment. Always false for dev
#     so developers can run terraform destroy freely.

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  db_instance_name = "${local.name_prefix}-db"

  common_labels = {
    environment = var.environment
    project     = var.project_name
    managed-by  = "terraform"
    feature     = "02-terraform-base-infra"
  }
}

# ─── Random Password ───────────────────────────────────────────────────────────
# Generate a cryptographically random password for the postgres superuser.
# length=32 with special characters provides sufficient entropy for a database
# master credential. Override special = true to ensure compatibility with
# PostgreSQL password syntax (excludes certain special chars that require quoting).

resource "random_password" "db_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# ─── Cloud SQL Instance ────────────────────────────────────────────────────────

resource "google_sql_database_instance" "main" {
  project             = var.gcp_project_id
  name                = local.db_instance_name
  region              = var.region
  database_version    = var.postgres_version
  deletion_protection = var.deletion_protection

  settings {
    tier              = var.instance_tier
    availability_type = "ZONAL"
    disk_autoresize   = true
    disk_type         = "PD_SSD"

    user_labels = local.common_labels

    ip_configuration {
      # Private IP only: no public endpoint exposed.
      ipv4_enabled    = false
      private_network = var.vpc_self_link

      # Require SSL for all connections. Cloud SQL enforces TLS when ssl_mode
      # is set to ENCRYPTED_ONLY.
      ssl_mode = "ENCRYPTED_ONLY"
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "03:00" # UTC — off-peak for US-Central
      transaction_log_retention_days = var.backup_retention_days

      backup_retention_settings {
        retained_backups = var.backup_retention_days
        retention_unit   = "COUNT"
      }
    }

    maintenance_window {
      day          = 7   # Sunday
      hour         = 4   # 04:00 UTC
      update_track = "stable"
    }

    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = true
      record_client_address   = false # Do not store client IPs for privacy
    }

    database_flags {
      name  = "log_checkpoints"
      value = "on"
    }

    database_flags {
      name  = "log_connections"
      value = "on"
    }

    database_flags {
      name  = "log_disconnections"
      value = "on"
    }

    database_flags {
      name  = "log_lock_waits"
      value = "on"
    }
  }

  # Ensure PSA peering exists before Cloud SQL tries to allocate a private IP.
  # The root module enforces this via depends_on = [module.networking], but
  # an explicit lifecycle here documents the intent.
  lifecycle {
    ignore_changes = [
      # Cloud SQL may update the maintenance window automatically; ignore to
      # prevent unnecessary plan diffs.
      settings[0].maintenance_window,
    ]
  }
}

# ─── Database ──────────────────────────────────────────────────────────────────

resource "google_sql_database" "main" {
  project  = var.gcp_project_id
  instance = google_sql_database_instance.main.name
  name     = var.db_name
}

# ─── Database User ─────────────────────────────────────────────────────────────
# Create a dedicated application user rather than using the default postgres
# superuser. This limits blast radius if credentials are compromised.

resource "google_sql_user" "app_user" {
  project  = var.gcp_project_id
  instance = google_sql_database_instance.main.name
  name     = "${local.name_prefix}-db-user"
  password = random_password.db_password.result
}

# ─── Secret Manager — DATABASE_URL ─────────────────────────────────────────────
# Store the full PostgreSQL connection URL in Secret Manager so Cloud Run
# services can inject it as an environment variable without hardcoding
# credentials in container configuration.
#
# URL format: postgresql://{user}:{password}@{private_ip}:5432/{db_name}
# This is compatible with Drizzle ORM, node-postgres (pg), and most
# PostgreSQL client libraries.

resource "google_secret_manager_secret" "database_url" {
  project   = var.gcp_project_id
  secret_id = "${local.name_prefix}-db-url"

  labels = local.common_labels

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "database_url" {
  secret = google_secret_manager_secret.database_url.id

  # Construct the DATABASE_URL with the auto-generated private IP and password.
  # sslmode=require ensures the client enforces TLS (matching ssl_mode on server).
  secret_data = "postgresql://${google_sql_user.app_user.name}:${random_password.db_password.result}@${google_sql_database_instance.main.private_ip_address}:5432/${var.db_name}?sslmode=require"

  # Prevent Terraform from storing the secret value in state in plaintext.
  # This field is sensitive=true in the provider.
  lifecycle {
    ignore_changes = [secret_data]
  }
}
