# GS — Gherkin Specification
# Feature 35: Container Builds

---

## Feature: Multi-Stage Docker Builds for Application Images

  As a CI/CD pipeline
  In order to produce small, secure, production-ready container images
  I need to build each application using a multi-stage Dockerfile

  Background:
    Given the Nx monorepo exists at the repository root
    And the apps/ directory contains auth/, api/, mastra/, and ui/ subdirectories
    And each app directory contains a Dockerfile and project.json
    And a .dockerignore file exists at the monorepo root

---

  ### Scenario: Building the auth image from a clean context
    Given no cached layers exist for the auth image
    And apps/auth/Dockerfile exists with a builder stage and a runtime stage
    When the CI pipeline runs: docker build -f apps/auth/Dockerfile -t auth:test .
    Then the builder stage installs all dependencies including devDependencies
    And the builder stage compiles the TypeScript source
    And the runtime stage is based on node:20-alpine
    And the runtime stage contains only the compiled output and production node_modules
    And the runtime stage does not contain the TypeScript compiler or source files
    And the resulting image exposes port 8090
    And the resulting image includes a HEALTHCHECK directive targeting GET /health on port 8090
    And the process inside the container runs as a non-root user

  ### Scenario: Building the api image
    Given apps/api/Dockerfile exists with a builder stage and a runtime stage
    When the CI pipeline runs: docker build -f apps/api/Dockerfile -t api:test .
    Then the runtime image is based on node:20-alpine
    And the runtime image exposes port 8080
    And the HEALTHCHECK directive targets GET /health on port 8080
    And the process runs as a non-root user
    And no secrets or environment variable values are embedded in the image

  ### Scenario: Building the mastra image
    Given the Mastra containerisation spike has completed and confirmed compatibility
    And apps/mastra/Dockerfile exists with a builder stage and a runtime stage
    When the CI pipeline runs: docker build -f apps/mastra/Dockerfile -t mastra:test .
    Then the runtime image is based on node:20-alpine or node:20-slim per spike result
    And the runtime image exposes port 8081
    And the runtime image exposes Mastra's observability port if applicable
    And the HEALTHCHECK start-period is at least 30 seconds
    And the process runs as a non-root user

  ### Scenario: Building the ui image with Next.js standalone output
    Given apps/ui/Dockerfile uses a three-stage build
    And next.config.js has output: 'standalone' configured
    When the CI pipeline runs: docker build -f apps/ui/Dockerfile -t ui:test .
    Then the deps stage installs all node_modules
    And the builder stage runs next build and produces .next/standalone
    And the runtime stage copies only .next/standalone and .next/static
    And the runtime image is based on node:20-alpine
    And the runtime image exposes port 3000
    And the process runs as non-root user node
    And no NEXT_PUBLIC_* values or API_BASE_URL values are hardcoded in the image

  ### Scenario: No secrets baked into any image
    Given any application Dockerfile is built
    When the resulting image layers are inspected with docker history --no-trunc
    Then no layer contains AUTH_DATABASE_URL with a value
    And no layer contains IDP_CLIENT_SECRET with a value
    And no layer contains DATABASE_URL with a value
    And no layer contains LLM_API_KEY with a value
    And no layer contains any value matching a secret pattern

---

## Feature: Migration Job Containers

  As a CI/CD pipeline
  In order to apply database schema changes before deploying the API
  I need to build and run migration job containers as a pre-deploy step

---

  ### Scenario: Building the product database migration image
    Given packages/database/Dockerfile exists
    And the migration tool (Prisma/Drizzle/golang-migrate) has been confirmed
    When the CI pipeline runs: docker build -f packages/database/Dockerfile -t db-migrate:test .
    Then the resulting image has an ENTRYPOINT set to run the migration command
    And the image exits with code 0 when migrations complete successfully
    And DATABASE_URL is not hardcoded in the image

  ### Scenario: Running the migration job successfully
    Given the db-migrate image has been built
    And DATABASE_URL is injected as a runtime environment variable
    And the target database is reachable
    When the container runs with: docker run --env DATABASE_URL=$DB_URL db-migrate:{sha}
    Then all pending migrations are applied
    And the container exits with code 0
    And the migration log is written to stdout

  ### Scenario: Running the migration job when no migrations are pending
    Given the db-migrate image has been built
    And the target database is already at the latest migration version
    When the migration container runs
    Then the container exits with code 0
    And the log indicates no migrations were applied

  ### Scenario: Migration job fails due to database connectivity
    Given the db-migrate image has been built
    And DATABASE_URL points to an unreachable host
    When the migration container runs
    Then the container exits with a non-zero exit code
    And the error is written to stderr
    And the CI pipeline step fails
    And the API container deployment does not proceed

  ### Scenario: Migration job fails due to a migration script error
    Given the db-migrate image has been built
    And the target database is reachable
    And one migration script contains a SQL syntax error
    When the migration container runs
    Then the migration tool rolls back to the previous consistent state
    And the container exits with a non-zero exit code
    And the CI pipeline step fails
    And the API container deployment does not proceed

  ### Scenario: Auth migration job runs for auth-database changes
    Given packages/auth-database/migrations/ is in the Nx affected set
    And the auth-db-migrate image has been built
    When the CI pipeline triggers the auth migration step
    Then the migration container runs with AUTH_DATABASE_URL injected
    And auth migrations are applied before the auth container is deployed

  ### Scenario: Migration job not triggered when database package is unaffected
    Given packages/database/migrations/ is NOT in the Nx affected set
    When the CI pipeline runs for a change to apps/api/src/
    Then the migration job container is not built
    And the migration job is not run
    And the API container is deployed directly

