# FRD — Feature Requirement Document
# Feature 03: Auth Database Schema

## 1. Business Objective

Establish the persistent identity data store for the iExcel authentication service. This database is the authoritative record of every human and service identity in the ecosystem. Without it, no authentication can occur, no sessions can be tracked, and no token can be issued or revoked. It is a hard prerequisite for the auth service (Feature 05) and, transitively, for every feature that requires authentication.

## 2. Value Proposition

| Stakeholder | Value Delivered |
|---|---|
| **Development team** | A versioned, reproducible schema that can be applied to any environment (local, staging, production) via a single migration command. |
| **Auth Service (Feature 05)** | Tables are ready and correctly indexed when the auth service attempts its first query. No schema bootstrapping logic required in application code. |
| **Security posture** | Secrets (client_secret, refresh tokens) are never stored in plaintext. The schema enforces hashing at the data model level via naming convention and documentation. |
| **Operations team** | Down migrations exist for every up migration, enabling clean rollback in any environment. |
| **Future maintainers** | The auth database is completely isolated from the product database — changes to product schema cannot corrupt identity data and vice versa. |

## 3. Target Users

This feature has no direct end-user interaction. Its consumers are:

- **Feature 05 (Auth Service)** — the primary consumer that reads and writes to all four tables.
- **Database administrators** — who apply, verify, and roll back migrations.
- **CI/CD pipeline (Feature 34/35)** — which runs migrations as part of deployment.

## 4. Problem Statement

Prior to this feature:

- No persistent store exists for user identities registered via SSO.
- No table exists to record which OIDC clients are authorized to request tokens.
- Refresh tokens cannot be stored, validated, or revoked between service restarts.
- Sessions cannot be tracked for single-logout or forced re-authentication.

This feature creates the schema that resolves all four gaps.

## 5. Success Metrics

| Metric | Target |
|---|---|
| All four tables created with correct columns, types, and constraints | 100% match to PRD schema |
| All up migrations apply cleanly from a blank Postgres database | Zero errors |
| All down migrations fully reverse their corresponding up migration | Schema returns to previous state |
| Seed data inserts all four pre-registered OIDC clients | 4 rows in `oidc_clients` |
| Feature 05 (Auth Service) can connect and perform queries without schema changes | No schema drift |

## 6. Business Constraints

- **Physical isolation**: The auth database must be a separate Postgres database from the product database (Feature 04). The two schemas must not co-exist in the same database, though they may reside on the same Postgres instance.
- **No application logic**: This feature delivers SQL migrations and seed data only. No ORM models, no service code, no API endpoints.
- **Dependency**: Feature 00 (Nx Monorepo Scaffolding) must have created `packages/auth-database/` before this feature begins.
- **Hashing is an application concern**: The schema stores `client_secret_hash` and `token_hash` columns. The actual hashing is the responsibility of the auth service. The migration defines the column type and nullability; it does not implement hashing.

## 7. Integration with Product Roadmap

This feature sits on the critical path:

```
00 (monorepo) → 03 (auth-database-schema) → 05 (auth-service) → 06 (auth-client-package) → 07 (api-scaffolding) → ...
```

Delay to this feature cascades to the entire auth and API layer. It is a Wave 1 deliverable and should be completed before any Wave 2 work begins.

## 8. Scope Boundaries

### In Scope
- Migration files for: `users`, `oidc_clients`, `refresh_tokens`, `sessions`
- Indexes as specified in Feature 03 context
- Seed data for four pre-registered OIDC clients
- Down migrations for all tables
- Migration tooling configuration within `packages/auth-database/`

### Out of Scope
- Product database schema (Feature 04)
- Auth service application code (Feature 05)
- Terraform provisioning of the Postgres instance (Feature 02)
- ORM model definitions
- Any application-level logic
