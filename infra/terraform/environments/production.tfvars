# Production environment — full production-grade resources with maximum
# redundancy, retention, and deletion protection.

environment    = "production"
project_name   = "iexcel"
gcp_project_id = "iexcel-prod"       # Replace with actual GCP project ID
region         = "us-central1"
cloud_provider = "gcp"

# DNS
domain = "iexcel.app"

# Networking
vpc_cidr            = "10.2.0.0/16"
private_subnet_cidr = "10.2.1.0/24"
public_subnet_cidr  = "10.2.2.0/24"
vpc_connector_cidr  = "10.10.0.0/28"

# Database — production-grade: 4 vCPU, 15 GB RAM, regional HA (multi-zone)
db_instance_tier      = "db-custom-4-15360"
auth_db_instance_tier = "db-custom-4-15360"
postgres_version      = "POSTGRES_15"
backup_retention_days = 30
deletion_protection   = true
db_name               = "iexcel"
auth_db_name          = "iexcel_auth"

# Container Registry
image_retention_count = 20

# State backend
terraform_state_bucket = "iexcel-terraform-state"

# ─── App Deployment (Feature 36) ──────────────────────────────────────────────
# Image URLs are set by the CI/CD pipeline on each deployment.
# Replace placeholders with real Artifact Registry image URLs after first build.

auth_image_url   = "us-central1-docker.pkg.dev/iexcel-prod/iexcel-production-auth/auth:latest"
api_image_url    = "us-central1-docker.pkg.dev/iexcel-prod/iexcel-production-api/api:latest"
mastra_image_url = "us-central1-docker.pkg.dev/iexcel-prod/iexcel-production-mastra/mastra:latest"
ui_image_url     = "us-central1-docker.pkg.dev/iexcel-prod/iexcel-production-ui/ui:latest"

# Scaling — production keeps minimum instances warm to eliminate cold starts for end users.
# auth and api at min=2 for redundancy across GCP availability zones.
auth_min_instances   = 2
auth_max_instances   = 5
api_min_instances    = 2
api_max_instances    = 8
mastra_min_instances = 1
mastra_max_instances = 4
ui_min_instances     = 2
ui_max_instances     = 5

# MASTRA_URL — leave empty on initial deployment.
# After applying, run: terraform output mastra_service_url
# Then set mastra_url to the output value and re-apply.
mastra_url = ""

# LLM configuration
llm_provider = "anthropic"
llm_model    = "claude-sonnet-4-20250514"
