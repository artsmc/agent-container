# Task List
# Feature 18: Mastra Runtime Setup

## Prerequisites

- [ ] Feature 00 (nx-monorepo-scaffolding) is complete — `apps/mastra/` directory and skeleton `project.json` exist in the Nx monorepo
- [ ] Feature 01 (shared-types-package) is complete — `@iexcel/shared-types` is importable via path alias
- [ ] Feature 06 (auth-client-package) is complete — `@iexcel/auth-client` provides `createClientCredentialsHelper` or equivalent
- [ ] The Mastra framework has been evaluated for containerization compatibility (spike recommended before Phase 1)

---

## Phase 0: Containerization Spike (Do First)

- [ ] **0.1** Install `mastra` and `@mastra/core` at latest stable in a throwaway branch or local sandbox. Run `mastra dev` and confirm the development server starts. Record the version numbers (`mastra@X.Y.Z`, `@mastra/core@X.Y.Z`).
  References: TR.md — Section 10.1

- [ ] **0.2** Run `mastra build` and examine the output. Confirm the output directory path (expected: `.mastra/` or a configurable path). Confirm the output is a runnable Node.js entrypoint. Record findings.
  References: TR.md — Section 10.1

- [ ] **0.3** Run the `mastra build` output inside a bare Docker container (`FROM node:22-alpine`). Confirm the server starts without errors and the health endpoint responds. Record any volume or filesystem requirements.
  References: TR.md — Section 10.1

- [ ] **0.4** Confirm that Mastra's server port can be overridden to `8081` via the `server.port` constructor option.
  References: TR.md — Section 10.1, FRS.md — FR-21

- [ ] **0.5** Confirm the correct package name and import path for the OTLP observability exporter (expected: `@mastra/otel-exporter`). If a different package is needed, record it.
  References: TR.md — Section 10.1

- [ ] **0.6** Write a brief spike summary note in `apps/mastra/SPIKE.md` documenting: Mastra version, build output path, container compatibility status, volume requirements, port override mechanism, and OTLP package name. This note guides the rest of the implementation.

---

## Phase 1: Package Configuration

- [ ] **1.1** Create `apps/mastra/package.json` with name `@iexcel/mastra`, `"type": "module"`, scripts (`dev`, `build`, `start`), and all dependencies listed in TR.md Section 2.2. Pin `mastra` and `@mastra/core` to the version confirmed in the spike.
  References: FRS.md — FR-02, TR.md — Section 2.2

- [ ] **1.2** Create `apps/mastra/tsconfig.json` extending `../../tsconfig.base.json` with `module: "ES2022"`, `moduleResolution: "bundler"`, strict settings, `outDir`, and `rootDir`.
  References: TR.md — Section 2.3

- [ ] **1.3** Update `apps/mastra/project.json` with the `build`, `serve`, `type-check`, and `lint` targets, tags `["scope:mastra", "type:app"]`, and `implicitDependencies` for `shared-types`, `auth-client`, and `api-client`. Adjust `build` and `serve` commands based on spike findings.
  References: FRS.md — FR-100, FR-101, FR-102, TR.md — Section 2.1

- [ ] **1.4** Create the source directory tree: `apps/mastra/src/agents/`, `apps/mastra/src/tools/`, `apps/mastra/src/auth/`, `apps/mastra/src/config/`. Create empty `index.ts` barrel files in `agents/` and `tools/`.
  References: FRS.md — FR-01

- [ ] **1.5** Run `nx run mastra:type-check` and confirm it fails only due to missing source files (no configuration errors). If it errors on configuration, fix the tsconfig before proceeding.

---

## Phase 2: Environment Configuration

- [ ] **2.1** Create `apps/mastra/src/config/env.ts`. Import `zod`. Define the `envSchema` with all required and optional variables as specified in TR.md Section 3.1. Use `z.object`, `z.string().url()`, `z.enum(['openai', 'anthropic'])`, `z.coerce.number().default(8081)`.
  References: FRS.md — FR-10, FR-11, TR.md — Section 3.1

- [ ] **2.2** Add the `safeParse` call, the startup error handler (log missing fields + `process.exit(1)`), and the `export const env` export. Ensure error messages name the specific missing variable(s) without exposing values.
  References: FRS.md — FR-12, TR.md — Section 6.1

