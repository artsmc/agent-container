# GS — Gherkin Specification
## Feature 02: Terraform Base Infrastructure

**Date:** 2026-03-03

---

## Feature: Terraform Base Infrastructure

  As a platform engineer
  I want the cloud foundation provisioned as Terraform code
  So that all application infrastructure is reproducible, auditable, and environment-consistent

---

## Background

  Given the Nx monorepo has been scaffolded (feature 00)
  And the `infra/terraform/` directory structure exists
  And a remote backend bucket has been manually pre-created for Terraform state
  And a cloud provider (GCP or AWS) has been selected and credentials are available via environment variables

---

## Feature: Networking Module

  Scenario: VPC and subnets are provisioned
    Given the networking module is configured with environment "dev"
    And vpc_cidr is "10.0.0.0/16"
    And private_subnet_cidr is "10.0.1.0/24"
    And public_subnet_cidr is "10.0.2.0/24"
    When "terraform apply" is run
    Then a VPC with CIDR "10.0.0.0/16" is created in the target region
    And a private subnet with CIDR "10.0.1.0/24" exists within the VPC
    And a public subnet with CIDR "10.0.2.0/24" exists within the VPC
    And the VPC is tagged with environment "dev" and managed-by "terraform"

  Scenario: Container subnet is protected from direct public access
    Given the networking module has been applied
    When a connection attempt is made directly from the public internet to an address in the private subnet
    Then the connection is refused by the firewall / security group rules
    And the connection is not routed to any container resource

  Scenario: Database subnet is protected from container subnet lateral access on non-database ports
    Given the networking module has been applied
    And the database security group is attached to a database instance
    When a connection attempt is made from the container subnet to the database instance on port 80
    Then the connection is denied
    And only port 5432 traffic from the container security group is permitted

  Scenario: Outbound internet access from containers is enabled via NAT
    Given the networking module has been applied with a NAT gateway / Cloud NAT
    When a process in the private subnet initiates an outbound HTTPS connection to an external API
    Then the connection succeeds
    And the source IP observed by the external service is the NAT gateway's public IP

  Scenario: Module is idempotent on re-apply
    Given the networking module has been applied once
    When "terraform apply" is run a second time with identical variables
    Then Terraform reports 0 resources to add, 0 to change, 0 to destroy

---

## Feature: Product Database Module

  Scenario: Product Postgres instance is provisioned with no public IP
    Given the database module is configured with the private subnet from the networking module
    And deletion_protection is "false" (dev environment)
    When "terraform apply" is run
    Then a managed Postgres instance is created
    And the instance has no public IP address
    And the instance is accessible only from within the private subnet on port 5432

  Scenario: Automated backups are enabled
    Given the database module is applied with backup_retention_days set to 3
    When the Postgres instance configuration is inspected via the cloud console or CLI
    Then automated backups are enabled
    And the retention period is 3 days
    And point-in-time recovery is enabled

  Scenario: Database master password is stored in secret manager, not in Terraform output
    Given the database module is applied
    When "terraform output" is run
    Then the master database password is NOT present in any output value
    And the secret manager contains a secret named according to the DATABASE_URL pattern for the environment
    And the secret value is an empty placeholder (not yet populated)

  Scenario: Database is sized minimally in dev and production-grade in production
    Given dev.tfvars sets db_instance_tier to the smallest available tier
    And production.tfvars sets db_instance_tier to a production-grade tier
    When "terraform apply" is run for dev
    Then the dev database instance uses the minimal tier
    When "terraform apply" is run for production
    Then the production database instance uses the production-grade tier

  Scenario: Deletion protection prevents accidental destroy in staging
    Given the database module is applied in staging with deletion_protection "true"
    When "terraform destroy" is attempted
    Then Terraform reports an error indicating the resource is protected from deletion
    And the database instance is not deleted

---

## Feature: Auth Database Module

  Scenario: Auth database is a separate instance from the product database
    Given both the database and auth-database modules are applied
    When the cloud console or Terraform state is inspected
    Then two distinct Postgres instances exist
    And they have different instance IDs
    And they are not the same instance with different schemas

  Scenario: Auth database secret is distinct from product database secret
    Given the secrets module is applied
    When the secret manager is inspected
    Then a secret named for AUTH_DATABASE_URL exists
    And a separate secret named for DATABASE_URL exists
    And they have different names and different access policies

---

## Feature: Container Registry Module

  Scenario: Private container registry is provisioned
    Given the container-registry module is applied
    When an unauthenticated docker pull is attempted against the registry URL
    Then the pull is rejected with an authentication error

  Scenario: Repositories exist for all four applications
    Given the container-registry module is applied with app_names ["auth", "api", "mastra", "ui"]
    When the registry is inspected
    Then four repositories exist: auth, api, mastra, ui

  Scenario: Vulnerability scanning is active on image push
    Given the container-registry module is applied with scanning enabled
    When a Docker image is pushed to the api repository by the CI/CD service account
    Then a vulnerability scan is triggered automatically
    And scan results are available in the registry console or API within a reasonable time

  Scenario: Image retention policy limits stored images per repository
    Given image_retention_count is set to 10
    And 12 images have been pushed to the api repository over time
    When the retention policy runs
    Then only the 10 most recent images are retained
    And the 2 oldest images are deleted

---

