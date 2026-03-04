# Task List
# Feature 01: shared-types-package

## Prerequisites

- [ ] Feature 00 (nx-monorepo-scaffolding) is complete — the `packages/shared-types/` directory and `project.json` skeleton exist, and `tsconfig.base.json` is present at the repo root.

---

## Phase 1: Package Configuration

- [ ] **1.1** Add the `@iexcel/shared-types` path alias to the root `tsconfig.base.json` under `compilerOptions.paths`:
  ```json
  "@iexcel/shared-types": ["packages/shared-types/src/index.ts"]
  ```
  References: TR.md — Section 2.5

- [ ] **1.2** Create `packages/shared-types/package.json` with name `@iexcel/shared-types`, types pointing to `./src/index.ts`, and no runtime dependencies.
  References: TR.md — Section 2.2

- [ ] **1.3** Create `packages/shared-types/tsconfig.json` extending `../../tsconfig.base.json` with strict TypeScript settings (`strict`, `noImplicitAny`, `strictNullChecks`, `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`).
  References: TR.md — Section 2.3

- [ ] **1.4** Create `packages/shared-types/tsconfig.lib.json` extending `./tsconfig.json` with `"emitDeclarationOnly": true`, `"declaration": true`, and `"declarationMap": true`.
  References: TR.md — Section 2.4

- [ ] **1.5** Update `packages/shared-types/project.json` with the `build` target (executor: `@nx/js:tsc`) and `type-check` target (runs `tsc --noEmit`). Add tags `["scope:shared", "type:util"]`.
  References: TR.md — Section 2.1

- [ ] **1.6** Verify: Run `nx run shared-types:type-check` and confirm it succeeds (or fails only because source files do not yet exist — no configuration errors).

---

## Phase 2: Task Types (task.ts)

- [ ] **2.1** Create `packages/shared-types/src/task.ts`.
  References: FRS.md — Section 2

- [ ] **2.2** Define and export the `ShortId` branded type with JSDoc explaining the `TSK-NNNN` format.
  References: FRS.md — FR-10, TR.md — Section 3.1

- [ ] **2.3** Define and export the `TaskStatus` enum with values `draft`, `approved`, `rejected`, `pushed`. Add JSDoc explaining why `completed` is intentionally excluded (external system owns it).
  References: FRS.md — FR-11, TR.md — Section 3.1

- [ ] **2.4** Define and export the `TaskSource` enum with values `agent`, `ui`, `terminal`.
  References: FRS.md — FR-12, TR.md — Section 3.1

- [ ] **2.5** Define and export the `TaskPriority` enum with values `low`, `medium`, `high`, `critical`.
  References: FRS.md — FR-13, TR.md — Section 3.1

- [ ] **2.6** Define and export the `ExternalRef` interface with fields: `system`, `externalId`, `externalUrl`, `projectId`, `workspaceId`. Add JSDoc explaining the external_ref pattern and how it replaces Asana-specific fields.
  References: FRS.md — FR-14, TR.md — Section 3.1

- [ ] **2.7** Define and export the `TaskDescription` interface with required fields: `taskContext`, `additionalContext`, `requirements`.
  References: FRS.md — FR-15, TR.md — Section 3.1

- [ ] **2.8** Define and export the `NormalizedTask` interface. Verify: `transcriptId` is `string | null`, `estimatedTime` and `dueDate` are `string | null`, `externalRef` is `ExternalRef | null`, `tags` is `string[]`, all timestamp fields are strings.
  References: FRS.md — FR-16, TR.md — Section 3.1

- [ ] **2.9** Define and export the `TaskVersion` interface. Verify: `editedBy` is `string | null`, `source` uses `TaskSource` enum.
  References: FRS.md — FR-17, TR.md — Section 3.1

- [ ] **2.10** Define and export the `CreateTaskRequest` and `UpdateTaskRequest` interfaces. Verify: `UpdateTaskRequest.description` is `Partial<TaskDescription>`.
  References: FRS.md — FR-18, TR.md — Section 3.1

---

## Phase 3: Agenda Types (agenda.ts)

- [ ] **3.1** Create `packages/shared-types/src/agenda.ts`. Add import for `TaskSource` from `./task`.
  References: FRS.md — Section 3

- [ ] **3.2** Define and export the `AgendaShortId` branded type with a distinct brand from `ShortId`. Add JSDoc explaining the `AGD-NNNN` format.
  References: FRS.md — FR-20, TR.md — Section 3.2

- [ ] **3.3** Define and export the `AgendaStatus` enum with values: `draft`, `in_review`, `finalized`, `shared`. Verify string values use underscore (e.g., `InReview = 'in_review'`).
  References: FRS.md — FR-21, TR.md — Section 3.2

