# Task List — Feature 33: Terminal MCP Tools

**Date:** 2026-03-03
**Phase:** Phase 3 — Consumers (UI, Terminal, Integration)
**Blocked by:** Feature 21 (Mastra MCP server), Feature 32 (terminal-device-auth), Feature 22 (api-client)

---

## Pre-Work: Resolve Open Questions

- [ ] **Spike: Claude Code MCP configuration format** — Determine whether Claude Code supports dynamic token injection in `.mcp.json` (e.g., via a `command` type server or env variable headers). Document the finding and chosen approach. *(Small — 2-4 hours)* (References: TR.md Section 4.1, TR.md Section 11)

- [ ] **Spike: Claw MCP support** — Determine whether Claw supports MCP natively or requires REST-only access. If MCP is supported, identify the config file format. If REST only, document the required fallback approach. *(Small — 1-2 hours)* (References: TR.md Section 4.2, FRS.md Section 2.2)

- [ ] **Confirm: Mastra MCP transport protocol** — With the Feature 21 implementer, confirm whether the Mastra MCP server uses SSE transport or HTTP streaming, and the exact URL pattern (`/mcp`, `/mcp/sse`, etc.). Update TR.md Section 4.1 with confirmed URL. *(Small — 1 hour)* (References: TR.md Section 5.3)

---

## Phase 1: Package Scaffolding

- [ ] **Create `packages/terminal-tools/` Nx library** — Run `nx generate @nx/js:library terminal-tools --directory=packages/terminal-tools --importPath=@iexcel/terminal-tools`. Verify `project.json`, `tsconfig.json`, and `package.json` are created. *(Small)* (References: FRS.md Section 10, TR.md Section 8)

- [ ] **Configure `package.json` dependencies** — Add `@iexcel/terminal-auth`, `@iexcel/api-client`, `@iexcel/shared-types`, and `zod` as dependencies in `packages/terminal-tools/package.json`. *(Small)* (References: FRS.md Section 10.2)

- [ ] **Configure `project.json` targets and tags** — Set `build`, `type-check`, and `lint` targets. Add tags `scope:terminal`, `type:lib`. Declare implicit dependencies on `terminal-auth`, `api-client`, `shared-types`. *(Small)* (References: TR.md Section 8.1, TR.md Section 8.2)

- [ ] **Create source directory structure** — Create directories: `src/auth/`, `src/config/`, `src/formatters/`, `src/errors/`. Create empty `src/index.ts`. *(Small)* (References: TR.md Section 2.1)

---

## Phase 2: Environment Config and Token Provider

- [ ] **Implement `src/config/env.ts`** — Load and validate `MASTRA_MCP_URL`, `API_BASE_URL` (for any direct API calls), `IEXCEL_AUTH_ISSUER_URL`. Export a typed `env` object. Throw a descriptive error if required variables are missing. *(Small)* (References: FRS.md Section 2.3, TR.md Section 2.1)

- [ ] **Implement `src/auth/terminal-token-provider.ts`** — Wrap `getValidAccessToken({ interactive: true })` from `@iexcel/terminal-auth` into the `TokenProvider` interface from `@iexcel/api-client`. Export `createTerminalTokenProvider()`. *(Small)* (References: FRS.md Section 3, TR.md Section 3)

- [ ] **Write unit tests for terminal token provider** — Test that `getAccessToken()` delegates to `getValidAccessToken`. Test that `AuthRequiredError` propagates correctly. Mock `@iexcel/terminal-auth`. *(Small)* (References: TR.md Section 9.1)

---

## Phase 3: Output Formatters

- [ ] **Implement `src/formatters/task-formatter.ts`** — Format a `NormalizedTask[]` array as a Markdown table with columns: Short ID, Description (truncated at 60 chars), Estimated Time, Status. Export `formatTaskTable()`. *(Small)* (References: FRS.md Section 6.1)

- [ ] **Implement `src/formatters/agenda-formatter.ts`** — Format an `Agenda` object as structured text with section headings. Apply 500-character per-section truncation with UI fallback URL note. Export `formatAgenda()`. *(Small)* (References: FRS.md Section 6.2)

- [ ] **Implement `src/formatters/client-formatter.ts`** — Format a `Client[]` as a Markdown table and format a `ClientStatusResponse` as key-value text. Export `formatClientList()` and `formatClientStatus()`. *(Small)* (References: FRS.md Section 6.3, Section 6.4)

- [ ] **Implement transcript truncation utility** — Truncate transcript text at 2000 characters and append `[Transcript truncated. Full version at {UI_URL}]`. Export `truncateTranscript()`. *(Small)* (References: FRS.md Section 6.5)

- [ ] **Write unit tests for all formatters** — Test truncation at exact limits. Test that Markdown table structure is correct. Test all section headings in agenda formatter. *(Small)* (References: TR.md Section 9.1)

---

## Phase 4: Error Handler

- [ ] **Implement `src/errors/error-handler.ts`** — Map all `ApiClientError` codes to user-facing messages. Handle `AuthRequiredError`. Handle network connection errors (ECONNREFUSED). Export `formatToolError(error: unknown): string`. *(Small)* (References: FRS.md Section 7, TR.md Section 7)

- [ ] **Write unit tests for error handler** — Test each `ApiClientError` code mapping. Test `AuthRequiredError`. Test generic error fallback. Test ECONNREFUSED detection. *(Small)* (References: FRS.md Section 7.1, TR.md Section 9.1)

