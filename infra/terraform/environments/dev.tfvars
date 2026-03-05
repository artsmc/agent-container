# Dev environment — minimal resource sizes for fast iteration and cost control.
# deletion_protection is FALSE so developers can run terraform destroy freely.

environment    = "dev"
project_name   = "iexcel"
gcp_project_id = "iexcel-dev"       # Replace with actual GCP project ID
region         = "us-central1"
cloud_provider = "gcp"

# DNS
domain = "dev.iexcel.app"

# Networking
vpc_cidr            = "10.0.0.0/16"
private_subnet_cidr = "10.0.1.0/24"
public_subnet_cidr  = "10.0.2.0/24"
vpc_connector_cidr  = "10.8.0.0/28"

# Database — smallest available Cloud SQL tier for dev
db_instance_tier      = "db-f1-micro"
auth_db_instance_tier = "db-f1-micro"
postgres_version      = "POSTGRES_15"
backup_retention_days = 3
deletion_protection   = false
db_name               = "iexcel"
auth_db_name          = "iexcel_auth"

# Container Registry
image_retention_count = 5

# State backend
terraform_state_bucket = "iexcel-terraform-state"

# ─── App Deployment (Feature 36) ──────────────────────────────────────────────
# Image URLs are set by the CI/CD pipeline on each deployment.
# Replace placeholders with real Artifact Registry image URLs after first build.
# Pattern: {region}-docker.pkg.dev/{gcp_project_id}/{project_name}-{env}-{app}/{app}:{tag}

auth_image_url   = "us-central1-docker.pkg.dev/iexcel-dev/iexcel-dev-auth/auth:latest"
api_image_url    = "us-central1-docker.pkg.dev/iexcel-dev/iexcel-dev-api/api:latest"
mastra_image_url = "us-central1-docker.pkg.dev/iexcel-dev/iexcel-dev-mastra/mastra:latest"
ui_image_url     = "us-central1-docker.pkg.dev/iexcel-dev/iexcel-dev-ui/ui:latest"

# Scaling — dev scales to zero to minimize cost. Low max instances.
auth_min_instances   = 0
auth_max_instances   = 2
api_min_instances    = 0
api_max_instances    = 2
mastra_min_instances = 0
mastra_max_instances = 1
ui_min_instances     = 0
ui_max_instances     = 2

# MASTRA_URL — leave empty on initial deployment.
# After applying, run: terraform output mastra_service_url
# Then set mastra_url to the output value and re-apply.
mastra_url = ""

# LLM configuration
llm_provider = "anthropic"
llm_model    = "claude-sonnet-4-20250514"
