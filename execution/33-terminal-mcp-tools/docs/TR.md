# TR — Technical Requirements
# Feature 33: Terminal MCP Tools

**Date:** 2026-03-03
**Phase:** Phase 3 — Consumers (UI, Terminal, Integration)

---

## 1. Architecture Overview

Feature 33 is a **client-side configuration and library package** within the Nx monorepo. It has no server-side component, no API server, and no database. Its responsibilities are:

1. Provide configuration files that register the Mastra MCP server with Claude Code and Claw
2. Implement the token provider bridge between Feature 32 (terminal auth) and Feature 22 (API client)
3. Define tool wrappers that call `@iexcel/api-client` methods and format their output for conversational display
4. Handle errors and surface them in a terminal-friendly format

### 1.1 Data Flow

```
Terminal user (Claude Code / Claw)
         |
         | MCP tool call + Authorization: Bearer <token>
         v
Mastra MCP Server (Feature 21 — apps/mastra/)
         |
         | Forwards user token to API layer
         v
API Layer (Features 07-17 — apps/api/)
         |
         v
PostgreSQL + External Services (Asana, Grain, Google Docs)
```

Feature 33 sits entirely to the left of this diagram — it is responsible for the tool call construction and the Authorization header, nothing downstream.

### 1.2 Key Architectural Decision: Where Tool Logic Lives

There are two valid implementation strategies for MCP tools:

**Option A: Mastra-registered tools (server-side, Feature 21)**
- The 10 tool definitions are registered on the Mastra instance in `apps/mastra/`
- Feature 33 provides only the MCP configuration files and token passthrough
- Tool logic (input validation, API calls, output formatting) lives in Mastra

**Option B: Client-side tool package (Feature 33)**
- Feature 33 defines tool schemas, input validation, and output formatting
- These definitions are shipped as a library that can be referenced by any MCP-capable client

**Decision:** The tool business logic (what the tool does) is implemented in the Mastra MCP server (Feature 21). Feature 33 provides:
- The MCP client configuration files (pointing to the Feature 21 server)
- The token provider that injects the user's token into MCP requests
- A `packages/terminal-tools/` library for any terminal-specific utilities (formatters, error messages, config loading)

This aligns with the architecture decision in the context.md: "The terminal MCP tools are client-side wrappers that connect to Mastra's MCP server. They do not implement business logic — they pass parameters to MCP tool calls which route through the API."

---

## 2. Package Structure

### 2.1 New Package: `packages/terminal-tools/`

```
packages/terminal-tools/
├── src/
│   ├── auth/
│   │   └── terminal-token-provider.ts    # Adapts Feature 32 getValidAccessToken()
│   ├── config/
│   │   └── env.ts                        # Environment variable loading (MASTRA_MCP_URL etc.)
│   ├── formatters/
│   │   ├── task-formatter.ts             # Task table Markdown formatting
│   │   ├── agenda-formatter.ts           # Agenda section formatting
│   │   ├── client-formatter.ts           # Client list and status formatting
│   │   └── index.ts
│   ├── errors/
│   │   └── error-handler.ts              # ApiClientError to user message conversion
│   └── index.ts                          # Public exports
├── .mcp.json                             # Claude Code MCP server registration
├── claw.config.json                      # Claw MCP server registration (format TBD)
├── README.md                             # Setup instructions for both clients
├── package.json
├── project.json
└── tsconfig.json
```

### 2.2 Root MCP Config

`.mcp.json` must be placed (or symlinked) at the monorepo root for Claude Code to discover it automatically when the project is opened. The `packages/terminal-tools/.mcp.json` is the source of truth; the root `.mcp.json` is a copy or symlink.

---

## 3. Terminal Token Provider

### 3.1 Implementation

```typescript
// packages/terminal-tools/src/auth/terminal-token-provider.ts

import { getValidAccessToken } from '@iexcel/terminal-auth';
import type { TokenProvider } from '@iexcel/api-client';

export function createTerminalTokenProvider(): TokenProvider {
  return {
    async getAccessToken(): Promise<string> {
      return getValidAccessToken({ interactive: true });
    },
    async refreshAccessToken(): Promise<string> {
      // getValidAccessToken handles refresh internally.
      // Calling it again forces re-evaluation of token validity.
      return getValidAccessToken({ interactive: true });
    },
  };
}
```

### 3.2 Usage in Tool Context

For any utility that makes direct API calls (e.g., in formatters that need to resolve client names):

