# Execution Plan
# Feature 07: API Scaffolding (`apps/api`)

**Status:** Approved
**Date:** 2026-03-03
**Agent:** single backend developer (no sub-agent delegation)

---

## Paths

- **input_folder:** execution/07-api-scaffolding
- **planning_folder:** execution/07-api-scaffolding/planning
- **task_list_file:** execution/07-api-scaffolding/task-list.md

---

## Summary

38 tasks reorganized from 11 phases into 8 waves. Fastify v5 API server foundation with middleware chain, OIDC auth, database client, routes, tests, Docker, and Nx integration. Single agent execution — all tasks are backend TypeScript/Fastify with deep interdependency.

---

## Wave 1 — Foundation (5 tasks, parallel)

All tasks run in parallel. No dependencies between them.

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| T01 | Install prod deps in `apps/api/package.json` | Small | TR.md 4.2 |
| T02 | Install dev deps | Small | TR.md 4.2 |
| T03 | Write `project.json` with Nx targets | Small | TR.md 4.1 |
| T04 | Write `tsconfig.json`, `tsconfig.app.json`, `tsconfig.spec.json` | Small | TR.md 5 |
| T05 | Verify `tsconfig.base.json` path aliases for `@iexcel/database/*` | Small | TR.md 11 |

**Result:** Project compiles (empty).

---

## Wave 2 — Core Building Blocks (5 tasks, parallel)

All tasks run in parallel. No runtime dependencies between them.

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| T06 | Create `src/config/env.ts` — Zod env schema + `loadConfig()` | Small | FRS.md 9, TR.md 6 |
| T07 | Create `.env.example` with all required variables | Small | FRS.md 9 |
| T08 | Create `src/errors/api-errors.ts` — full ApiError hierarchy | Small | FRS.md 2.9, TR.md 8 |
| T11 | Create `src/types/request.d.ts` — augment FastifyRequest | Small | FRS.md 2.6, TR.md 15 |
| T18 | Create `src/helpers/response.ts` — `sendSuccess`, `sendPaginated` | Small | FRS.md 7, TR.md 13 |

**Depends on:** Wave 1 (project setup exists).
**Result:** Foundational types, config, and helpers exist.

---

## Wave 3 — Database + Standalone Middleware (5 tasks, parallel)

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| T09 | Create `src/db/client.ts` — Drizzle + postgres driver | Medium | FRS.md 5, TR.md 11 |
| T14 | Create `src/middleware/validate.ts` — Zod validation factory | Small | FRS.md 2.7, TR.md |
| T15 | Create `src/middleware/rate-limit.ts` — pass-through stub | Small | FRS.md 2.4 |
| T16 | Create `src/middleware/require-role.ts` — role guard | Small | FRS.md 8, TR.md 14 |
| T17 | Create `src/middleware/error-handler.ts` — global error handler | Medium | FRS.md 2.9, TR.md 12 |

**Depends on:** Wave 2 (T08 ApiError classes needed by T16, T17).
**Result:** DB client and independent middleware ready.

---

## Wave 4 — Auth Middleware + Health (3 tasks, parallel)

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| T10 | Create `src/db/health.ts` — `checkDatabaseHealth()` | Small | FRS.md 3, TR.md 16.3 |
| T12 | Create `src/middleware/authenticate.ts` — Bearer token extraction + validation | Medium | FRS.md 2.5, TR.md 9 |
| T13 | Create `src/middleware/load-user.ts` — JIT provisioning + profile sync | Medium | FRS.md 2.6, TR.md 10 |

**Depends on:** Wave 3 (T09 db client for T10, T13; T08 errors for T12).
**Result:** All middleware components exist.

---

## Wave 5 — Routes + App Factory (4 tasks, sequential)

Tasks must be sequential: routes depend on middleware, app.ts wires everything, main.ts depends on app.ts.

| Order | Task | Description | Complexity | References |
|-------|------|-------------|------------|------------|
| 1 | T19 | Create `src/routes/health.ts` — `GET /health` | Small | FRS.md 3, TR.md 16.1 |
| 2 | T20 | Create `src/routes/me.ts` — `GET /me` | Small | FRS.md 4, TR.md 16.2 |
| 3 | T21 | Create `src/app.ts` — `createApp(deps)` factory | Medium | FRS.md 2, TR.md 7 |
| 4 | T22 | Create `src/main.ts` — entry point + graceful shutdown | Medium | FRS.md 1, TR.md 17 |

**Depends on:** Wave 4 (all middleware ready).
**Result:** MILESTONE — Runnable API server.

---

## Wave 6 — Tests (7 tasks, T23 first, then parallel, T29 last)

| Order | Task | Description | Complexity | References |
|-------|------|-------------|------------|------------|
| 1 | T23 | Create `test/setup.ts` — mock JWKS, test key pair, `createTestApp()` | Medium | TR.md 18.1 |
| 2 (parallel) | T24 | Write `test/health.test.ts` | Small | GS.md "Health Check" |
| 2 (parallel) | T25 | Write `test/auth.test.ts` | Medium | GS.md "OIDC Token Validation" |
| 2 (parallel) | T26 | Write `test/me.test.ts` | Medium | GS.md "User Profile Loading" |
| 2 (parallel) | T27 | Write `test/error-handler.test.ts` | Small | GS.md "Error Handling" |
| 2 (parallel) | T28 | Write `test/validation.test.ts` | Small | GS.md "Request Validation" |
| 3 | T29 | Run full test suite, confirm >= 85% coverage | Small | TR.md 18.3 |

**Depends on:** Wave 5 (app must exist).
**Result:** 85%+ test coverage confirmed.

---

## Wave 7 — Docker + Nx Verification (4 tasks, T30 first, then parallel)

| Order | Task | Description | Complexity | References |
|-------|------|-------------|------------|------------|
| 1 | T30 | Fill out `apps/api/Dockerfile` — multi-stage build | Medium | TR.md 19 |
| 2 (parallel) | T31 | Verify `nx build api --configuration=production` | Small | — |
| 2 (parallel) | T32 | Verify `nx lint api` | Small | — |
| 2 (parallel) | T33 | Verify `nx type-check api` | Small | — |

**Depends on:** Wave 5 (app code exists).
**Note:** Waves 6 and 7 can run concurrently.
**Result:** Production build works.

---

## Wave 8 — Verification + Documentation (5 tasks, sequential)

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| T34 | Integration smoke test — live DB, all endpoints | Medium | — |
| T35 | Graceful shutdown verification — SIGTERM exits cleanly | Small | — |
| T36 | Write/update `apps/api/README.md` | Small | — |
| T37 | Confirm `@iexcel/database/schema` resolves with Feature 04 | Small | — |
| T38 | Post extension points summary for Features 08-16 | Small | — |

**Depends on:** Waves 6, 7.
**Result:** Feature complete.

---

## Dependency Graph

```
Wave 1 (Foundation)
  |
  v
Wave 2 (Building Blocks)
  |
  v
Wave 3 (DB + Middleware)
  |
  v
Wave 4 (Auth + Health)
  |
  v
Wave 5 (Routes + App) --- MILESTONE: Runnable Server
  |         |
  v         v
Wave 6    Wave 7
(Tests)   (Docker/Nx)
  |         |
  +----+----+
       |
       v
  Wave 8 (Verification + Docs)
```

---

## Key Decisions

- **Single agent execution:** All backend TypeScript/Fastify; no sub-agent split.
- **No scope changes:** All 38 original tasks preserved.
- **T11 and T18 moved to Wave 2:** They have no runtime dependencies but are needed by later waves.
- **Waves 6 + 7 concurrent:** Tests and Docker verification are independent.
