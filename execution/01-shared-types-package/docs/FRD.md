# Feature Requirement Document
# Feature 01: shared-types-package

## 1. Overview

### 1.1 Feature Summary

The `packages/shared-types` package is the root dependency of the iExcel automation system's Nx monorepo. It provides a single, canonical set of TypeScript type definitions that are shared across every application in the system: `apps/api`, `apps/mastra`, `apps/ui`, and `apps/auth`. Every downstream feature that handles tasks, agendas, transcripts, clients, authentication, or API contracts imports from this package.

### 1.2 Phase

Phase 0 — Monorepo and Tooling (Wave 1). This feature is a direct prerequisite for 14 downstream features and must be completed immediately after feature 00 (Nx Monorepo Scaffolding).

### 1.3 Business Objectives

- **Eliminate type drift.** Without a shared package, each application would define its own versions of `Task`, `Agenda`, and `Transcript`. These definitions would diverge over time and introduce silent data contract bugs across service boundaries.
- **Enforce the external_ref pattern.** The system is designed to integrate with multiple project management tools (Asana today, potentially Monday.com or Jira in the future). Centralizing the `ExternalRef` type ensures that this extensibility decision is encoded once and respected everywhere.
- **Accelerate downstream development.** Every subsequent feature (04 through 38) that touches business entities can import types immediately without redefining them.
- **Single change, full visibility.** When a type changes (e.g., a new field on `NormalizedTask`), the Nx dependency graph surfaces all affected downstream packages and applications automatically, enabling targeted rebuilds and preventing partial deployments.

### 1.4 Target Users (Internal — Development Team)

This package has no end users. Its consumers are developers and the applications they build:

| Consumer | How It Uses shared-types |
|---|---|
| `apps/api` | Types for request/response bodies, entity records returned from Postgres, business logic inputs/outputs |
| `apps/mastra` | NormalizedTranscript (input to agents), NormalizedTask (output from agents), API contract types for calling back to the API |
| `apps/ui` | Display types for tasks, agendas, clients; API response shapes for rendering |
| `packages/api-client` | Request and response types for every typed API call |
| `packages/auth-client` | OIDC token claim types, user identity types |

### 1.5 Success Metrics

| Metric | Target |
|---|---|
| Zero type-definition duplication | No application defines its own version of Task, Agenda, Transcript, Client, or auth claim types |
| Full TypeScript strict-mode compatibility | All types compile under `"strict": true` with no errors |
| Zero runtime code | Package exports only TypeScript type and interface definitions — no JavaScript functions, classes, or values that could cause bundle size impact |
| All downstream consumers import successfully | Features 04, 08, 12, 19, 20, and 22 (the direct dependents) can resolve all imports from `@iexcel/shared-types` without type errors |
| Barrel export completeness | All public types are reachable from the single `index.ts` re-export |

### 1.6 Business Constraints

- **Types only, no runtime code.** This package must not export any functions, classes, constants, or values. It is a pure type definition package. The moment runtime code enters this package, it will be bundled into every consumer and create unintended coupling.
- **No ORM models.** Database ORM entity types (Prisma/Drizzle generated types) belong in `packages/database` and `packages/auth-database`, not here. This package reflects the API and agent contract shapes, not the database row shapes.
- **No API client implementation.** The typed API client (feature 22, `packages/api-client`) is a separate package. `shared-types` only defines the shapes of requests and responses.
- **Blocked by feature 00.** The Nx monorepo structure (including `tsconfig.base.json` path aliases and `project.json` configuration) must exist before this package can be properly integrated.

### 1.7 Integration with Product Roadmap

This package is the single highest-leverage foundation investment. Its completion unblocks the following critical path:

```
01 (shared-types) → 04 (product-database-schema) → 07 (api-scaffolding) → 11/12 (task/output endpoints) → ...
                 → 08 (input-normalizer-text) → 10 (transcript-endpoints) → 17 (workflow-orchestration)
                 → 22 (api-client-package) → 25-31 (all UI features)
                 → 19/20 (Mastra workflow agents)
```

Every sprint of meaningful product work depends on this package existing and being correct.

---

## 2. Scope

### 2.1 In Scope

| File | Responsibility |
|---|---|
| `src/task.ts` | `ShortId` branded type, `TaskStatus` enum, `TaskSource` enum, `TaskPriority` enum, `ExternalRef` interface, `TaskDescription` interface, `NormalizedTask` interface, `TaskVersion` interface, `CreateTaskRequest` type, `UpdateTaskRequest` type |
| `src/agenda.ts` | `AgendaShortId` branded type, `AgendaStatus` enum, `Agenda` interface, `AgendaVersion` interface, `CreateAgendaRequest` type, `UpdateAgendaRequest` type |
| `src/client.ts` | `EmailRecipient` type, `EmailRecipients` type, `Client` interface, `AsanaWorkspace` interface, `UpdateClientRequest` type |
| `src/auth.ts` | `UserRole` enum, `OidcTokenClaims` interface, `UserIdentity` interface, `ProductUser` interface |
| `src/transcript.ts` | `TranscriptSource` type, `MeetingType` enum, `TranscriptSegment` interface, `NormalizedTranscript` interface |
| `src/api.ts` | `ApiErrorCode` enum, `ApiError` interface, `ApiErrorResponse` interface, `PaginationParams` interface, `PaginatedResponse` generic, all endpoint-specific request/response types |
| `src/index.ts` | Barrel re-export of all public types from all modules |

### 2.2 Out of Scope

- No runtime functions, utilities, or helpers (those belong in application code)
- No ORM entity types (belong in `packages/database`)
- No API client methods or fetch wrappers (belong in `packages/api-client`, feature 22)
- No auth middleware or token validation logic (belong in `packages/auth-client`, feature 06)
- No test files (types are verified by the TypeScript compiler directly)
- No database migration types (belong in `packages/database`, feature 04)

---

## 3. Dependencies

| Direction | Feature | Reason |
|---|---|---|
| Blocked by | 00 — nx-monorepo-scaffolding | `packages/shared-types/` directory and `project.json` must exist; `tsconfig.base.json` must define the `@iexcel/shared-types` path alias |
| Blocks | 04 — product-database-schema | Database migration types will reference entity shapes |
| Blocks | 08 — input-normalizer-text | `NormalizedTranscript` type is this feature's output contract |
| Blocks | 12 — output-normalizer-asana | `NormalizedTask` and `ExternalRef` types are the normalizer's contract |
| Blocks | 19 — workflow-a-intake-agent | Mastra intake agent uses `NormalizedTranscript` and `NormalizedTask` |
| Blocks | 20 — workflow-b-agenda-agent | Mastra agenda agent uses `Agenda` and `NormalizedTask` |
| Blocks | 22 — api-client-package | API client is fully typed against `shared-types` request/response shapes |

---

## 4. Open Questions

| Question | Impact | Owner |
|---|---|---|
| Should `NormalizedTask.estimatedTime` be typed as a string (ISO 8601 duration), number (minutes), or a structured object? | Affects how Mastra agents express estimated time and how the API stores/returns it | Architecture |
| Should `AgendaStatus` include an `archived` state for soft-deleted agendas? | Affects agenda lifecycle type completeness | Product |
| Should `ProductUser` include a `clientIds` array (which clients the user can access) or is that computed at runtime by the API? | If in the type, it appears in API responses; if not, consumers must fetch it separately | API design |
| Does `NormalizedTranscript` need a `language` field for future multi-language support? | Adding later is a breaking change for all consumers | Architecture |
