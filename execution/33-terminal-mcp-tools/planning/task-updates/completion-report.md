# Feature 33: Terminal MCP Tools — Completion Report

**Date:** 2026-03-05
**Status:** Implementation Complete (Phases 1-8)

---

## Summary

Created `packages/terminal-tools/` — a new Nx library package that provides terminal-side utilities for connecting Claude Code and Claw to the Mastra MCP server (Feature 21). The package includes auth bridging, output formatters, input schema validation, error handling, and MCP configuration.

---

## Completed Phases

### Phase 1: Package Scaffolding
- Created `packages/terminal-tools/` with full Nx library structure
- `package.json` with dependencies on `@iexcel/terminal-auth`, `@iexcel/api-client`, `@iexcel/shared-types`, `zod`
- `project.json` with `build`, `lint`, `test`, `type-check` targets; tags `scope:terminal`, `type:library`; implicit dependencies declared
- `tsconfig.json`, `tsconfig.lib.json`, `vitest.config.ts`
- Added `@iexcel/terminal-tools` path alias to root `tsconfig.base.json`

### Phase 2: Environment Config and Token Provider
- `src/config/env.ts` — Loads `MASTRA_MCP_URL`, `API_BASE_URL`, `IEXCEL_AUTH_ISSUER_URL` with sensible defaults
- `src/auth/terminal-token-provider.ts` — `createTerminalTokenProvider()` wrapping `getValidAccessToken({ interactive: true })` into the `TokenProvider` interface
- Unit tests: 4 tests (delegation, refresh, error propagation, instance isolation)

### Phase 3: Output Formatters
- `src/formatters/task-formatter.ts` — `formatTaskTable()` with 60-char description truncation, ISO 8601 duration parsing
- `src/formatters/agenda-formatter.ts` — `formatAgenda()` with Markdown heading parsing, 500-char section truncation
- `src/formatters/client-formatter.ts` — `formatClientList()` and `formatClientStatus()`
- `src/formatters/transcript-formatter.ts` — `truncateTranscript()` at 2000 chars with UI fallback URL
- Unit tests: 28 tests covering all formatters, truncation boundaries, empty states

### Phase 4: Error Handler
- `src/errors/error-handler.ts` — `formatToolError()` mapping `ApiClientError` codes, `AuthRequiredError`, ECONNREFUSED, and generic errors to user-friendly messages
- Uses the `ApiErrorCode` enum from `@iexcel/shared-types` for type-safe error code matching
- Unit tests: 17 tests covering all error code mappings

### Phase 5: Input Schema Validation
- `src/schemas.ts` — Zod schemas for all 10 tool inputs: `GetAgendaInput`, `GetTasksInput`, `TriggerIntakeInput`, `TriggerAgendaInput`, `GetClientStatusInput`, `GetTranscriptInput`, `EditTaskInput` (with refinement), `RejectTaskInput`, `ApproveTasksInput`
- Short ID validators: `TSK-\d{3,}` and `AGD-\d{3,}` (3+ digits, uncapped)
- `EditTaskInput` refine: rejects when no editable fields provided
- `ApproveTasksInput`: accepts single string or array of short IDs
- Unit tests: 41 tests covering valid/invalid inputs, refinements, edge cases

### Phase 6: MCP Configuration Files
- `.mcp.json` at monorepo root — Claude Code MCP config using `command` type pointing to proxy script
- `packages/terminal-tools/bin/mcp-proxy.js` — stdio-to-HTTP bridge that:
  - Reads token via `getValidAccessToken()` at startup and before each request
  - Adds `Authorization: Bearer <token>` header to all forwarded MCP requests
  - Triggers device flow if no valid session exists
  - Handles ECONNREFUSED and network errors gracefully
- Claw: documented REST fallback approach in README (pending Claw MCP support confirmation)

### Phase 7: Public API Barrel Export
- `src/index.ts` — Exports all public APIs: `createTerminalTokenProvider`, `env`, all formatters, `formatToolError`, all schemas and types

### Phase 8: Documentation
- `packages/terminal-tools/README.md` — Setup steps for Claude Code and Claw, tool list, environment variables, troubleshooting

---

## Test Results

- **90 tests passing** across 7 test files
- All formatter, error handler, schema, and auth tests green
- Test runner: vitest (direct invocation from package directory)

---

## Type Check

- Zero type errors in `packages/terminal-tools/src/` code
- Pre-existing `exactOptionalPropertyTypes` issue in `packages/api-client/src/core/http.ts` causes 2 errors when type-checking with that flag enabled (not introduced by this feature)

---

## Files Created

```
packages/terminal-tools/
  package.json
  project.json
  tsconfig.json
  tsconfig.lib.json
  vitest.config.ts
  README.md
  bin/mcp-proxy.js
  src/index.ts
  src/schemas.ts
  src/auth/terminal-token-provider.ts
  src/config/env.ts
  src/errors/error-handler.ts
  src/formatters/index.ts
  src/formatters/task-formatter.ts
  src/formatters/agenda-formatter.ts
  src/formatters/client-formatter.ts
  src/formatters/transcript-formatter.ts
  __tests__/schemas.spec.ts
  __tests__/auth/terminal-token-provider.spec.ts
  __tests__/errors/error-handler.spec.ts
  __tests__/formatters/task-formatter.spec.ts
  __tests__/formatters/agenda-formatter.spec.ts
  __tests__/formatters/client-formatter.spec.ts
  __tests__/formatters/transcript-formatter.spec.ts

.mcp.json                            (monorepo root — Claude Code config)
tsconfig.base.json                   (modified — added @iexcel/terminal-tools path)
```

---

## Open Items (Integration Testing)

Phase 9 tasks (end-to-end smoke tests) require a running Mastra MCP server (Feature 21) and API, which are not available in isolation. These tasks should be verified during integration testing:

- AC-01: Claude Code connects and discovers all 10 tools
- AC-02: Claw connects (pending Claw MCP confirmation)
- AC-03: Authorization header attached to every tool call
- AC-04: Silent token refresh works transparently
- AC-05: Short IDs accepted by all tools
- AC-06: Batch approval works
- AC-07: Formatted readable output
- AC-08: Error formatting (no raw JSON)
- AC-09: Full post-intake review session end-to-end

---

## Spike Resolutions

1. **Claude Code MCP configuration:** Uses `command` type with a Node.js proxy script (`bin/mcp-proxy.js`). This enables dynamic token injection without hardcoding tokens in config.

2. **Claw MCP support:** Deferred — documented REST fallback using `@iexcel/api-client` with `createTerminalTokenProvider()`.

3. **Mastra MCP transport:** Configured for HTTP transport at `http://localhost:8081/mcp`. The proxy script communicates via JSON-RPC over HTTP POST.