- [ ] **3.4** Define and export the `Agenda` interface. Verify: `sharedUrlToken`, `internalUrlToken`, `googleDocId`, `finalizedBy`, `finalizedAt`, `sharedAt` are all `string | null`.
  References: FRS.md — FR-22, TR.md — Section 3.2

- [ ] **3.5** Define and export the `AgendaVersion` interface. Verify: `source` uses `TaskSource` (not a new enum), `editedBy` is `string | null`.
  References: FRS.md — FR-23, TR.md — Section 3.2

- [ ] **3.6** Define and export the `CreateAgendaRequest` and `UpdateAgendaRequest` interfaces.
  References: FRS.md — FR-24, TR.md — Section 3.2

---

## Phase 4: Client Types (client.ts)

- [ ] **4.1** Create `packages/shared-types/src/client.ts`.
  References: FRS.md — Section 4

- [ ] **4.2** Define and export the `EmailRecipient` interface (fields: `name`, `email`) and the `EmailRecipients` type alias.
  References: FRS.md — FR-30, TR.md — Section 3.3

- [ ] **4.3** Define and export the `Client` interface. Verify: `grainPlaylistId`, `defaultAsanaWorkspaceId`, `defaultAsanaProjectId` are `string | null`. `emailRecipients` is `EmailRecipients` (not nullable).
  References: FRS.md — FR-31, TR.md — Section 3.3

- [ ] **4.4** Define and export the `AsanaWorkspace` interface. Add JSDoc on `accessTokenRef` clarifying it is a reference to a secret manager entry, never the actual token value.
  References: FRS.md — FR-32, TR.md — Section 3.3

- [ ] **4.5** Define and export the `UpdateClientRequest` interface with all optional fields.
  References: FRS.md — FR-33, TR.md — Section 3.3

---

## Phase 5: Auth Types (auth.ts)

- [ ] **5.1** Create `packages/shared-types/src/auth.ts`.
  References: FRS.md — Section 5

- [ ] **5.2** Define and export the `UserRole` enum with values: `admin`, `account_manager`, `team_member`. Verify string values use underscores.
  References: FRS.md — FR-40, TR.md — Section 3.4

- [ ] **5.3** Define and export the `OidcTokenClaims` interface. Verify: `iat` and `exp` are typed as `number` (Unix timestamps), not strings.
  References: FRS.md — FR-41, TR.md — Section 3.4

- [ ] **5.4** Define and export the `UserIdentity` interface with fields: `sub`, `email`, `name`.
  References: FRS.md — FR-42, TR.md — Section 3.4

- [ ] **5.5** Define and export the `ProductUser` interface. Add JSDoc on `authUserId` clarifying it corresponds to the OIDC `sub` claim.
  References: FRS.md — FR-43, TR.md — Section 3.4

---

## Phase 6: Transcript Types (transcript.ts)

- [ ] **6.1** Create `packages/shared-types/src/transcript.ts`.
  References: FRS.md — Section 6

- [ ] **6.2** Define and export the `TranscriptSource` union type as `'grain' | 'manual'`. Add JSDoc explaining it is a union (not enum) because new sources are expected in V2.
  References: FRS.md — FR-50, TR.md — Section 3.5

- [ ] **6.3** Define and export the `MeetingType` enum with values: `client_call`, `intake`, `follow_up`. Verify string values match database `call_type` ENUM values exactly.
  References: FRS.md — FR-50, TR.md — Section 3.5

- [ ] **6.4** Define and export the `TranscriptSegment` interface with fields: `speaker` (string), `timestamp` (number — seconds offset), `text` (string).
  References: FRS.md — FR-51, TR.md — Section 3.5

- [ ] **6.5** Define and export the `NormalizedTranscript` interface. Verify: `segments` is `TranscriptSegment[]`, `participants` is `string[]`, `summary` is `string | null`, `highlights` is `string[] | null`. Add JSDoc explaining this is the standard output of the input normalizer (feature 08) consumed by the Mastra intake agent (feature 19).
  References: FRS.md — FR-52, TR.md — Section 3.5

---

## Phase 7: API Contract Types (api.ts)

- [ ] **7.1** Create `packages/shared-types/src/api.ts` with `import type` statements for all types needed from other modules.
  References: FRS.md — Section 7

- [ ] **7.2** Define and export the `ApiErrorCode` enum. Verify it includes all codes from the API PRD plus the additional codes defined in FR-60 (`TASK_NOT_FOUND`, `AGENDA_NOT_FOUND`, `TRANSCRIPT_NOT_FOUND`, `VALIDATION_ERROR`, `INTERNAL_ERROR`).
  References: FRS.md — FR-60, TR.md — Section 3.6