```typescript
import { createApiClient } from '@iexcel/api-client';
import { createTerminalTokenProvider } from './auth/terminal-token-provider';
import { env } from './config/env';

const apiClient = createApiClient({
  baseUrl: env.API_BASE_URL,
  tokenProvider: createTerminalTokenProvider(),
});
```

Note: In the primary implementation (Option A from section 1.2), the API client is constructed on the Mastra server side. The terminal token provider above is used only if Feature 33 implements any direct API calls for utilities like client name resolution lookups.

---

## 4. MCP Configuration Files

### 4.1 Claude Code `.mcp.json`

Claude Code supports MCP server registration via a JSON configuration file. The format as of Claude Code's current MCP support:

```json
{
  "mcpServers": {
    "iexcel-mastra": {
      "type": "sse",
      "url": "http://localhost:8081/mcp/sse"
    }
  }
}
```

**Note on token injection:** Claude Code's MCP HTTP transport may support custom headers via a different mechanism. The implementation team must verify Claude Code's current MCP spec:

- If Claude Code supports a `headers` field: inject `Authorization` statically (only suitable for development where a long-lived token is acceptable — not recommended for production)
- If Claude Code supports a `command`-type server (stdio): provide a wrapper script that sets the Authorization header dynamically by reading `~/.iexcel/auth/tokens.json`
- If Claude Code's HTTP SSE transport forwards all environment variables: set `MASTRA_AUTH_TOKEN` as an env variable read by the MCP server

**Recommended approach for production:** Use the `command`-type MCP server if supported by Claude Code, with a Node.js wrapper script at `packages/terminal-tools/bin/mcp-proxy.js` that:
1. Reads the token from `~/.iexcel/auth/tokens.json` via `getValidAccessToken()`
2. Starts an MCP proxy that adds the `Authorization` header to all requests forwarded to the Mastra MCP server
3. Triggers the device flow if no valid token exists

```json
{
  "mcpServers": {
    "iexcel-mastra": {
      "type": "command",
      "command": "node",
      "args": ["./packages/terminal-tools/bin/mcp-proxy.js"],
      "env": {
        "MASTRA_MCP_URL": "http://localhost:8081/mcp"
      }
    }
  }
}
```

### 4.2 Claw Configuration

Claw's MCP support format must be confirmed. Feature 33 must:
1. Verify whether Claw supports MCP natively or REST only (see Open Questions in terminal-prd.md)
2. If MCP native: provide the appropriate config file
3. If REST only: document the REST endpoint equivalents and how to configure them in Claw

### 4.3 Environment-Specific URLs

| Environment | MASTRA_MCP_URL |
|---|---|
| Local development | `http://localhost:8081/mcp` |
| Dev cloud | `https://mastra.dev.iexcel.app/mcp` |
| Staging | `https://mastra.staging.iexcel.app/mcp` |
| Production | Not directly accessible from terminal — route through public API or VPN |

**Note:** The Mastra service context.md does not expose a public domain. In production, terminal users may need to use the public API REST fallback or a VPN. The MCP URL for production should be determined before Feature 33 is finalised.

---

## 5. Dependencies and Integration Points

### 5.1 Feature 32 Integration (`@iexcel/terminal-auth`)

Feature 32 exports:
```typescript
export { login } from './commands/login';
export { logout } from './commands/logout';
export { getValidAccessToken } from './auth/token-manager';
export { AuthRequiredError } from './errors';
export type { StoredTokensWithProfile } from './types';
```

Feature 33 consumes only `getValidAccessToken` and `AuthRequiredError`. It does not call `login` or `logout` directly (those are CLI commands, not tool utilities).

### 5.2 Feature 22 Integration (`@iexcel/api-client`)

Feature 33 uses the `TokenProvider` interface from `@iexcel/api-client`:
```typescript
interface TokenProvider {
  getAccessToken(): Promise<string>;
  refreshAccessToken(): Promise<string>;
}
```

The terminal token provider (section 3.1) implements this interface.

### 5.3 Feature 21 Integration (Mastra MCP Server)

The Mastra MCP server (Feature 21) exposes the following MCP endpoint structure. Feature 33 connects to it:

| Endpoint type | URL pattern |
|---|---|
| SSE transport | `http://{host}:8081/mcp/sse` |
| HTTP transport | `http://{host}:8081/mcp` |

The Mastra runtime (Feature 18) confirms that the server listens on port `8081`. The MCP configuration must target this port.

### 5.4 Feature 18 Integration (Mastra Runtime)

