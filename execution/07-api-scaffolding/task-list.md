# Task List
# Feature 07: API Scaffolding (`apps/api`)

**Phase:** Phase 2 — Core API & Data Pipeline
**Date:** 2026-03-03
**Blocked by:** Features 00 (Nx monorepo), 04 (product database schema), 06 (auth-client package)
**Blocks:** Features 08, 09, 10, 11, 12, 14, 15, 16, 22

---

## Pre-Conditions

Before starting any task, confirm:
- [ ] Feature 00 is merged: `apps/api/` directory exists with stub `project.json` and `Dockerfile`
- [ ] Feature 04 is merged: `packages/database/` has migration files and exports `schema.ts` from `packages/database/src/schema.ts`
- [ ] Feature 06 is merged: `packages/auth-client/` exports `@iexcel/auth-client/validation`
- [ ] Local PostgreSQL is running (via Docker Compose or local install) for development testing

---

## Phase 1: Project Setup

- [ ] **T01** — Install production dependencies in `apps/api/package.json`: `fastify@^5`, `@fastify/cors@^10`, `@fastify/helmet@^12`, `zod@^3.23`, `drizzle-orm@^0.36`, `postgres@^3.4`, `pino@^9`, `@iexcel/auth-client`, `@iexcel/shared-types`
  - Complexity: Small
  - References: TR.md §4.2

- [ ] **T02** — Install dev dependencies: `drizzle-kit`, `pino-pretty`, `tsx`, `vitest@^2`, `@vitest/coverage-v8`, `msw@^2`
  - Complexity: Small
  - References: TR.md §4.2

- [ ] **T03** — Write `apps/api/project.json` with Nx targets: `build`, `serve`, `lint`, `test`, `type-check` and `implicitDependencies: ["auth-client", "database"]`
  - Complexity: Small
  - References: TR.md §4.1

- [ ] **T04** — Write `apps/api/tsconfig.json`, `tsconfig.app.json`, and `tsconfig.spec.json` extending workspace `tsconfig.base.json`
  - Complexity: Small
  - References: TR.md §5

- [ ] **T05** — Verify `tsconfig.base.json` path aliases include `@iexcel/database/*` pointing to `packages/database/src/*`. Add if missing (coordinate with Feature 04 team).
  - Complexity: Small
  - References: TR.md §11, Feature 00 TR §3.2

---

## Phase 2: Configuration and Error Foundation

- [ ] **T06** — Create `src/config/env.ts` with Zod env schema and `loadConfig()` function. Includes all 9 environment variables with types, defaults, and required/optional flags.
  - Complexity: Small
  - References: FRS.md §9, TR.md §6

- [ ] **T07** — Create `.env.example` at `apps/api/.env.example` with all required variables and placeholder values. No real secrets.
  - Complexity: Small
  - References: FRS.md §9

- [ ] **T08** — Create `src/errors/api-errors.ts` with the full `ApiError` class hierarchy: `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ValidationError`, `InvalidJsonError`, `ConflictError`, `UnprocessableError`, `BadGatewayError`
  - Complexity: Small
  - References: FRS.md §2.9, TR.md §8
  - Verification: Each class has the correct `code`, default `message`, and `statusCode`.

---

## Phase 3: Database Client

- [ ] **T09** — Create `src/db/client.ts` with `createDbClient()` and `getDb()` using `drizzle-orm/postgres-js` and the `postgres` driver. Import schema from `@iexcel/database/schema`.
  - Complexity: Medium
  - References: FRS.md §5, TR.md §11
  - Verification: TypeScript compiles without error referencing `users` table from schema.

- [ ] **T10** — Create `src/db/health.ts` with `checkDatabaseHealth()` that runs `SELECT 1` with a 2-second timeout.
  - Complexity: Small
  - References: FRS.md §3, TR.md §16.3
  - Verification: Returns `true` when DB is reachable, `false` on timeout or connection error.

---

## Phase 4: Middleware

- [ ] **T11** — Create `src/types/request.d.ts` to augment `FastifyRequest` with `tokenClaims: TokenClaims` and `user: RequestUser`. Define the `RequestUser` interface.
  - Complexity: Small
  - References: FRS.md §2.6, TR.md §15

- [ ] **T12** — Create `src/middleware/authenticate.ts` implementing `buildAuthMiddleware(validator)`. Extracts Bearer token, calls `validator.validateToken()`, attaches `req.tokenClaims`. Maps `TokenValidationError` to `UnauthorizedError`.
  - Complexity: Medium
  - References: FRS.md §2.5, TR.md §9
  - Verification: Throws `UnauthorizedError` for missing header, malformed header, expired token, wrong issuer, wrong audience.

