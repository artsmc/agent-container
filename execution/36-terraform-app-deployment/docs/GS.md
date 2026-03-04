# GS — Gherkin Specification
# Feature 36: Terraform App Deployment

**Date:** 2026-03-03

---

## Feature: Module Structure and Shared Patterns

```gherkin
Feature: All four app modules follow the shared Terraform module pattern

  Scenario: Each app module directory contains the required files
    Given the infra/terraform/modules/ directory
    When I list the contents of modules/auth/, modules/api/, modules/mastra/, and modules/ui/
    Then each directory contains: main.tf, variables.tf, outputs.tf, README.md

  Scenario: Each module accepts the shared set of input variables
    Given any app module (auth, api, mastra, or ui)
    When I inspect its variables.tf
    Then it declares variables for: environment, project_name, region, image_url,
         min_instances, max_instances, service_account, secret_references,
         log_destination, network_config

  Scenario: Each module produces the shared set of outputs
    Given any app module (auth, api, mastra, or ui)
    When I inspect its outputs.tf
    Then it declares outputs for: service_url, service_name, latest_revision

  Scenario: All resources are tagged correctly
    Given any resource created by an app module
    Then it has the following tags:
      | Tag name    | Expected value        |
      | environment | value of var.environment |
      | project     | value of var.project_name |
      | app         | the application name  |
      | managed-by  | terraform             |
      | feature     | 36-terraform-app-deployment |

  Scenario: All resources follow naming convention
    Given the project_name is "iexcel" and environment is "dev"
    When the auth module is applied
    Then the container service is named "iexcel-dev-auth"
    And all related resources follow the "iexcel-dev-auth-*" pattern
```

---

## Feature: Auth module deployment

```gherkin
Feature: Auth service container is deployed by the auth module

  Background:
    Given the base infrastructure (Feature 02) has been applied
    And a valid auth container image exists in the registry
    And all required secrets (AUTH_DATABASE_URL, IDP_CLIENT_ID, IDP_CLIENT_SECRET,
        IDP_ISSUER_URL, SIGNING_KEY_PRIVATE, SIGNING_KEY_PUBLIC) are populated in secret manager

  Scenario: Auth container service is created on port 8090
    When terraform apply runs with the auth module configured
    Then a container service is created using the provided image_url
    And the service is configured to listen on port 8090
    And the service runs as a non-root user

  Scenario: Auth health check is configured correctly
    When the auth container service is deployed
    Then the health check polls GET /health on port 8090
    And the health check interval is 30 seconds
    And the health check timeout is 5 seconds
    And the initial delay is 15 seconds

  Scenario: Auth passes its health check after deployment
    Given the auth container image is valid and secrets are populated
    When the auth container service is deployed
    Then within 2 minutes the service reports healthy
    And GET /health returns HTTP 200

  Scenario: Auth environment variables are injected from secret manager
    When I inspect the auth container service configuration
    Then AUTH_DATABASE_URL is sourced from the secret manager reference
    And IDP_CLIENT_ID is sourced from the secret manager reference
    And no secret values appear as literal strings in the Terraform state

  Scenario: Auth scales horizontally under load
    Given auth_min_instances=1 and auth_max_instances=5
    When request count per instance exceeds the configured scaling threshold
    Then the container service scales up toward max_instances

  Scenario: Auth is reachable at auth.domain.com
    Given the dns module has provisioned the auth target group
    When the auth module is applied
    Then the auth container service is registered as the backend for the auth target group
    And HTTPS requests to auth.domain.com are routed to the auth container

  Scenario: Auth public endpoints are accessible without additional auth headers
    When a request is made to auth.domain.com/.well-known/openid-configuration
    Then the response is 200 OK without requiring authentication
    And the auth container serves the response
```

---

## Feature: API module deployment

```gherkin
Feature: API service container is deployed by the api module

  Background:
    Given the base infrastructure (Feature 02) has been applied
    And a valid API container image exists in the registry
    And all required secrets are populated in secret manager

  Scenario: API container service is created on port 8080
    When terraform apply runs with the api module configured
    Then a container service is created listening on port 8080

  Scenario: API health check is configured correctly
    When the API container service is deployed
    Then the health check polls GET /health on port 8080
    And the interval is 30 seconds and timeout is 5 seconds

  Scenario: API environment variables are injected from secret manager
    When I inspect the API container service configuration
    Then DATABASE_URL is sourced from the secret manager reference
    And ASANA_ACCESS_TOKEN is sourced from the secret manager reference
    And GRAIN_API_KEY is sourced from the secret manager reference
    And GOOGLE_SERVICE_ACCOUNT_JSON is sourced from the secret manager reference
    And no literal secret values appear in Terraform state

  Scenario: API is reachable at api.domain.com
    When the api module is applied with the API target group from the dns module
    Then HTTPS requests to api.domain.com are routed to the API container

  Scenario: API /shared/* path is accessible publicly
    When a request is made to api.domain.com/shared/some-token
    Then the request reaches the API container without the load balancer adding auth headers
    And the API container enforces access control for this path internally

  Scenario: API scales on CPU utilisation
    Given api_min_instances=1 and api_max_instances=10
    When CPU utilisation exceeds the configured threshold
    Then the API container service scales up
```