From Feature 18's FRS, section FR-43:
> For requests that originate from MCP tool calls (feature 21), the calling user's token must be forwarded to the API instead of the service token. The runtime must support constructing an api-client instance with a user-scoped token provider.

This confirms that Feature 33 only needs to pass the token to the MCP server. Mastra's runtime handles the forwarding to the API.

---

## 6. Tool Input Schema Definitions

Tool input schemas use Zod for validation. These schemas are used in any terminal-side validation layer (e.g., the MCP proxy script) before forwarding to the Mastra server.

```typescript
import { z } from 'zod';

// Shared validators
const shortTaskId = z.string().regex(/^TSK-\d{3,4}$/, "Use format TSK-0042");
const shortAgendaId = z.string().regex(/^AGD-\d{3,4}$/, "Use format AGD-0015");
const clientIdentifier = z.string().min(1, "Client name or ID is required");

export const GetAgendaInput = z.object({
  client: clientIdentifier,
});

export const GetTasksInput = z.object({
  client: clientIdentifier,
  status: z.enum(['draft', 'approved', 'rejected', 'completed']).optional(),
});

export const TriggerIntakeInput = z.object({
  client: clientIdentifier,
  transcript_source: z.string().optional(),
  date: z.string().optional(),
});

export const TriggerAgendaInput = z.object({
  client: clientIdentifier,
  cycle_start: z.string().optional(),
  cycle_end: z.string().optional(),
});

export const GetClientStatusInput = z.object({
  client: clientIdentifier,
});

export const EditTaskInput = z.object({
  id: shortTaskId,
  description: z.string().optional(),
  assignee: z.string().optional(),
  estimated_time: z.string()
    .regex(/^\d+h \d{2}m$/, "Use format '1h 30m' or '0h 45m'")
    .optional(),
  workspace: z.string().optional(),
}).refine(
  (data) => data.description || data.assignee || data.estimated_time || data.workspace,
  { message: "Specify at least one field to update (description, assignee, estimated_time, workspace)." }
);

export const RejectTaskInput = z.object({
  id: shortTaskId,
  reason: z.string().optional(),
});

export const ApproveTasksInput = z.object({
  ids: z.union([shortTaskId, z.array(shortTaskId)]),
});

export const GetTranscriptInput = z.object({
  client: clientIdentifier,
  date: z.string().optional(),
});
```

---

## 7. Error Handling Implementation

### 7.1 Error Handler

```typescript
// packages/terminal-tools/src/errors/error-handler.ts

import { ApiClientError } from '@iexcel/api-client';
import { AuthRequiredError } from '@iexcel/terminal-auth';

export function formatToolError(error: unknown): string {
  if (error instanceof AuthRequiredError) {
    return 'Authentication required. Run `iexcel login` to authenticate.';
  }

  if (error instanceof ApiClientError) {
    switch (error.code) {
      case 'NOT_FOUND':
        return `Resource not found. ${error.message}`;
      case 'FORBIDDEN':
        return "You don't have permission to access this resource. Contact your administrator.";
      case 'UNAUTHORIZED':
        return 'Your session has expired. Please authenticate: run `iexcel login`.';
      case 'TASK_NOT_APPROVABLE':
        return `Task cannot be approved or rejected in its current status. ${error.message}`;
      case 'NETWORK_ERROR':
        return 'Could not reach the iExcel API. Check your network connection and try again.';
      default:
        return `An unexpected error occurred. ${error.message}`;
    }
  }

  if (error instanceof Error) {
    if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
      return `Cannot connect to the iExcel Mastra server. Ensure the server is running.`;
    }
    return `An unexpected error occurred: ${error.message}`;
  }

  return 'An unexpected error occurred.';
}
```

### 7.2 Error Wrapping in Tools

Every tool handler must wrap its execution in a try/catch and route all errors through `formatToolError`:

```typescript
async function handleGetAgenda(input: GetAgendaInput): Promise<string> {
  try {
    const result = await callMcpTool('get_agenda', input);
    return formatAgendaOutput(result);
  } catch (error) {
    return formatToolError(error);
  }
}
```

---

## 8. Nx Project Configuration

### 8.1 `project.json` Targets

```json
{
  "name": "terminal-tools",
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/packages/terminal-tools",
        "tsConfig": "packages/terminal-tools/tsconfig.json",
        "main": "packages/terminal-tools/src/index.ts"
      }
    },
    "type-check": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsc --noEmit",
        "cwd": "packages/terminal-tools"
      }
    },
    "lint": {
      "executor": "@nx/eslint:lint",
      "options": {
        "lintFilePatterns": ["packages/terminal-tools/**/*.ts"]
      }
    }
  },
  "tags": ["scope:terminal", "type:lib"]
}
```

