# Staging environment — mid-tier resources that mirror production configuration
# without full production cost. deletion_protection is TRUE.

environment    = "staging"
project_name   = "iexcel"
gcp_project_id = "iexcel-staging"    # Replace with actual GCP project ID
region         = "us-central1"
cloud_provider = "gcp"

# DNS
domain = "staging.iexcel.app"

# Networking
vpc_cidr            = "10.1.0.0/16"
private_subnet_cidr = "10.1.1.0/24"
public_subnet_cidr  = "10.1.2.0/24"
vpc_connector_cidr  = "10.9.0.0/28"

# Database — mid-tier: 2 vCPU, 7.5 GB RAM, regional HA
db_instance_tier      = "db-custom-2-7680"
auth_db_instance_tier = "db-custom-2-7680"
postgres_version      = "POSTGRES_15"
backup_retention_days = 7
deletion_protection   = true
db_name               = "iexcel"
auth_db_name          = "iexcel_auth"

# Container Registry
image_retention_count = 10

# State backend
terraform_state_bucket = "iexcel-terraform-state"