- [ ] **T13** — Create `src/middleware/load-user.ts` implementing `buildUserLoader(db)`. Looks up user by `auth_user_id`, performs JIT provisioning if not found, updates email/name if changed. Sets `req.user`.
  - Complexity: Medium
  - References: FRS.md §2.6, TR.md §10
  - Note: Wrap the select-then-insert in a transaction to prevent race conditions on concurrent first-login.
  - Verification: JIT-provisioned user has `role = 'team_member'`. Existing user role is NOT reset.

- [ ] **T14** — Create `src/middleware/validate.ts` implementing the `validate({ body?, query?, params? })` factory. Runs Zod `safeParse`, throws `ValidationError` with issue details on failure, assigns parsed values to request.
  - Complexity: Small
  - References: FRS.md §2.7, TR.md (implied by §4.2 Zod dependency)
  - Verification: Downstream features can use `validate({ body: SomeZodSchema })` without additional setup.

- [ ] **T15** — Create `src/middleware/rate-limit.ts` as a pass-through stub with `// TODO(feature-XX): Replace with real rate limiting` comment.
  - Complexity: Small
  - References: FRS.md §2.4

- [ ] **T16** — Create `src/middleware/require-role.ts` implementing `requireRole(...roles)` factory. Throws `ForbiddenError` if `req.user.role` is not in the allowed list. Admin always passes.
  - Complexity: Small
  - References: FRS.md §8, TR.md §14
  - Verification: `requireRole('account_manager')` allows admin and account_manager; denies team_member.

- [ ] **T17** — Create `src/middleware/error-handler.ts` implementing the Fastify error handler. Maps `ApiError`, `ZodError`, Fastify 400 body parse errors, and unknown errors to the standard response envelope. Conditionally includes stack trace in development.
  - Complexity: Medium
  - References: FRS.md §2.9, TR.md §12
  - Verification: In production mode, `500` responses contain no stack trace. Error is logged server-side.

---

## Phase 5: Response Helpers

- [ ] **T18** — Create `src/helpers/response.ts` with `sendSuccess<T>()` and `sendPaginated<T>()`. Both produce consistent response shapes.
  - Complexity: Small
  - References: FRS.md §7, TR.md §13

---

## Phase 6: Routes

- [ ] **T19** — Create `src/routes/health.ts` implementing `GET /health`. Returns `{ status, timestamp, version, checks: { database } }`. Returns `200` if database healthy, `503` otherwise.
  - Complexity: Small
  - References: FRS.md §3, TR.md §16.1
  - Verification: Accessible without auth. Returns correct structure.

- [ ] **T20** — Create `src/routes/me.ts` implementing `GET /me`. Returns `req.user` via `sendSuccess()`. Protected route.
  - Complexity: Small
  - References: FRS.md §4, TR.md §16.2

---

## Phase 7: Application Factory and Entry Point

- [ ] **T21** — Create `src/app.ts` with `createApp(deps: AppDeps)` factory. Registers: `@fastify/cors`, `@fastify/helmet`, health route (public), protected route group with authenticate + loadUser hooks, me route, error handler, 404 handler.
  - Complexity: Medium
  - References: FRS.md §2, TR.md §7
  - Verification: Application creates without error. All middleware registered in correct order per FRS.md §2 chain.

- [ ] **T22** — Create `src/main.ts` entry point. Calls `loadConfig()`, `createDbClient()`, `createTokenValidator()`, `createApp()`. Verifies database on startup (exit 1 if fails). Starts server. Registers `SIGTERM`/`SIGINT` handlers with 10-second force-exit timer.
  - Complexity: Medium
  - References: FRS.md §1, TR.md §17
  - Verification: `NODE_ENV=development pnpm exec nx serve api` starts without error. `GET /health` returns 200.

---

## Phase 8: Tests

- [ ] **T23** — Create `test/setup.ts`. Generate an RSA or EC test key pair using Node.js `crypto`. Use `msw` to intercept JWKS requests and return the test public key. Export a `createTestApp()` helper that creates the app with mocked dependencies.
  - Complexity: Medium
  - References: TR.md §18.1
  - Note: Key generation must use `crypto.generateKeyPairSync` or equivalent; key must match the algorithm configured in `createTokenValidator`.