### 8.2 Nx Dependency Declarations

The `project.json` must declare implicit dependencies on:
- `terminal-auth` (Feature 32)
- `api-client` (Feature 22)
- `shared-types` (Feature 01)

### 8.3 Affected Graph Behaviour

When `terminal-tools` changes, Nx's affected graph must flag it for rebuild and test. Because it is a library (not a deployable app), it has no Dockerfile and does not trigger a container build.

---

## 9. Testing Strategy

### 9.1 Unit Tests

Each tool formatter and error handler must have unit tests covering:
- Happy path output formatting
- Truncation at length limits
- Error message mapping for all `ApiClientError` codes

Test files: `packages/terminal-tools/src/**/*.spec.ts`

### 9.2 Integration Tests

Integration tests against a running Mastra MCP server (Feature 21) and API (Feature 07+) should be run in the dev environment CI pass. These tests:
- Authenticate using a test account's device flow token
- Call each MCP tool with valid inputs
- Assert the response format and content

Integration tests are marked with a `[integration]` tag and excluded from the unit test suite.

### 9.3 Mock Strategy

For unit tests, mock `@iexcel/api-client` using `jest.mock()` or `vitest`'s mock utilities. The `TokenProvider` can be mocked with a static token provider that returns a fixed test token.

---

## 10. Security Requirements

### 10.1 Token Storage

Feature 33 does not write to or manage `~/.iexcel/auth/tokens.json`. All token storage is handled by Feature 32. Feature 33 only reads via `getValidAccessToken()`.

### 10.2 No Token Logging

The terminal token provider must never log the access token value. Any log statements must redact the token:
```typescript
logger.debug('Token retrieved', { tokenLength: token.length, hasToken: !!token });
// NOT: logger.debug('Token:', token)
```

### 10.3 No Hardcoded Tokens

No tokens, API keys, or credentials of any kind may appear in configuration files committed to the repository. The `.mcp.json` file must use environment variable references, not literal values.

### 10.4 MCP Config File Scope

The `.mcp.json` configuration at the monorepo root is for **developer use only**. It must not be deployed to any server. It is a local tool configuration file consumed by Claude Code on developer machines.

---

## 11. Open Technical Questions

These questions must be resolved during implementation:

| Question | Impact | Resolution path |
|---|---|---|
| Does Claude Code support dynamic token injection in `.mcp.json`? | Determines whether a proxy script is needed | Test with current Claude Code MCP docs |
| Does Claw support MCP natively? | Determines whether Claw gets MCP config or REST fallback setup | Check Claw documentation / contact maintainer |
| What is the Mastra MCP transport protocol? SSE or HTTP streaming? | Determines URL format in config | Confirm with Feature 21 implementer |
| Is the Mastra MCP server accessible externally (public URL) in production? | Determines whether terminal can be used in production | Confirm with Feature 36 (Terraform) — Mastra has no public domain defined yet |
| What workflow polling interval should tools use? | Affects UX for long workflows | Default 5 seconds; make configurable |

---

## 12. Performance Considerations

### 12.1 Workflow Polling

`trigger_intake` and `trigger_agenda` poll the workflow status endpoint. Use a progressive polling interval:
- 0-30s: poll every 3 seconds
- 30-120s: poll every 5 seconds
- After 120s: timeout and return guidance message

### 12.2 Token Provider Concurrency

If multiple tool calls are made simultaneously (unlikely in terminal use but possible), the concurrent refresh mutex in Feature 32 (`getValidAccessToken`) prevents duplicate token refresh requests. Feature 33 does not need its own concurrency management.

---

## 13. Migration and Rollout

Feature 33 is a new package — no migration from existing code is needed. Rollout steps:
1. Ship `packages/terminal-tools/` with the configuration and library code
2. Copy or symlink `.mcp.json` to the monorepo root
3. Document setup in `packages/terminal-tools/README.md`
4. Announce to account managers and developers with setup instructions

---

## 14. Downstream Consumer Notes

Feature 33 is a leaf node — no other feature depends on it. However, the following future capabilities would extend it:
- Additional MCP tools if the API layer adds new endpoints
- REST API fallback package for environments without MCP support
- Ad-hoc task creation tool (currently out of scope)
