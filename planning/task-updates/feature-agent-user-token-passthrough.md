# Task Update: Agent Tool User Token Passthrough

## Summary

Updated all Mastra agent tools to support user token passthrough so agents can make API calls as the authenticated user rather than always using the service account. This mirrors the pattern already established in the MCP tools.

## Changes Made

### `apps/mastra/src/tools/ingest-tools.ts`
- Added imports for `ToolExecutionContext`, `extractToken`, and `createUserApiClient`
- Updated `apiFetch` helper to accept an optional `userToken?: string | null` parameter; falls back to `getServiceToken()` when no user token is present
- Updated all seven tool `execute` functions to accept `context: ToolExecutionContext` as a second parameter and extract the user token via `extractToken(context)`:
  - `ingestTranscript` — uses `createUserApiClient(userToken)` when token present, falls back to `getApiClient()`
  - `checkSessionStatus`, `listRecordings`, `importFromUrl`, `checkIntegrationStatus`, `connectPlatform`, `importRecordings` — pass `userToken` to `apiFetch`
- Fixed pre-existing TS4111 errors: replaced dot-notation property access on `Record<string, unknown>` values with bracket notation throughout the file

### `apps/mastra/src/tools/client-tools.ts`
- Added imports for `ToolExecutionContext`, `extractToken`, and `createUserApiClient`
- Updated `listClients` execute to accept `context` and resolve the API client based on user token presence
- Removed pre-existing `any` type on the `response.data.map` callback, replacing it with the explicit inline type `{ id: string; name: string }`

### `apps/mastra/src/tools/task-tools.ts`
- Added imports for `ToolExecutionContext`, `GetTasksRequest`, `extractToken`, and `createUserApiClient`
- Updated all five tools (`saveTasksTool`, `createDraftTasks`, `getTask`, `listTasksForClient`, `getReconciledTasksTool`) to accept `context` and use a user-scoped API client when a token is available
- Replaced `any` cast on `createDraftTasks` task map callback with the inferred type `(typeof input.tasks)[number]`
- Used `GetTasksRequest['status']` for the status cast in `listTasksForClient` instead of the `any` that was there

### `apps/mastra/src/tools/transcript-tools.ts`
- Added imports for `ToolExecutionContext`, `extractToken`, and `createUserApiClient`
- Updated both `getTranscript` and `listTranscriptsForClient` execute functions to accept context and use user-scoped API client

### `apps/mastra/src/tools/workflow-tools.ts`
- Added imports for `ToolExecutionContext`, `extractToken`, and `createUserApiClient`
- Updated `updateWorkflowStatusTool` execute to accept context and use user-scoped API client when available; falls back to service client (used in workflow-triggered invocations that have no user context)

### `apps/mastra/src/tools/agenda-tools.ts`
- Added imports for `ToolExecutionContext`, `extractToken`, and `createUserApiClient`
- Updated both `saveDraftAgendaTool` and `getAgenda` execute functions to accept context and use user-scoped API client

### `apps/mastra/src/prompts/intake-instructions.ts`
- Added `## AUTHENTICATION` section at the top of `CAPABILITIES` block documenting the device token behavior for agent memory storage

## Pattern Applied

All tool execute functions now follow this consistent pattern:

```typescript
execute: async (input, context: ToolExecutionContext) => {
  const userToken = extractToken(context);
  const apiClient = userToken ? createUserApiClient(userToken) : getApiClient();
  // ... rest of implementation
}
```

For `ingest-tools.ts` tools that use `apiFetch` instead of an API client directly, the user token is passed as a fourth argument to `apiFetch` which handles the fallback to `getServiceToken()`.

## Notes for Code Reviewer

- The MCP tools in `src/mcp-tools/` were not changed — they already implement this pattern correctly
- `workflow-tools.ts` (`updateWorkflowStatus`) intentionally keeps the service token fallback since workflow-triggered invocations will not carry user context
- Pre-existing TS4111 errors in `apps/mastra/src/agents/intake-agent.ts` remain; they are outside the scope of this task and existed before these changes
- All modified files pass TypeScript compilation and ESLint with zero errors