- [ ] **2.3** Add the LLM provider API key injection logic immediately after `env` is validated:
  ```typescript
  if (env.LLM_PROVIDER === 'openai') process.env.OPENAI_API_KEY = env.LLM_API_KEY;
  else if (env.LLM_PROVIDER === 'anthropic') process.env.ANTHROPIC_API_KEY = env.LLM_API_KEY;
  ```
  This must be at module level so it runs on import, before any Agent is constructed.
  References: FRS.md — FR-32, TR.md — Section 1.3

- [ ] **2.4** Verify: Write a test that sets all required env vars and imports `env.ts`. Confirm `env.API_BASE_URL`, `env.LLM_MODEL`, etc. are the expected values. Verify that removing a required var causes `process.exit(1)` to be called (mock `process.exit` in the test).

---

## Phase 3: Service Token Manager

- [ ] **3.1** Create `apps/mastra/src/auth/service-token.ts`. Import the client credentials helper from `@iexcel/auth-client`. Define the `ServiceTokenManagerOptions` interface and the `ServiceTokenManager` class.
  References: FRS.md — FR-40, TR.md — Section 3.2

- [ ] **3.2** Implement the `initialize()` method: call `fetchAndCacheToken()` up to 3 times with a 5-second delay between attempts. Throw after all retries fail. Log each failure with attempt number.
  References: FRS.md — FR-41, TR.md — Section 3.2

- [ ] **3.3** Implement the `getToken()` method: check `isExpiringSoon()`. If true and no refresh is in progress, start `refreshToken()` and store the promise in `refreshInProgress`. If the token is still valid (not yet expired), return the cached token immediately without waiting. If already expired, await the refresh.
  References: FRS.md — FR-40, TR.md — Section 3.2

- [ ] **3.4** Implement the `refreshToken()` method with exponential backoff (1s, 2s, 4s for 3 attempts). Log `warn`-level on each failure. Throw a typed error after all retries are exhausted.
  References: FRS.md — FR-40, TR.md — Section 3.2 (FR-112)

- [ ] **3.5** Implement `fetchAndCacheToken()`: call `this.helper.fetchToken()`, store `accessToken` in `this.cachedToken`, compute and store `this.tokenExpiry = Date.now() + expiresIn * 1000`. Return the token.
  References: TR.md — Section 3.2

- [ ] **3.6** Verify: Write a unit test that mocks the auth-client helper. Test that:
  - `initialize()` succeeds on first attempt
  - `initialize()` retries 3 times and throws on persistent failure
  - `getToken()` returns cached token without a network call
  - `getToken()` triggers refresh when token is within 60 seconds of expiry
  - Concurrent `getToken()` calls during a refresh share the same promise (single network call)

---

## Phase 4: Placeholder Tool Definitions

- [ ] **4.1** Install `zod` in `apps/mastra/package.json` (v4+). Confirm it is importable.

- [ ] **4.2** Create `apps/mastra/src/tools/task-tools.ts`. Define and export `createDraftTasks`, `getTask`, and `listTasksForClient` using Mastra's `createTool()`. Each tool must have: `id`, `description`, `inputSchema` (zod), `outputSchema` (zod), and `execute` that throws `'This tool is not yet implemented. See feature 19/20.'`.
  References: FRS.md — FR-70, FR-71, TR.md — Section 3.5

- [ ] **4.3** Create `apps/mastra/src/tools/transcript-tools.ts`. Define and export `getTranscript` and `listTranscriptsForClient` with the same placeholder pattern.
  References: FRS.md — FR-72

- [ ] **4.4** Create `apps/mastra/src/tools/agenda-tools.ts`. Define and export `createDraftAgenda` and `getAgenda` with the same placeholder pattern.
  References: FRS.md — FR-73

- [ ] **4.5** Create `apps/mastra/src/tools/index.ts` that re-exports all tools from all three tool files.
  References: FRS.md — FR-74

- [ ] **4.6** Verify: Run `nx run mastra:type-check`. Confirm all tool files compile without TypeScript errors. Confirm the `execute` functions use the correct Mastra tool signature.