## Feature: Secrets Module

  Scenario: All required secret slots are created
    Given the secrets module is applied for the "dev" environment
    When the cloud secret manager is queried
    Then secrets with names matching the following patterns exist:
      | Secret Logical Name        |
      | DATABASE_URL               |
      | AUTH_DATABASE_URL          |
      | IDP_CLIENT_ID              |
      | IDP_CLIENT_SECRET          |
      | SIGNING_KEY_PRIVATE        |
      | SIGNING_KEY_PUBLIC         |
      | ASANA_CLIENT_ID            |
      | ASANA_CLIENT_SECRET        |
      | ASANA_ACCESS_TOKEN         |
      | GRAIN_API_KEY              |
      | GOOGLE_SERVICE_ACCOUNT_JSON|
      | LLM_API_KEY                |
      | EMAIL_PROVIDER_API_KEY     |
    And each secret slot exists but has no active version (placeholder only)

  Scenario: Secrets are namespaced per environment
    Given the secrets module is applied for both "dev" and "production"
    When the secret manager is queried
    Then the dev DATABASE_URL secret name contains "dev" in its identifier
    And the production DATABASE_URL secret name contains "prod" or "production" in its identifier
    And they are distinct, non-overlapping resources

  Scenario: Secret access is restricted to the relevant service account
    Given the IAM and secrets modules are both applied
    When the api service account attempts to read SIGNING_KEY_PRIVATE
    Then the read is denied (that secret is for the auth service account only)
    When the auth service account attempts to read ASANA_ACCESS_TOKEN
    Then the read is denied (that secret is for the api service account only)

---

## Feature: DNS and Load Balancer Module

  Scenario: Load balancer is provisioned in the public subnet
    Given the dns module is applied with the public subnet from the networking module
    When the cloud load balancer list is inspected
    Then a load balancer exists in the public subnet
    And it has a public IP address or DNS name

  Scenario: HTTPS is enforced and HTTP is redirected
    Given the dns module is applied and a TLS certificate is provisioned
    When an HTTP request is made to http://app.dev.iexcel.app/
    Then the response is an HTTP 301 or 302 redirect to https://app.dev.iexcel.app/

  Scenario: DNS records resolve to the load balancer
    Given DNS records have been created for app.dev.iexcel.app, api.dev.iexcel.app, auth.dev.iexcel.app
    When a DNS lookup is performed for api.dev.iexcel.app
    Then the response resolves to the load balancer's IP address or CNAME

  Scenario: Target groups exist as stubs before containers are deployed
    Given the dns module is applied but no container services are attached (feature 02 scope)
    When the load balancer routing rules are inspected
    Then target groups exist for ui, api, and auth
    And requests to these paths return a 503 or configured default response (no healthy targets)
    And this is expected behaviour until feature 36 attaches container services

  Scenario: Module is idempotent on re-apply
    Given the dns module has been applied once
    When "terraform apply" is run again with identical variables
    Then Terraform reports 0 resources to add, 0 to change, 0 to destroy

---

## Feature: IAM Module

  Scenario: Service accounts are created with least-privilege permissions
    Given the iam module is applied
    When each service account's permissions are enumerated
    Then the api service account has access only to: DATABASE_URL secret, ASANA secrets, GRAIN_API_KEY secret, GOOGLE_SERVICE_ACCOUNT_JSON secret, EMAIL_PROVIDER_API_KEY secret
    And the auth service account has access only to: AUTH_DATABASE_URL secret, IDP_CLIENT_ID secret, IDP_CLIENT_SECRET secret, SIGNING_KEY_PRIVATE secret, SIGNING_KEY_PUBLIC secret
    And the mastra service account has access only to: LLM_API_KEY secret
    And the ui service account has no secret manager access

  Scenario: No service account has wildcard permissions
    Given the iam module is applied
    When the IAM policies for each service account are inspected
    Then no policy contains a wildcard action (e.g., "*" or "s3:*" or "roles/owner")

  Scenario: CI/CD service account can push to the container registry
    Given the iam module is applied
    When the CI/CD service account authenticates and attempts to push an image to the registry
    Then the push succeeds

  Scenario: CI/CD service account can manage Terraform state
    Given the iam module is applied
    When the CI/CD service account runs "terraform plan" against the state backend
    Then the plan succeeds and state is read/written correctly

  Scenario: No long-lived service account key files are generated
    Given the iam module is applied
    When Terraform outputs and state are inspected
    Then no service account key JSON or AWS access key ID/secret is present in any output or state value

---

## Feature: Root Composition and Environment Parity

  Scenario: Root main.tf applies all base modules cleanly
    Given all seven base modules (networking, database, auth-database, container-registry, secrets, dns, iam) are wired in root main.tf
    And dev.tfvars is used
    When "terraform apply -var-file=environments/dev.tfvars" is run
    Then all modules apply without errors
    And "terraform plan" immediately after shows 0 changes

  Scenario: The same module code applies to all three environments
    Given staging.tfvars and production.tfvars exist with environment-appropriate values
    When "terraform apply -var-file=environments/staging.tfvars" is run (against staging backend)
    Then all modules apply without errors
    And no environment-specific Terraform code branching is required

  Scenario: Remote state backend is used
    Given backend.tf is configured with a GCS bucket or S3 bucket
    When "terraform init" is run
    Then Terraform initialises successfully using the remote backend
    And no local `terraform.tfstate` file is created in the repository

  Scenario: State locking prevents concurrent applies
    Given two engineers both run "terraform apply" at the same time against the same environment
    Then one apply acquires the state lock and proceeds
    And the other apply waits or fails with a lock-held error
    And the state is not corrupted

  Scenario: Terraform destroy is possible in dev
    Given deletion_protection is false in dev.tfvars
    When "terraform destroy -var-file=environments/dev.tfvars" is run against dev
    Then all provisioned resources are removed cleanly
    And the command exits with code 0
