# Auth database module — Cloud SQL for PostgreSQL, dedicated to the OIDC/auth service.
#
# This is a separate Cloud SQL instance from the product database to enforce:
#   - Security isolation: auth credentials cannot be accessed by compromised
#     product database credentials, and vice versa.
#   - Independent scaling: auth workload (short-lived sessions, OIDC token issuance)
#     has different I/O patterns than product workload.
#   - Independent backup/restore: auth data (sessions, user records) can be
#     restored independently from product data.
#
# All resources use an "auth" suffix in their names to differentiate from the
# product database module resources within the same GCP project.

locals {
  name_prefix           = "${var.project_name}-${var.environment}"
  auth_db_instance_name = "${local.name_prefix}-auth-db"

  common_labels = {
    environment = var.environment
    project     = var.project_name
    managed-by  = "terraform"
    feature     = "02-terraform-base-infra"
  }
}

# ─── Random Password ───────────────────────────────────────────────────────────

resource "random_password" "auth_db_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# ─── Cloud SQL Instance ────────────────────────────────────────────────────────

resource "google_sql_database_instance" "auth" {
  project             = var.gcp_project_id
  name                = local.auth_db_instance_name
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
      # Private IP only — no public endpoint. Matches product database policy.
      ipv4_enabled    = false
      private_network = var.vpc_self_link
      ssl_mode        = "ENCRYPTED_ONLY"
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "02:00" # UTC — offset from product DB backup at 03:00
      transaction_log_retention_days = var.backup_retention_days

      backup_retention_settings {
        retained_backups = var.backup_retention_days
        retention_unit   = "COUNT"
      }
    }

    maintenance_window {
      day          = 7   # Sunday
      hour         = 5   # 05:00 UTC — offset from product DB maintenance at 04:00
      update_track = "stable"
    }

    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = true
      record_client_address   = false
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

  lifecycle {
    ignore_changes = [
      settings[0].maintenance_window,
    ]
  }
}

# ─── Database ──────────────────────────────────────────────────────────────────

resource "google_sql_database" "auth" {
  project  = var.gcp_project_id
  instance = google_sql_database_instance.auth.name
  name     = var.db_name
}

# ─── Database User ─────────────────────────────────────────────────────────────

resource "google_sql_user" "auth_app_user" {
  project  = var.gcp_project_id
  instance = google_sql_database_instance.auth.name
  name     = "${local.name_prefix}-auth-db-user"
  password = random_password.auth_db_password.result
}

# ─── Secret Manager — AUTH_DATABASE_URL ────────────────────────────────────────
# Store the auth service connection URL in a separate Secret Manager secret.
# The auth service is the only consumer of this secret (enforced by IAM bindings
# in the iam module).

resource "google_secret_manager_secret" "auth_database_url" {
  project   = var.gcp_project_id
  secret_id = "${local.name_prefix}-auth-db-url"

  labels = local.common_labels

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "auth_database_url" {
  secret = google_secret_manager_secret.auth_database_url.id

  secret_data = "postgresql://${google_sql_user.auth_app_user.name}:${random_password.auth_db_password.result}@${google_sql_database_instance.auth.private_ip_address}:5432/${var.db_name}?sslmode=require"

  lifecycle {
    ignore_changes = [secret_data]
  }
}