---

## Phase 5: Input Schema Validation

- [ ] **Implement Zod input schemas in `src/schemas.ts`** — Define schemas for all 10 tools: `GetAgendaInput`, `GetTasksInput`, `TriggerIntakeInput`, `TriggerAgendaInput`, `GetClientStatusInput`, `EditTaskInput` (with refinement), `RejectTaskInput`, `ApproveTasksInput`, `GetTranscriptInput`. Export all. *(Medium)* (References: TR.md Section 6, FRS.md Section 8.1)

- [ ] **Write unit tests for input schemas** — Test valid inputs pass. Test invalid short IDs are rejected. Test `EditTaskInput` refinement (no fields = error). Test `ApproveTasksInput` with string and array inputs. *(Small)* (References: GS.md Feature: edit_task, Feature: reject_task, Feature: approve_tasks)

---

## Phase 6: MCP Configuration Files

- [ ] **Implement MCP proxy script (if required by spike result)** — If dynamic token injection requires a command-type MCP server, implement `packages/terminal-tools/bin/mcp-proxy.js`. The script must: read token via `getValidAccessToken()`, start an MCP proxy that adds `Authorization` header to all forwarded requests to `MASTRA_MCP_URL`, and trigger device flow if no token exists. *(Medium — only if spike determines proxy is needed)* (References: TR.md Section 4.1)

- [ ] **Create `.mcp.json` for Claude Code** — Based on spike results, create the Claude Code MCP configuration file. Use the confirmed transport type and URL format. Reference `MASTRA_MCP_URL` via environment variable or proxy script. *(Small)* (References: FRS.md Section 2.1, TR.md Section 4.1)

- [ ] **Create Claw config** — Based on spike results, either create `claw.config.json` for MCP registration or document REST fallback endpoints. *(Small)* (References: FRS.md Section 2.2, TR.md Section 4.2)

- [ ] **Copy or symlink `.mcp.json` to monorepo root** — Ensure Claude Code discovers the config when the project root is opened. Add a note in the root README about MCP configuration. *(Small)* (References: TR.md Section 2.2)

---

## Phase 7: Public API Barrel Export

- [ ] **Populate `src/index.ts`** — Export public API: `createTerminalTokenProvider`, `formatToolError`, all formatters, all input schemas, `env`. *(Small)* (References: FRS.md Section 10.3)

---

## Phase 8: Documentation

- [ ] **Write `packages/terminal-tools/README.md`** — Include: prerequisites (Feature 32 auth setup), Claude Code setup steps (copy config, set env vars), Claw setup steps, list of available MCP tools with descriptions, troubleshooting section (server unreachable, token expired, Claw MCP support). *(Small)* (References: FRS.md Section 2.4, FRD.md Section 5)

---

## Phase 9: Integration Verification

- [ ] **End-to-end smoke test: Claude Code session** — In a running dev environment with Feature 21 (Mastra MCP server), Feature 32 (auth), and API running: authenticate via device flow, open Claude Code, verify all 10 tools appear in the tool list, call `list_clients`, call `get_client_status` for a real client. *(Medium)* (References: GS.md Feature: MCP Configuration and Authentication, AC-01, AC-02)

- [ ] **End-to-end smoke test: full post-intake session** — Trigger intake for a test client, edit a draft task, batch approve the remaining tasks, verify state in the API. *(Medium)* (References: GS.md Feature: Full Session Integration, AC-09)

- [ ] **Verify token passthrough** — Call an MCP tool and inspect the Mastra MCP server logs to confirm the `Authorization` header contains the user token (not the service token). *(Small)* (References: FRS.md Section 4, GS.md Scenario: Access token is attached to every MCP tool call, AC-03)

- [ ] **Verify silent token refresh** — Manually expire the access token (set `expires_at` to the past in `~/.iexcel/auth/tokens.json`), call an MCP tool, verify the tool succeeds after silent refresh without prompting the user. *(Small)* (References: GS.md Scenario: Token is transparently refreshed when expired, AC-04)

- [ ] **Verify short ID acceptance** — Call `edit_task`, `reject_task`, and `approve_tasks` using short IDs (`TSK-####`). Verify the API receives and resolves them correctly. *(Small)* (References: GS.md Feature: edit_task, AC-05)

- [ ] **Verify batch approval** — Call `approve_tasks(ids=["TSK-0042", "TSK-0043"])` and verify both tasks are approved in a single API call. *(Small)* (References: GS.md Feature: approve_tasks, AC-06)

- [ ] **Verify error formatting** — Call a tool with a non-existent client name. Verify the error message is human-readable, no raw JSON is shown. *(Small)* (References: GS.md Feature: Error Handling, AC-08)

---

## Completion Checklist

- [ ] All unit tests pass (`nx test terminal-tools`)
- [ ] Type check passes (`nx type-check terminal-tools`)
- [ ] Lint passes (`nx lint terminal-tools`)
- [ ] `.mcp.json` is at the monorepo root and Claude Code discovers the MCP server
- [ ] All 10 tools are callable from Claude Code and Claw (or Claw REST documented if MCP not supported)
- [ ] README is complete with setup instructions for both clients
- [ ] All acceptance criteria (AC-01 through AC-09) verified
- [ ] No tokens or credentials in committed config files
