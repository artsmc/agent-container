# Root composition — wires all base infrastructure modules together.
# Modules are instantiated in dependency order:
#   1. networking     — no dependencies
#   2. database       — depends on networking
#   3. auth-database  — depends on networking
#   4. container-registry — no infrastructure dependencies
#   5. secrets        — no infrastructure dependencies
#   6. iam            — depends on container-registry and secrets
#   7. dns            — depends on networking

provider "google" {
  project = var.gcp_project_id
  region  = var.region
}

# ─── 1. Networking ─────────────────────────────────────────────────────────────

module "networking" {
  source = "./modules/networking"

  environment         = var.environment
  project_name        = var.project_name
  gcp_project_id      = var.gcp_project_id
  region              = var.region
  private_subnet_cidr = var.private_subnet_cidr
  public_subnet_cidr  = var.public_subnet_cidr
  vpc_connector_cidr  = var.vpc_connector_cidr
}

# ─── 2. Product Database ────────────────────────────────────────────────────────

module "database" {
  source = "./modules/database"

  environment           = var.environment
  project_name          = var.project_name
  gcp_project_id        = var.gcp_project_id
  region                = var.region
  instance_tier         = var.db_instance_tier
  postgres_version      = var.postgres_version
  vpc_self_link         = module.networking.vpc_id
  private_network_name  = module.networking.network_name
  backup_retention_days = var.backup_retention_days
  deletion_protection   = var.deletion_protection
  db_name               = var.db_name

  depends_on = [module.networking]
}

# ─── 3. Auth Database ──────────────────────────────────────────────────────────

module "auth_database" {
  source = "./modules/auth-database"

  environment           = var.environment
  project_name          = var.project_name
  gcp_project_id        = var.gcp_project_id
  region                = var.region
  instance_tier         = var.auth_db_instance_tier
  postgres_version      = var.postgres_version
  vpc_self_link         = module.networking.vpc_id
  private_network_name  = module.networking.network_name
  backup_retention_days = var.backup_retention_days
  deletion_protection   = var.deletion_protection
  db_name               = var.auth_db_name

  depends_on = [module.networking]
}

# ─── 4. Container Registry ─────────────────────────────────────────────────────

module "container_registry" {
  source = "./modules/container-registry"

  environment           = var.environment
  project_name          = var.project_name
  gcp_project_id        = var.gcp_project_id
  region                = var.region
  image_retention_count = var.image_retention_count
  app_names             = ["auth", "api", "mastra", "ui"]
}

# ─── 5. Secrets ────────────────────────────────────────────────────────────────

module "secrets" {
  source = "./modules/secrets"

  environment         = var.environment
  project_name        = var.project_name
  gcp_project_id      = var.gcp_project_id
  region              = var.region
  deletion_protection = var.deletion_protection
}

# ─── 6. IAM ────────────────────────────────────────────────────────────────────

module "iam" {
  source = "./modules/iam"

  environment           = var.environment
  project_name          = var.project_name
  gcp_project_id        = var.gcp_project_id
  region                = var.region
  app_names             = ["auth", "api", "mastra", "ui"]
  secret_names          = module.secrets.secret_names
  terraform_state_bucket = var.terraform_state_bucket

  depends_on = [module.container_registry, module.secrets]
}

# ─── 7. DNS and Load Balancer ──────────────────────────────────────────────────

module "dns" {
  source = "./modules/dns"

  environment    = var.environment
  project_name   = var.project_name
  gcp_project_id = var.gcp_project_id
  domain         = var.domain
  region         = var.region
  vpc_id         = module.networking.vpc_id

  depends_on = [module.networking]
}