---

## Feature: Mastra module deployment

```gherkin
Feature: Mastra agent container is deployed by the mastra module

  Background:
    Given the base infrastructure (Feature 02) has been applied
    And a valid Mastra container image exists in the registry
    And the API container service is running (api_internal_url is available)
    And LLM_API_KEY, MASTRA_CLIENT_SECRET, and API_SERVICE_TOKEN secrets are populated

  Scenario: Mastra container service is created on port 8081
    When terraform apply runs with the mastra module configured
    Then a container service is created listening on port 8081

  Scenario: Mastra health check uses a 30-second initial delay
    When the Mastra container service is deployed
    Then the health check polls Mastra's health endpoint on port 8081
    And the initial delay (start-period) is 30 seconds
    And the interval is 30 seconds and timeout is 5 seconds

  Scenario: Mastra environment variables are injected from secret manager
    When I inspect the Mastra container service configuration
    Then LLM_API_KEY is sourced from the secret manager reference
    And MASTRA_CLIENT_SECRET is sourced from the secret manager reference
    And LLM_PROVIDER is set as a plain config environment variable (not a secret reference)
    And LLM_MODEL is set as a plain config environment variable

  Scenario: Mastra receives the API internal URL
    Given the api module output api_service_url is "http://iexcel-dev-api.internal"
    When the mastra module is applied with api_internal_url=module.api.service_url
    Then the Mastra container has API_BASE_URL set to "http://iexcel-dev-api.internal"

  Scenario: Mastra has no public domain
    When the mastra module is applied
    Then no entry is created in the dns module's load balancer routing rules for Mastra
    And Mastra is not directly reachable from the public internet

  Scenario: Mastra observability port is open within the VPC but not externally
    Given observability_port=4318
    When the mastra module is applied
    Then port 4318 is open within the container's network configuration
    And port 4318 is NOT exposed via the load balancer

  Scenario: Mastra scales on queue depth
    Given mastra_min_instances=1 and mastra_max_instances=5
    When the workflow queue depth exceeds the configured threshold
    Then the Mastra container service scales up
```

---

## Feature: UI module deployment

```gherkin
Feature: UI container is deployed by the ui module with CDN for static assets

  Background:
    Given the base infrastructure (Feature 02) has been applied
    And a valid UI container image exists in the registry
    And the API public URL and auth public URL are configured

  Scenario: UI container service is created on port 3000
    When terraform apply runs with the ui module configured
    Then a container service is created listening on port 3000

  Scenario: UI health check is configured correctly
    When the UI container service is deployed
    Then the health check polls GET / on port 3000
    And the interval is 30 seconds and initial delay is 20 seconds

  Scenario: UI environment variables are set as plain config
    When I inspect the UI container service configuration
    Then API_BASE_URL is set to the API's public URL (not a secret)
    And NEXT_PUBLIC_AUTH_URL is set to the auth service's public URL
    And no secrets appear in the UI container configuration

  Scenario: UI is reachable at app.domain.com
    When the ui module is applied with the UI target group from the dns module
    Then HTTPS requests to app.domain.com are routed to the UI container

  Scenario: CDN serves static assets from the UI container
    When the ui module is applied
    Then a CDN distribution is created with the UI service as origin
    And requests to /_next/static/* are served from CDN cache
    And static assets have a long TTL configured

  Scenario: CDN cache is invalidated on new deployment
    When terraform apply deploys a new UI container image
    Then the CDN cache invalidation is triggered for /*
    And subsequent requests fetch fresh assets from the origin

  Scenario: UI scales on request count
    Given ui_min_instances=1 and ui_max_instances=8
    When request count per instance exceeds the threshold
    Then the UI container service scales up
```

---

## Feature: Environment parity