---

## Phase 5: Placeholder Agent Definitions

- [ ] **5.1** Create `apps/mastra/src/agents/intake-agent.ts`. Import `Agent` from `@mastra/core/agent`, import `env` from `../config/env.js`, import the transcript and task tools. Instantiate and export `intakeAgent` with `id: 'intake-agent'`, `name: 'Intake Agent'`, placeholder instructions, `model: env.LLM_MODEL`, and the tool references.
  References: FRS.md — FR-60, TR.md — Section 3.3

- [ ] **5.2** Create `apps/mastra/src/agents/agenda-agent.ts`. Import `Agent`, `env`, and the task and agenda tools. Instantiate and export `agendaAgent` with `id: 'agenda-agent'`, `name: 'Agenda Agent'`, placeholder instructions, `model: env.LLM_MODEL`, and the tool references.
  References: FRS.md — FR-61, TR.md — Section 3.4

- [ ] **5.3** Create `apps/mastra/src/agents/index.ts` exporting both agents:
  ```typescript
  export { intakeAgent } from './intake-agent.js';
  export { agendaAgent } from './agenda-agent.js';
  ```
  References: FRS.md — FR-62

- [ ] **5.4** Verify: Run `nx run mastra:type-check`. Confirm agent files compile without errors. Confirm `intakeAgent.id === 'intake-agent'` and `agendaAgent.id === 'agenda-agent'` in a smoke test.

---

## Phase 6: API Client Wiring

- [ ] **6.1** Confirm that `packages/api-client/` (feature 22) is available. If not yet implemented, create a stub `createApiClient` function locally in `apps/mastra/src/api-client-stub.ts` that accepts `{ baseUrl, getAccessToken }` and returns an object with no-op methods. Document clearly that this stub is replaced when feature 22 ships.

- [ ] **6.2** In `apps/mastra/src/index.ts` (or a dedicated `src/api-client.ts`), import `createApiClient` from `@iexcel/api-client` (or the stub). Instantiate the service api-client with `baseUrl: env.API_BASE_URL` and `getAccessToken: () => serviceTokenManager.getToken()`. Export as `apiClient`.
  References: FRS.md — FR-50, TR.md — Section 1.3

- [ ] **6.3** Update the tool files in `src/tools/` to accept or import the `apiClient` instance. The tool `execute` functions remain as placeholders (throw not-implemented), but their signatures should reference the api-client parameter pattern that features 19 and 20 will replace.
  References: FRS.md — FR-51

- [ ] **6.4** Document in `src/tools/task-tools.ts` and other tool files with a comment explaining how to wire in real api-client calls:
  ```typescript
  // When implementing in feature 19, replace the execute body with:
  // return apiClient.tasks.createDraftTasks(input.clientId, input.tasks);
  ```

---

## Phase 7: Mastra Instance and Server

- [ ] **7.1** Create `apps/mastra/src/index.ts` as the main entrypoint. Import in the correct order (env first, then provider key injection, then ServiceTokenManager, then apiClient, then agents). See TR.md Section 1.3 for the exact initialization sequence.
  References: TR.md — Section 1.3

- [ ] **7.2** Instantiate `ServiceTokenManager` with `env.AUTH_ISSUER_URL`, `env.MASTRA_CLIENT_ID`, `env.MASTRA_CLIENT_SECRET`. Call `await serviceTokenManager.initialize()` before constructing the Mastra instance.
  References: FRS.md — FR-41, TR.md — Section 1.3

- [ ] **7.3** Import `PinoLogger` from `@mastra/core` (confirm import path from installed package). Configure with `name: env.OTEL_SERVICE_NAME ?? 'iexcel-mastra'` and `level: env.NODE_ENV === 'production' ? 'info' : 'debug'`.
  References: FRS.md — FR-80

- [ ] **7.4** Add the conditional OTLP observability configuration: if `env.OTEL_EXPORTER_OTLP_ENDPOINT` is set, construct and include the `observability` config block. If not set, omit the key entirely (no empty object).
  References: FRS.md — FR-81, TR.md — Section 8.1

