# FRD — Feature Requirement Document
## Feature 02: Terraform Base Infrastructure

**Phase:** 1 — Foundation
**Status:** Pending
**Date:** 2026-03-03
**Blocked By:** Feature 00 (nx-monorepo-scaffolding — provides `infra/terraform/` directory structure)
**Blocks:** Feature 36 (terraform-app-deployment — adds container service modules)

---

## 1. Business Objectives

The iExcel automation system must be deployable, repeatable, and environment-consistent across development, staging, and production. Without a defined cloud foundation, every deployment becomes a manual, error-prone exercise, and environment drift makes it impossible to trust that staging behaviour reflects production behaviour.

Feature 02 establishes the cloud infrastructure foundation — the networking fabric, database instances, container registry, secrets scaffolding, DNS/load balancer configuration, and IAM roles — as code. All subsequent deployment features (CI/CD pipelines in feature 34, container builds in feature 35, and application container services in feature 36) depend on this foundation being in place.

### Primary Objectives

1. **Reproducibility.** Every cloud resource is defined in Terraform. No resource exists unless it is declared in code and reviewed via pull request.
2. **Environment parity.** The same Terraform module code runs in all three environments (dev, staging, production) with only variable values differing.
3. **Least-privilege security.** Service accounts and IAM roles are defined per container with minimal permissions. No container has credentials it does not need.
4. **Secret hygiene.** Terraform creates secret references in the cloud secret manager. Actual credential values are never stored in code or state in plaintext.
5. **Cloud flexibility.** Modules are structured to support either GCP or AWS. The final provider decision is deferred; switching providers requires only swapping provider-specific implementations behind consistent module interfaces.

---

## 2. Target Users

| User | Concern |
|---|---|
| **Platform / DevOps engineer** | Primary author and operator of these Terraform modules. Runs `terraform plan` and `terraform apply`. Manages state backend and variable files. |
| **Application developer** | Consumes Terraform outputs (database URLs, registry URLs, secret ARNs/names) in application configuration. Does not modify Terraform directly. |
| **CI/CD pipeline (feature 34)** | Uses a dedicated CI/CD service account (defined in IAM module) to run Terraform plan/apply on infrastructure changes. |
| **Security reviewer** | Reviews IAM policies and secret manager configuration in pull requests. |

---

## 3. Value Proposition

| Without Feature 02 | With Feature 02 |
|---|---|
| Infrastructure created manually via cloud console — not reproducible | All resources declared in code, reviewed in PRs, applied deterministically |
| Environment configurations diverge over time | Dev, staging, and production use identical module code with variable overrides |
| Credentials scattered across developer machines and config files | All secrets centralised in cloud secret manager; Terraform holds references only |
| Feature 36 (app deployment) cannot be built | Container services have networking, databases, registry, and IAM to connect to |
| No audit trail for infrastructure changes | Every change is a git commit; `terraform plan` output is visible in the PR |

---

## 4. Success Metrics / Acceptance Criteria (Business Level)

1. `terraform plan` runs cleanly in all three environments without errors.
2. `terraform apply` in the dev environment provisions all base resources (VPC, subnets, both database instances, registry, secret references, DNS/LB skeleton, IAM accounts) without manual console intervention.
3. Both Postgres instances are reachable from within the private subnet and are unreachable from the public internet.
4. The container registry accepts image pushes from the CI/CD service account.
5. All defined secrets exist in the cloud secret manager (values may be placeholder; references must exist).
6. Terraform state is stored in a remote backend with locking enabled.
7. A `terraform destroy` in the dev environment cleanly removes all provisioned resources.

---

## 5. Business Constraints

- **Cloud provider not yet decided.** GCP and AWS are both candidates. Modules must not hard-code provider-specific resource types in a way that makes migration prohibitive.
- **No secret values in code.** Terraform may create secret container resources (the named slot), but the actual credential bytes are loaded out-of-band (manually or via a separate secure process).
- **Feature 00 must complete first.** The `infra/terraform/` directory structure and the `project.json` Nx configuration are scaffolded by feature 00. Feature 02 populates the content of that structure.
- **Application container modules are out of scope.** The `modules/auth/`, `modules/api/`, `modules/mastra/`, and `modules/ui/` directories are placeholder stubs created in feature 00. They are implemented in feature 36.
- **Budget constraint: minimal for dev.** Dev environment should use the smallest available instance sizes to control cost during development.

---

## 6. Integration with Larger Product Roadmap

Feature 02 sits in Phase 1 (Foundation) alongside features 01, 03, and 04. It is the infrastructure counterpart to the database schema work. The overall dependency chain for deployment readiness is:

```
00 (monorepo)
 └── 02 (base infra)   ← this feature
      └── 36 (app deployment) ← depends on 02 + 35 (container builds)
```

Once feature 02 is complete:
- Feature 34 (CI/CD pipeline) can define Terraform plan/apply stages referencing this infrastructure.
- Feature 35 (container builds) can push images to the registry provisioned here.
- Feature 36 (terraform-app-deployment) can add container service modules on top of the networking and IAM foundations laid here.