- [ ] **T24** — Write `test/health.test.ts`. Scenarios: DB healthy returns 200, DB unhealthy returns 503, no auth needed, health check times out returns 503.
  - Complexity: Small
  - References: GS.md "Feature: Health Check"

- [ ] **T25** — Write `test/auth.test.ts`. Scenarios: missing header, malformed header (not Bearer), expired token, wrong audience, wrong issuer, wrong signing key, valid token passes.
  - Complexity: Medium
  - References: GS.md "Feature: OIDC Token Validation"

- [ ] **T26** — Write `test/me.test.ts`. Scenarios: existing user returned, JIT provisioning on first request, email sync on mismatch.
  - Complexity: Medium
  - References: GS.md "Feature: User Profile Loading and Just-in-Time Provisioning"

- [ ] **T27** — Write `test/error-handler.test.ts`. Scenarios: known ApiError maps to correct HTTP status, unknown error maps to 500, no stack trace in production, stack trace present in development, ZodError returns 400 with details.
  - Complexity: Small
  - References: GS.md "Feature: Error Handling"

- [ ] **T28** — Write `test/validation.test.ts`. Scenarios: valid body passes, invalid body returns 400 with Zod details, missing required field returns 400, malformed JSON returns 400.
  - Complexity: Small
  - References: GS.md "Feature: Request Validation"

- [ ] **T29** — Run full test suite and confirm coverage >= 85%:
  ```
  pnpm exec nx test api --coverage
  ```
  - Complexity: Small
  - References: TR.md §18.3

---

## Phase 9: Dockerfile and Nx Integration

- [ ] **T30** — Fill out `apps/api/Dockerfile` with multi-stage build: `deps` stage installs only relevant packages via `pnpm install --filter @iexcel/api...`, `build` stage runs `nx build api --configuration=production`, `production` stage uses `node:22-alpine` with compiled output only.
  - Complexity: Medium
  - References: TR.md §19

- [ ] **T31** — Verify Nx build succeeds: `pnpm exec nx build api --configuration=production`
  - Complexity: Small

- [ ] **T32** — Verify Nx lint passes: `pnpm exec nx lint api`
  - Complexity: Small

- [ ] **T33** — Verify type-check passes: `pnpm exec nx type-check api`
  - Complexity: Small

---

## Phase 10: Integration Smoke Test

- [ ] **T34** — Start the API locally against a real development database with a valid `.env` file:
  ```
  pnpm exec nx serve api
  ```
  Confirm:
  - [ ] `GET /health` returns `{ "status": "ok", "checks": { "database": "ok" } }`
  - [ ] `GET /me` without token returns `401 UNAUTHORIZED`
  - [ ] `GET /me` with a valid token returns the user profile
  - [ ] `GET /does-not-exist` returns `404 NOT_FOUND`
  - Complexity: Medium

- [ ] **T35** — Confirm graceful shutdown: send `SIGTERM` to the running process, verify it logs "Shutdown complete" and exits 0 within 15 seconds.
  - Complexity: Small

---

## Phase 11: Documentation and Downstream Prep

- [ ] **T36** — Update `apps/api/README.md` (create if absent) with: environment variable reference table, local development setup instructions (`pnpm exec nx serve api`), and how downstream features register new routes (Fastify plugin pattern).
  - Complexity: Small

- [ ] **T37** — Confirm with Feature 04 team that `packages/database/src/schema.ts` exists and exports the Drizzle schema. Confirm the `@iexcel/database/schema` path alias resolves correctly.
  - Complexity: Small
  - Verification: `import { users } from '@iexcel/database/schema'` compiles without error in `apps/api/`.

- [ ] **T38** — Post a brief summary in the team channel (or PR description) listing the extension points for downstream features:
  - How to register a new Fastify plugin in `createApp()` (protected vs public)
  - How to use `requireRole()` in a route
  - How to use `validate({ body: Schema })` in a route
  - How to throw `ApiError` subclasses from route handlers
  - Complexity: Small

---

## Definition of Done

- [ ] All 38 tasks above are complete and checked off.
- [ ] `nx run-many --target=build,lint,test,type-check --projects=api` passes with no errors.
- [ ] Test coverage >= 85%.
- [ ] `GET /health` returns `200` against a real development database.
- [ ] `GET /me` returns `401` without a token and `200` with a valid token.
- [ ] The PR description documents all extension points for Features 08–16.
- [ ] No `.env` files with real secrets are committed.