- [ ] **7.5** Construct the `Mastra` instance with: `agents: { intakeAgent, agendaAgent }`, `server: { port: env.MASTRA_PORT, host: env.MASTRA_HOST }`, `logger`, and optionally `observability`. Export as `export const mastra`.
  References: FRS.md — FR-20, FR-21, FR-22, TR.md — Section 1.3

- [ ] **7.6** Verify: Run `nx run mastra:type-check`. All files must pass with zero TypeScript errors.

---

## Phase 8: Server Validation

- [ ] **8.1** Start the Mastra server locally using `nx run mastra:serve` with all required env vars set (use a `.env.local` file or export them in the shell). Confirm the server starts without errors.
  References: FRS.md — FR-100

- [ ] **8.2** Send `GET http://localhost:8081/health` and confirm:
  - Response status: `200 OK`
  - Response body contains `"status": "ok"`
  - Response body contains `"service": "iexcel-mastra"` (or similar)
  References: FRS.md — FR-90

- [ ] **8.3** Confirm `mastra.getAgent('intake-agent')` returns the `intakeAgent` instance. Confirm `mastra.getAgent('agenda-agent')` returns the `agendaAgent` instance. This can be confirmed by adding a temporary startup log or via a smoke test.
  References: FRS.md — FR-22

- [ ] **8.4** Send a `GET http://localhost:8081/health` request while the Mastra server is running with `OTEL_EXPORTER_OTLP_ENDPOINT` NOT set. Confirm no OTEL connection errors appear in the logs.
  References: FRS.md — FR-81

- [ ] **8.5** Run `nx run mastra:build` and confirm the build completes without errors and produces an output artifact. Record the output path for use in the Dockerfile (feature 35).
  References: FRS.md — FR-100

---

## Phase 9: Nx Integration Verification

- [ ] **9.1** Run `nx run mastra:lint` and fix any ESLint errors in `src/`.

- [ ] **9.2** Run `nx run mastra:type-check` and confirm zero TypeScript errors across all files.

- [ ] **9.3** Modify a file in `packages/auth-client/src/` temporarily (add a comment). Run `nx affected:list`. Confirm `mastra` appears in the affected list. Revert the change.
  References: FRS.md — FR-102, TR.md — Section 9.1

- [ ] **9.4** Modify a file in `packages/api-client/src/` temporarily. Run `nx affected:list`. Confirm `mastra` appears. Revert the change.

- [ ] **9.5** Modify a file in `packages/shared-types/src/` temporarily. Run `nx affected:list`. Confirm `mastra` appears. Revert the change.

---

## Phase 10: Documentation

- [ ] **10.1** Update `apps/mastra/SPIKE.md` (created in Phase 0) with final Mastra version, confirmed build output path, and any deviations from the spec that the spike uncovered.

- [ ] **10.2** Add JSDoc comments to `ServiceTokenManager`:
  - Class-level JSDoc explaining its role, token caching strategy, and refresh behavior
  - Method-level JSDoc for `initialize()`, `getToken()`, `refreshToken()`, `fetchAndCacheToken()`

- [ ] **10.3** Add comments to each placeholder tool file explaining what the tool will do when implemented and which feature implements it (e.g., `// Implemented in feature 19 (workflow-a-intake-agent)`).

- [ ] **10.4** Add comments to each placeholder agent file pointing to the implementing feature.

---

## Completion Criteria

This feature is complete when:

- [ ] `nx run mastra:serve` starts the Mastra server on port 8081 with no errors
- [ ] `GET /health` returns `200 OK`
- [ ] `nx run mastra:build` produces a deployable artifact
- [ ] `nx run mastra:type-check` passes with zero TypeScript errors
- [ ] `nx run mastra:lint` passes with zero errors
- [ ] Service token is obtained from the auth service on startup (integration test with real auth service)
- [ ] `mastra.getAgent('intake-agent')` and `mastra.getAgent('agenda-agent')` return their respective agent instances
- [ ] Placeholder tool `execute` functions throw the expected not-implemented error (not silent no-op)
- [ ] Mastra is marked as `affected` in Nx when `shared-types`, `auth-client`, or `api-client` change
- [ ] Spike findings are documented in `apps/mastra/SPIKE.md`
- [ ] All placeholder files have comments pointing to their implementing features
