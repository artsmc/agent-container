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
