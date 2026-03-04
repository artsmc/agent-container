# FRD — Feature Requirement Document
# Feature 35: Container Builds

## 1. Business Objectives

The iExcel automation system is composed of four independently deployable applications (`auth`, `api`, `mastra`, `ui`) and two database migration jobs (`database`, `auth-database`). Without containerisation, deploying one application forces redeployment of everything — slow, risky, and wasteful.

This feature establishes the container build layer: each application gets a production-ready Dockerfile, the CI/CD pipeline (feature 34) is wired to build and push images only for affected apps, and a migration job container handles schema changes as a pre-deploy step.

The end state is a container registry that always holds tagged, scanned images for every application, with a retention policy that keeps costs predictable and a build pipeline that executes in seconds for unchanged components.

## 2. Value Proposition

| Stakeholder | Value Delivered |
|---|---|
| Engineering team | Reproducible, auditable builds. Developers can run any app locally with `docker run`. |
| Operations | Every image is vulnerability-scanned before entering the registry. No surprises in production. |
| Product | Faster deployments — only changed apps rebuild. Bugs fixed and shipped in minutes, not hours. |
| Security | Secrets never baked into images. Multi-stage builds eliminate build tooling from the attack surface. |

## 3. Target Users

- **CI/CD pipeline** (automated) — the primary consumer of this feature. The pipeline builds, tags, and pushes images on every qualifying push to `main`.
- **Engineers** — run images locally during integration testing or incident investigation.
- **Feature 36 (Terraform App Deployment)** — downstream consumer that pulls tagged images from the registry and deploys them to Cloud Run / ECS Fargate.

## 4. Success Metrics and KPIs

| Metric | Target |
|---|---|
| Image build time per app (cache-warm) | < 90 seconds |
| Image build time per app (cache-cold) | < 5 minutes |
| Image size — Node.js apps (api, mastra, auth, ui) | < 200 MB compressed |
| Vulnerability scan gate enforcement | 100% — no image pushed with CRITICAL findings unacknowledged |
| Migration job success rate in staging | 100% before promoting to production |
| Registry image count per app (retention) | Last N images kept (N configurable, default 10) |
| Unaffected apps rebuilt on a single-app change | 0 |

## 5. Business Constraints and Dependencies

### Hard Dependencies (Blocked By)
- **Feature 00 (Nx Monorepo Scaffolding)**: The `apps/` directory structure and `project.json` files must exist before Dockerfiles can be authored. The Nx affected-detection output consumed by this feature is also a product of feature 00's workspace config.
- **Feature 34 (CI/CD Pipeline)**: The pipeline that runs lint/type-check/test/build and then calls the Docker build steps defined here must exist. Feature 35 defines *what* to build; feature 34 defines *when and how* to trigger it.

### Hard Dependency (Blocks)
- **Feature 36 (Terraform App Deployment)**: Terraform can only deploy containers that exist in the registry. Feature 35 must produce at least one valid tagged image for each app before feature 36's Terraform modules can be applied.

### Out-of-Scope Dependencies
- **Feature 02 (Terraform Base Infrastructure)**: Provisions the container registry resource itself (GCR Artifact Registry or ECR). Feature 35 assumes the registry exists and has credentials configured in CI. Configuration of retention policy and vulnerability scanning at the registry level is driven by feature 02's Terraform, but feature 35 defines the tagging strategy that makes retention policies enforceable.
- **Application source code**: Dockerfiles package whatever code exists in `apps/`. Feature 35 does not own or change application source.
- **Mastra containerisation spike**: Mastra has its own backend runtime and observability layer. A spike confirming containerisation compatibility must complete before the `apps/mastra/Dockerfile` is finalised.

## 6. Integration with Product Roadmap

Feature 35 sits in Phase 8 — CI/CD and Deployment — and is the penultimate step before the system can run in a cloud environment:

```
Phase 0–7: Application development
Phase 8:   34 (Pipeline) → 35 (Container Builds) → 36 (Terraform App Deployment)
```

Once feature 35 and 36 are complete, the full automated path from a merged PR to a running service in staging is established.

## 7. Open Questions Inherited from PRD

- **GCP or AWS?** Registry is either GCR Artifact Registry or ECR. Dockerfiles are cloud-agnostic, but CI authentication steps differ. Feature 35 should document both paths and gate on the cloud decision.
- **Mastra runtime compatibility**: Spike required. If Mastra cannot run in a standard Node.js container, the Dockerfile may need a custom base image or additional runtime setup.
- **Migration tool choice**: `packages/database` uses a migration tool (Prisma Migrate, Drizzle Kit, or golang-migrate). The migration job Dockerfile depends on this choice. The tool should be confirmed before authoring migration Dockerfiles.