---

## Feature: Image Tagging Strategy

  As a CI/CD pipeline
  In order to support deployment, rollback, and retention policy enforcement
  I need to tag images with a commit SHA, environment label, and latest

---

  ### Scenario: Tagging on a push to main
    Given a Docker image has been built successfully
    And the current git commit SHA is abc123def456...
    And the target environment is staging
    When the push step runs
    Then the image is pushed with tag {registry}/{app}:abc123def456...
    And the image is pushed with tag {registry}/{app}:staging
    And the image is pushed with tag {registry}/{app}:latest

  ### Scenario: Full 40-character SHA is used
    Given a Docker image has been built
    When tags are applied
    Then the SHA tag uses the full 40-character commit SHA
    And not a short 7-character SHA

  ### Scenario: Environment tag is updated on each deploy
    Given {registry}/api:staging exists pointing to commit SHA aaa...
    And a new image is built from commit SHA bbb...
    When the pipeline pushes the new image
    Then {registry}/api:staging now points to commit SHA bbb...
    And {registry}/api:aaa... still exists in the registry
    And {registry}/api:latest points to commit SHA bbb...

  ### Scenario: Production deployment uses existing staging image without rebuild
    Given {registry}/api:abc123def456... was pushed during staging deployment
    And the staging environment has been validated
    When the production promotion is triggered
    Then the api image is NOT rebuilt
    And {registry}/api:abc123def456... is re-tagged as {registry}/api:production
    And the production container service is updated to use {registry}/api:abc123def456...

---

## Feature: CI/CD Build Trigger — Affected Apps Only

  As a CI/CD pipeline
  In order to avoid unnecessary rebuilds and deployments
  I need to only build Docker images for apps affected by the current change

---

  ### Scenario: Single app change triggers only that app's build
    Given only apps/api/src/routes/tasks.ts was modified in the commit
    When the Nx affected detection runs
    Then only the api app is in the affected set
    And only the api Docker image is built
    And auth, mastra, and ui images are not rebuilt
    And auth, mastra, and ui are not deployed

  ### Scenario: shared-types change triggers all four app builds
    Given packages/shared-types/src/task.ts was modified
    When the Nx affected detection runs
    Then auth, api, mastra, and ui are all in the affected set
    And all four Docker images are built and pushed

  ### Scenario: api-client change triggers ui and mastra builds
    Given packages/api-client/src/ was modified
    When the Nx affected detection runs
    Then ui and mastra are in the affected set
    And ui and mastra Docker images are built
    And auth and api images are not rebuilt

  ### Scenario: Database package change triggers migration job and api build
    Given packages/database/migrations/001_add_column.sql was added
    When the Nx affected detection runs
    Then the database migration job image is built
    And the api Docker image is built
    And the migration job runs before the api container is deployed

  ### Scenario: auth-database package change triggers auth migration job and auth build
    Given packages/auth-database/migrations/ was modified
    When the Nx affected detection runs
    Then the auth-database migration job image is built
    And the auth Docker image is built
    And the auth migration job runs before the auth container is deployed

  ### Scenario: Terraform-only change does not trigger any Docker builds
    Given only infra/terraform/modules/networking/main.tf was modified
    When the Nx affected detection runs
    Then no app is in the affected set
    And no Docker image is built
    And only the Terraform plan step runs

---

## Feature: Vulnerability Scanning on Push

  As a security-conscious team
  In order to prevent containers with known critical vulnerabilities from being deployed
  I need the container registry to scan images on push and the pipeline to gate on results

---

  ### Scenario: Image scanned after push — no critical vulnerabilities
    Given an image has been pushed to the registry
    When the vulnerability scan completes
    Then the scan result shows no CRITICAL severity findings
    And the pipeline deployment step proceeds

  ### Scenario: Image scanned after push — critical vulnerability found
    Given an image has been pushed to the registry
    When the vulnerability scan completes
    And the scan result shows one or more CRITICAL severity findings
    Then the pipeline deployment step is blocked
    And the pipeline outputs the list of critical findings to the job log
    And a notification is sent to the engineering team
    And no container is deployed from this image until the finding is resolved

  ### Scenario: Image has only warning-level vulnerabilities
    Given an image has been pushed to the registry
    When the vulnerability scan completes
    And the scan result shows only MEDIUM or LOW severity findings
    Then the pipeline logs the findings as warnings
    And the deployment step proceeds

---

## Feature: Image Retention Policy

  As a registry administrator
  In order to control storage costs and maintain a clean registry
  I need old untagged images to be automatically deleted while deployed images are preserved

---

  ### Scenario: Old untagged image is cleaned up
    Given an image was pushed 8 days ago
    And it has no tag (untagged after being superseded)
    When the retention policy runs
    Then the image is deleted from the registry

  ### Scenario: Currently deployed image is preserved regardless of age
    Given an image was pushed 30 days ago
    And it is tagged with {registry}/{app}:production
    When the retention policy runs
    Then the image is NOT deleted

  ### Scenario: More than N SHA-tagged images exist for one app
    Given the registry contains 15 SHA-tagged images for the api app
    And N is configured as 10
    When the retention policy runs
    Then the 5 oldest SHA-tagged images are deleted
    And the 10 most recent SHA-tagged images are retained
    And any image also carrying an environment tag (dev, staging, production) is retained regardless

  ### Scenario: Registry is clean after a week of inactivity
    Given no new images have been pushed for 7 days
    And all untagged images are older than 7 days
    When the retention policy runs
    Then all untagged images are deleted
    And tagged images (SHA and environment) are preserved
