# Root composition — wires all base infrastructure modules together.
# Modules are instantiated in dependency order:
#   1. networking        — no dependencies
#   2. database          — depends on networking
#   3. auth-database     — depends on networking
#   4. container-registry — no infrastructure dependencies
#   5. secrets           — no infrastructure dependencies
#   6. iam               — depends on container-registry and secrets
#   7. dns               — depends on networking
#   8. auth              — depends on iam, secrets, networking (feature 36)
#   9. api               — depends on iam, secrets, networking (feature 36)
#  10. mastra            — depends on api, iam, secrets, networking (feature 36)
#  11. ui                — depends on iam, networking (feature 36)

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
# Backend services are created as stubs in the initial apply.
# Feature 36 app modules (auth, api, ui) produce Serverless NEG self-links that
# are passed back here via neg_ids, attaching them to the backend services.
# This keeps backend service ownership in one place (the dns module).

module "dns" {
  source = "./modules/dns"

  environment    = var.environment
  project_name   = var.project_name
  gcp_project_id = var.gcp_project_id
  domain         = var.domain
  region         = var.region
  vpc_id         = module.networking.vpc_id

  # NEG IDs from feature 36 app modules. Each value is null until the
  # corresponding app module has been applied. On the first apply (base infra
  # only), all NEGs are null and backend services remain as stubs.
  neg_ids = {
    auth = module.auth.neg_self_link
    api  = module.api.neg_self_link
    ui   = module.ui.neg_self_link
  }

  # Enable CDN on the UI backend once the UI is deployed.
  enable_ui_cdn = true

  depends_on = [module.networking]
}

# ─── 8. Auth Service ───────────────────────────────────────────────────────────

module "auth" {
  source = "./modules/auth"

  environment      = var.environment
  project_name     = var.project_name
  gcp_project_id   = var.gcp_project_id
  region           = var.region
  image_url        = var.auth_image_url
  service_account  = module.iam.auth_service_account
  vpc_connector_id = module.networking.vpc_connector_id
  secret_names     = module.secrets.secret_names
  domain           = var.domain
  min_instances    = var.auth_min_instances
  max_instances    = var.auth_max_instances

  depends_on = [module.iam, module.secrets, module.networking]
}

# ─── 9. API Service ────────────────────────────────────────────────────────────

module "api" {
  source = "./modules/api"

  environment      = var.environment
  project_name     = var.project_name
  gcp_project_id   = var.gcp_project_id
  region           = var.region
  image_url        = var.api_image_url
  service_account  = module.iam.api_service_account
  vpc_connector_id = module.networking.vpc_connector_id
  secret_names     = module.secrets.secret_names
  domain           = var.domain
  mastra_url       = var.mastra_url
  min_instances    = var.api_min_instances
  max_instances    = var.api_max_instances

  depends_on = [module.iam, module.secrets, module.networking]
}

# ─── 10. Mastra AI Agent Service ───────────────────────────────────────────────
# Mastra depends on the api module because:
#   - api_base_url is populated from module.api.service_url
#   - api_service_account_email is used to create the invoker IAM binding

module "mastra" {
  source = "./modules/mastra"

  environment               = var.environment
  project_name              = var.project_name
  gcp_project_id            = var.gcp_project_id
  region                    = var.region
  image_url                 = var.mastra_image_url
  service_account           = module.iam.mastra_service_account
  vpc_connector_id          = module.networking.vpc_connector_id
  secret_names              = module.secrets.secret_names
  domain                    = var.domain
  api_base_url              = module.api.service_url
  api_service_account_email = module.iam.api_service_account
  llm_provider              = var.llm_provider
  llm_model                 = var.llm_model
  min_instances             = var.mastra_min_instances
  max_instances             = var.mastra_max_instances

  depends_on = [module.api, module.iam, module.secrets, module.networking]
}

# ─── 11. UI Service ────────────────────────────────────────────────────────────

module "ui" {
  source = "./modules/ui"

  environment      = var.environment
  project_name     = var.project_name
  gcp_project_id   = var.gcp_project_id
  region           = var.region
  image_url        = var.ui_image_url
  service_account  = module.iam.ui_service_account
  vpc_connector_id = module.networking.vpc_connector_id
  domain           = var.domain
  min_instances    = var.ui_min_instances
  max_instances    = var.ui_max_instances

  depends_on = [module.iam, module.networking]
}
