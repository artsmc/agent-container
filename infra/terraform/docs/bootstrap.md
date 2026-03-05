# Bootstrap Guide

Step-by-step instructions to provision the iExcel base infrastructure for the first time in a new GCP environment. Follow these steps in order.

## Prerequisites

Before running Terraform, you need:

1. **GCP project** created and billing enabled
2. **Required APIs enabled** (see section below)
3. **GCS bucket** for Terraform state created manually (bootstrap chicken-and-egg: you need the bucket before you can store state in it)
4. **Credentials** configured: either `gcloud auth application-default login` for local runs, or a service account key / Workload Identity Federation for CI/CD

## Step 1: Enable Required GCP APIs

Run the following for each environment project:

```bash
PROJECT_ID="iexcel-dev"  # or iexcel-staging, iexcel-prod

gcloud services enable \
  compute.googleapis.com \
  sqladmin.googleapis.com \
  servicenetworking.googleapis.com \
  vpcaccess.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  dns.googleapis.com \
  cloudresourcemanager.googleapis.com \
  run.googleapis.com \
  storage.googleapis.com \
  --project="${PROJECT_ID}"
```

## Step 2: Create the Terraform State Bucket

The GCS backend bucket must exist before `terraform init`. Create it once per GCP project:

```bash
PROJECT_ID="iexcel-dev"
BUCKET_NAME="iexcel-terraform-state"

gcloud storage buckets create "gs://${BUCKET_NAME}" \
  --project="${PROJECT_ID}" \
  --location=US \
  --uniform-bucket-level-access \
  --public-access-prevention

# Enable versioning to retain state history
gcloud storage buckets update "gs://${BUCKET_NAME}" \
  --versioning \
  --project="${PROJECT_ID}"

# Enable default encryption (Cloud KMS is optional but recommended for production)
```

## Step 3: Bootstrap Credentials

### Local Development

```bash
gcloud auth application-default login
gcloud config set project iexcel-dev
```

### CI/CD (GitLab Workload Identity Federation)

Configure Workload Identity Federation for the `cicd` service account. After Terraform provisions the `cicd` SA, you must bootstrap the Workload Identity Pool manually (or via a separate bootstrap Terraform config):

```bash
# Create Workload Identity Pool
gcloud iam workload-identity-pools create "gitlab-pool" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --display-name="GitLab CI Pool"

# Create OIDC provider for GitLab
gcloud iam workload-identity-pools providers create-oidc "gitlab-provider" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --workload-identity-pool="gitlab-pool" \
  --display-name="GitLab OIDC Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.project_path=assertion.project_path" \
  --issuer-uri="https://gitlab.com"

# Bind the cicd service account to the pool
# Replace YOUR_PROJECT_NUMBER and YOUR_GITLAB_PROJECT_PATH
gcloud iam service-accounts add-iam-policy-binding \
  "${ENV}-cicd@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/YOUR_PROJECT_NUMBER/locations/global/workloadIdentityPools/gitlab-pool/attribute.project_path/YOUR_GITLAB_PROJECT_PATH"
```

## Step 4: Initialize Terraform

Initialize with environment-specific backend prefix. Each environment writes state to a separate path in the shared bucket:

```bash
ENV="dev"  # or staging, production

cd infra/terraform

terraform init \
  -backend-config="prefix=terraform/state/${ENV}"
```

## Step 5: Plan and Review

```bash
ENV="dev"

terraform plan \
  -var-file="environments/${ENV}.tfvars" \
  -out="${ENV}.tfplan"
```

Review the plan output carefully, especially:
- Cloud SQL instance names and tiers
- Secret Manager secret IDs (will be empty until populated)
- DNS zone NS records (you will need these for domain delegation)

## Step 6: Apply

```bash
terraform apply "${ENV}.tfplan"
```

Expected apply time: 15–25 minutes (Cloud SQL provisioning is the bottleneck).

## Step 7: Retrieve Outputs

After apply, retrieve key outputs for the next steps:

```bash
# Database connection info (for secret population)
terraform output database_private_ip
terraform output database_connection_secret

# DNS name servers (for domain delegation)
terraform output -json vpc_connector_id

# Service account emails (for CI/CD configuration)
terraform output cicd_service_account
terraform output api_service_account
terraform output auth_service_account
```

## Step 8: Populate Secrets

Follow the instructions in `docs/secret-population.md` to populate all 13 application secrets.

## Step 9: Delegate DNS

From the Terraform outputs, get the Cloud DNS name servers:

```bash
# Example output:
# dns_name_servers = [
#   "ns-cloud-a1.googledomains.com.",
#   "ns-cloud-a2.googledomains.com.",
#   ...
# ]
```

Update your domain registrar's NS records to these values. DNS propagation takes 24–48 hours.

## Step 10: Verify SSL Certificate

Monitor the SSL certificate status until it becomes ACTIVE:

```bash
ENV="dev"
PROJECT="iexcel-dev"
CERT_NAME="iexcel-${ENV}-wildcard-cert"

watch -n 30 "gcloud compute ssl-certificates describe ${CERT_NAME} \
  --global --project=${PROJECT} \
  --format='value(managed.status,managed.domainStatus)'"
```

## GitLab CI/CD Integration

The `.gitlab-ci.yml` pipeline automates plan and apply:

- Feature branches: `terraform plan` runs automatically (no apply)
- Merge to main: `terraform plan` → manual approval gate → `terraform apply`
- Environment-specific jobs use the corresponding `.tfvars` file

Set the following CI/CD variables in GitLab:
- `GCP_PROJECT_ID_DEV` — dev GCP project ID
- `GCP_PROJECT_ID_STAGING` — staging GCP project ID
- `GCP_PROJECT_ID_PROD` — production GCP project ID
- `WORKLOAD_IDENTITY_PROVIDER` — full WIF provider resource name

## Rollback

If an apply fails mid-way:

1. Check `terraform state list` to see which resources were created
2. Run `terraform plan` again — Terraform is idempotent and will complete the remaining resources
3. For a full rollback: `terraform destroy -var-file="environments/${ENV}.tfvars"` (only for dev; staging/production require `deletion_protection=false` first)

## Cost Estimates

| Environment | Monthly Estimate (USD) |
|---|---|
| dev | ~$30–50 (db-f1-micro x2, small registry, DNS) |
| staging | ~$150–200 (db-custom-2-7680 x2, NAT, LB) |
| production | ~$300–400 (db-custom-4-15360 x2, HA, NAT, LB) |

Actual costs vary by traffic volume, storage, and egress. Enable Budget Alerts in GCP Billing for each project.