```gherkin
Feature: Same modules deploy identical topology across environments

  Scenario: Same module, different variable file
    Given the modules/api/ module
    When it is applied with dev.tfvars
    Then a container service is created with min_instances=0 and max_instances=3
    When it is applied with production.tfvars
    Then a container service is created with min_instances=2 and max_instances=20
    And in both cases the health check, env var injection, and log routing are identical

  Scenario: Deletion protection differs by environment
    When the dev environment is applied
    Then deletion protection is disabled for dev container services
    When the production environment is applied
    Then deletion protection is enabled (operator must manually disable before destroy)

  Scenario: Dev environment can scale to zero
    Given auth_min_instances=0 in dev.tfvars
    When no traffic hits the auth service in dev for the configured idle period
    Then the container scales down to 0 instances
    And the first request after scaling down causes a cold start
```

---

## Feature: Root composition wiring

```gherkin
Feature: App modules are wired into the root main.tf

  Scenario: App modules are added to root main.tf after Feature 02 base modules
    When I inspect infra/terraform/main.tf
    Then module "auth" is declared with source = "./modules/auth"
    And module "api" is declared with source = "./modules/api"
    And module "mastra" is declared with source = "./modules/mastra"
    And module "ui" is declared with source = "./modules/ui"

  Scenario: Mastra module receives API service URL from API module output
    When I inspect the mastra module instantiation in main.tf
    Then api_internal_url = module.api.service_url

  Scenario: App modules receive IAM service accounts from IAM module
    When I inspect each app module instantiation in main.tf
    Then service_account = module.iam.{app}_service_account for each respective app

  Scenario: App modules receive secret references from secrets module
    When I inspect each app module instantiation in main.tf
    Then secret_references = module.secrets.secret_names (or a filtered subset per app)

  Scenario: App modules receive target group IDs from dns module
    When I inspect the auth, api, and ui module instantiations in main.tf
    Then auth_target_group_id = module.dns.auth_target_group_arn_or_id
    And api_target_group_id = module.dns.api_target_group_arn_or_id
    And ui_target_group_id = module.dns.ui_target_group_arn_or_id
```

---

## Feature: CI/CD Terraform integration

```gherkin
Feature: Terraform plan and apply are integrated into the CI/CD pipeline

  Scenario: terraform plan runs on PR when infra/terraform/ is affected
    Given a PR that modifies a .tf file in infra/terraform/
    When the CI/CD pipeline runs
    Then "terraform plan" is executed
    And the plan output is posted as a PR comment
    And the plan exits with code 0 (no Terraform errors) for the CI check to pass

  Scenario: terraform plan does NOT run when infra/terraform/ is unaffected
    Given a PR that modifies only apps/api/src/
    When the CI/CD pipeline runs
    Then "terraform plan" is NOT executed (Terraform is not in the Nx affected set)

  Scenario: terraform apply runs automatically on merge to main for dev and staging
    Given a merge to main that includes changes to infra/terraform/
    When the CI/CD pipeline runs
    Then "terraform apply" runs automatically for dev and staging
    And the apply uses the correct .tfvars file for each environment

  Scenario: terraform apply for production requires explicit approval
    Given a merge to main that includes changes to infra/terraform/
    When the CI/CD pipeline runs for production
    Then an approval gate is presented to the authorized team member
    And terraform apply does not run until the gate is approved

  Scenario: Image URLs are injected before terraform apply
    Given the CI/CD pipeline has built and pushed the api image as "registry/iexcel/api:abc123"
    When terraform apply runs
    Then the -var flag sets api_image_url="registry/iexcel/api:abc123"
    And the API container service is updated to use the new image

  Scenario: terraform apply is idempotent
    Given an environment where all four app modules are already applied
    When terraform apply runs again with no changes to .tf files or image URLs
    Then the plan shows "No changes. Your infrastructure matches the configuration."
    And no resources are recreated
```

---

## Feature: Security — secrets never in code

```gherkin
Feature: No secret values appear in Terraform code or state

  Scenario: Secret values are not set in Terraform
    When I inspect any .tf file in infra/terraform/
    Then no secret values (API keys, passwords, tokens) appear as literal strings

  Scenario: Terraform state contains only secret references, not values
    Given a successfully applied Terraform configuration
    When I inspect the Terraform state
    Then environment variables sourced from secret manager appear as references/ARNs
    And no plaintext secret values are stored in the state file

  Scenario: Secret manager values are set out-of-band
    Given a fresh environment with no secrets populated
    When terraform apply runs
    Then the secret resources are created (empty slots)
    And the container services attempt to start but fail health checks until secrets are populated
    And the plan output includes a note that secrets must be populated before services become healthy
```
