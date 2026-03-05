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