- [ ] **7.3** Define and export the `ApiError` interface and `ApiErrorResponse` interface. Verify `ApiErrorResponse` wraps `ApiError` in an `error` field.
  References: FRS.md — FR-61, TR.md — Section 3.6

- [ ] **7.4** Define and export the `PaginationParams` interface and the generic `PaginatedResponse<T>` interface.
  References: FRS.md — FR-62, TR.md — Section 3.6

- [ ] **7.5** Define and export all task API contract types: `GetTasksRequest`, `GetTasksResponse`, `GetTaskResponse`, `ApproveTasksRequest`, `PushTasksRequest`, `BatchOperationResponse`. Verify `GetTaskResponse` includes both `task` and `versions` fields.
  References: FRS.md — FR-63, TR.md — Section 3.6

- [ ] **7.6** Define and export all agenda API contract types: `GetAgendasResponse`, `GetAgendaResponse`, `ShareAgendaResponse`, `EmailAgendaRequest`, `ExportAgendaResponse`. Verify `ShareAgendaResponse` fields are non-nullable strings.
  References: FRS.md — FR-64, TR.md — Section 3.6

- [ ] **7.7** Define and export all transcript API contract types: `SubmitTranscriptRequest`, `GetTranscriptResponse`.
  References: FRS.md — FR-65, TR.md — Section 3.6

- [ ] **7.8** Define and export all workflow API contract types: `TriggerIntakeWorkflowRequest`, `TriggerAgendaWorkflowRequest`, `WorkflowStatus` union type, `WorkflowStatusResponse`.
  References: FRS.md — FR-66, TR.md — Section 3.6

- [ ] **7.9** Define and export `GetCurrentUserResponse`.
  References: FRS.md — FR-67, TR.md — Section 3.6

---

## Phase 8: Barrel Export (index.ts)

- [ ] **8.1** Create `packages/shared-types/src/index.ts` with re-exports from all six modules:
  ```typescript
  export * from './task';
  export * from './agenda';
  export * from './client';
  export * from './auth';
  export * from './transcript';
  export * from './api';
  ```
  References: FRS.md — FR-70, TR.md — Section 3.7

- [ ] **8.2** Verify: Run `nx run shared-types:type-check`. Confirm zero TypeScript errors.

- [ ] **8.3** Verify: Confirm no duplicate export name errors — check that `TaskSource` exported from `task.ts` and re-exported in `agenda.ts` does not create a collision in `index.ts`. Resolve by removing the re-export from `agenda.ts` and having `api.ts` import directly from `./task`.

---

## Phase 9: Validation

- [ ] **9.1** Write a temporary consumer test file (e.g., `packages/shared-types/src/__test-consumer__.ts`) that imports every major type from `@iexcel/shared-types` and uses them in basic type assignments. Run `tsc --noEmit` on this file. Delete the file after validation.

- [ ] **9.2** Confirm the branded types enforce their contracts: write a test that attempts to assign a plain `string` to `ShortId` and confirm the compiler rejects it.

- [ ] **9.3** Confirm the `TaskStatus` enum does not contain `completed`: inspect the compiled output or source.

- [ ] **9.4** Confirm `ExternalRef.system` accepts arbitrary strings (not restricted to known values).

- [ ] **9.5** Run `nx run shared-types:build` and confirm the build produces `.d.ts` files in `dist/packages/shared-types/` with no `.js` runtime files.

- [ ] **9.6** Run `nx affected:build --base=main` (or equivalent for the current branch) and confirm that all downstream projects that depend on `shared-types` are marked as affected.

---

## Phase 10: Documentation

- [ ] **10.1** Add a `README.md` to `packages/shared-types/` documenting:
  - Package purpose
  - How to import (`import type { NormalizedTask } from '@iexcel/shared-types'`)
  - Module overview (what each `.ts` file contains)
  - The `external_ref` pattern explanation
  - The branded short ID types explanation
  - Breaking change policy

- [ ] **10.2** Ensure every exported interface and enum in all six source modules has a JSDoc comment explaining its purpose and any non-obvious design decisions.

---

## Completion Criteria

This feature is complete when:

- [ ] All six source modules compile with zero TypeScript errors under strict mode
- [ ] The barrel export makes all types importable via `@iexcel/shared-types`
- [ ] Zero runtime JavaScript values are exported
- [ ] The Nx `type-check` target passes
- [ ] The Nx `build` target produces only `.d.ts` files
- [ ] The downstream features 04, 08, 12, 19, 20, and 22 can import and use types from this package without errors
- [ ] All types are documented with JSDoc comments
- [ ] The `ExternalRef` pattern and branded short ID types are explained in `README.md`
