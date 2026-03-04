# TR — Technical Requirements
# Feature 18: Mastra Runtime Setup

## 1. Implementation Strategy

### 1.1 Approach

This feature establishes the `apps/mastra/` application in the Nx monorepo as a configured, running Mastra server. The implementation follows a layered initialization sequence:

1. **Environment validation** (`src/config/env.ts`) — validate and parse all env vars before any other module loads
2. **Provider key injection** — set the provider-specific API key env var (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY`)
3. **Token acquisition** (`src/auth/service-token.ts`) — obtain the OIDC service token from the auth service
4. **API client construction** — instantiate the api-client with the service token provider
5. **Agent and tool registration** — import placeholder agents and tools
6. **Mastra instance construction** (`src/index.ts`) — assemble and start the Mastra server

The implementation spike (recommended per `infra-prd.md`) should validate:
- That `mastra build` produces a Node.js-runnable output compatible with the container base image
- That Mastra's internal telemetry store works without a mounted volume (or identifies what volume it needs)
- That Mastra's server can be configured to bind on 0.0.0.0:8081

### 1.2 Technology Stack

| Concern | Tool | Notes |
|---|---|---|
| Agent framework | `mastra` + `@mastra/core` | Latest stable version |
| Language | TypeScript (ESM) | Strict mode; `"module": "ES2022"` |
| Schema validation | `zod` v4 | Used by Mastra tools for input/output schemas |
| Logger | `@mastra/core` PinoLogger | Structured JSON logs |
| Observability | `@mastra/otel-exporter` (or equivalent) | OTLP export |
| Auth helpers | `packages/auth-client/` | Client credentials flow |
| API calls | `packages/api-client/` | Typed API methods |
| Type contracts | `packages/shared-types/` | Shared type system |
| Build | `mastra build` (Mastra CLI) | Outputs to `dist/apps/mastra/` |
| Dev server | `mastra dev` (Mastra CLI) | Hot reload for development |

### 1.3 Initialization Order (Critical)

The following order must be enforced in `src/index.ts`:

```typescript
// Step 1: Validate env vars FIRST (throws on missing)
import { env } from './config/env.js';

// Step 2: Set provider API key before any Agent is instantiated
if (env.LLM_PROVIDER === 'openai') {
  process.env.OPENAI_API_KEY = env.LLM_API_KEY;
} else if (env.LLM_PROVIDER === 'anthropic') {
  process.env.ANTHROPIC_API_KEY = env.LLM_API_KEY;
}

// Step 3: Initialize token manager and obtain token
import { ServiceTokenManager } from './auth/service-token.js';
const serviceTokenManager = new ServiceTokenManager({
  issuerUrl: env.AUTH_ISSUER_URL,
  clientId: env.MASTRA_CLIENT_ID,
  clientSecret: env.MASTRA_CLIENT_SECRET,
});
await serviceTokenManager.initialize(); // throws on failure after retries

// Step 4: Construct api-client with service token provider
import { createApiClient } from '@iexcel/api-client';
export const apiClient = createApiClient({
  baseUrl: env.API_BASE_URL,
  getAccessToken: () => serviceTokenManager.getToken(),
});

// Step 5: Import agents (they reference env.LLM_MODEL — already validated)
import { intakeAgent, agendaAgent } from './agents/index.js';

// Step 6: Construct Mastra instance
export const mastra = new Mastra({
  agents: { intakeAgent, agendaAgent },
  server: {
    port: Number(process.env.MASTRA_PORT ?? 8081),
    host: process.env.MASTRA_HOST ?? '0.0.0.0',
  },
  logger: new PinoLogger({
    name: env.OTEL_SERVICE_NAME ?? 'iexcel-mastra',
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  }),
  ...(env.OTEL_EXPORTER_OTLP_ENDPOINT ? {
    observability: { /* OTLP config */ }
  } : {}),
});
```

---

## 2. File Specifications

### 2.1 apps/mastra/project.json

```json
{
  "name": "mastra",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "projectType": "application",
  "sourceRoot": "apps/mastra/src",
  "tags": ["scope:mastra", "type:app"],
  "implicitDependencies": ["shared-types", "auth-client", "api-client"],
  "targets": {
    "build": {
      "executor": "nx:run-commands",
      "outputs": ["{workspaceRoot}/dist/apps/mastra"],
      "options": {
        "command": "mastra build",
        "cwd": "apps/mastra"
      }
    },
    "serve": {
      "executor": "nx:run-commands",
      "options": {
        "command": "mastra dev",
        "cwd": "apps/mastra"
      }
    },
    "type-check": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsc --noEmit -p apps/mastra/tsconfig.json"
      }
    },
    "lint": {
      "executor": "@nx/eslint:lint",
      "options": {
        "lintFilePatterns": ["apps/mastra/src/**/*.ts"]
      }
    }
  }
}
```

Note: The exact executor for `build` and `serve` may need to change based on the containerization spike. Mastra may expose its build targets differently. Adjust after spike confirms the correct invocation.

### 2.2 apps/mastra/package.json

```json
{
  "name": "@iexcel/mastra",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "mastra dev",
    "build": "mastra build",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "mastra": "latest",
    "@mastra/core": "latest",
    "@iexcel/shared-types": "*",
    "@iexcel/auth-client": "*",
    "@iexcel/api-client": "*",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "typescript": "*",
    "@types/node": "*"
  }
}
```

Note: `"mastra": "latest"` and `"@mastra/core": "latest"` should be pinned to a specific version after the spike confirms compatibility. The spike should record the version used.

### 2.3 apps/mastra/tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ES2022",
    "moduleResolution": "bundler",
    "target": "ES2022",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "outDir": "../../dist/apps/mastra",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", ".mastra"]
}
```

---

## 3. Module Specifications

### 3.1 src/config/env.ts

```typescript
import { z } from 'zod';

const envSchema = z.object({
  API_BASE_URL: z.string().url(),
  AUTH_ISSUER_URL: z.string().url(),
  MASTRA_CLIENT_ID: z.string().min(1),
  MASTRA_CLIENT_SECRET: z.string().min(1),
  LLM_API_KEY: z.string().min(1),
  LLM_PROVIDER: z.enum(['openai', 'anthropic']),
  LLM_MODEL: z.string().min(1),
  // Optional
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_EXPORTER_OTLP_HEADERS: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().optional(),
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  MASTRA_PORT: z.coerce.number().int().positive().default(8081),
  MASTRA_HOST: z.string().default('0.0.0.0'),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const missing = result.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  console.error(`[mastra] Startup failed — invalid environment configuration:\n${missing}`);
  process.exit(1);
}

export const env = result.data;
export type Env = typeof env;
```

The `z.coerce.number()` for `MASTRA_PORT` handles the string-to-number conversion from `process.env`. The `zod` schema acts as the single source of truth for what env vars exist and what types they hold.

### 3.2 src/auth/service-token.ts

```typescript
import type { ClientCredentialsHelper } from '@iexcel/auth-client';
import { createClientCredentialsHelper } from '@iexcel/auth-client';

interface ServiceTokenManagerOptions {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
}

export class ServiceTokenManager {
  private helper: ClientCredentialsHelper;
  private cachedToken: string | null = null;
  private tokenExpiry: number | null = null;   // Unix ms
  private refreshThresholdMs = 60_000;          // Refresh 60s before expiry
  private refreshInProgress: Promise<string> | null = null;

  constructor(opts: ServiceTokenManagerOptions) {
    this.helper = createClientCredentialsHelper({
      issuerUrl: opts.issuerUrl,
      clientId: opts.clientId,
      clientSecret: opts.clientSecret,
    });
  }

  /**
   * Obtain the initial token on startup. Retries up to 3 times with
   * a 5-second delay between attempts. Throws after all retries fail.
   */
  async initialize(): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.fetchAndCacheToken();
        return;
      } catch (err) {
        console.error(`[ServiceTokenManager] Token acquisition attempt ${attempt}/3 failed:`, err);
        if (attempt < 3) {
          await delay(5_000);
        }
      }
    }
    throw new Error('[ServiceTokenManager] Failed to obtain service token after 3 attempts. Aborting startup.');
  }

  /**
   * Returns a valid, non-expired service token.
   * If a refresh is already in progress, waits for it.
   * If the token is within the refresh threshold, triggers a refresh.
   */
  async getToken(): Promise<string> {
    if (this.isExpiringSoon()) {
      if (!this.refreshInProgress) {
        this.refreshInProgress = this.refreshToken().finally(() => {
          this.refreshInProgress = null;
        });
      }
      // If we still have a valid (not yet expired) token, return it while refresh runs
      if (this.cachedToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
        return this.cachedToken;
      }
      // Token already expired — wait for the refresh to complete
      return await this.refreshInProgress;
    }
    if (!this.cachedToken) {
      throw new Error('[ServiceTokenManager] No token cached and not refreshing. Call initialize() first.');
    }
    return this.cachedToken;
  }

  private isExpiringSoon(): boolean {
    if (!this.tokenExpiry) return true;
    return Date.now() >= this.tokenExpiry - this.refreshThresholdMs;
  }

  private async refreshToken(): Promise<string> {
    const delays = [1_000, 2_000, 4_000];
    for (let attempt = 0; attempt < delays.length; attempt++) {
      try {
        return await this.fetchAndCacheToken();
      } catch (err) {
        console.warn(`[ServiceTokenManager] Token refresh attempt ${attempt + 1}/3 failed:`, err);
        if (attempt < delays.length - 1) {
          await delay(delays[attempt]);
        }
      }
    }
    throw new Error('[ServiceTokenManager] Token refresh failed after 3 attempts.');
  }

  private async fetchAndCacheToken(): Promise<string> {
    const { accessToken, expiresIn } = await this.helper.fetchToken();
    this.cachedToken = accessToken;
    // expiresIn is in seconds; convert to absolute Unix ms
    this.tokenExpiry = Date.now() + expiresIn * 1_000;
    return accessToken;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

Note: The `ClientCredentialsHelper` interface and `createClientCredentialsHelper` factory are defined in `packages/auth-client/` (feature 06). The exact import paths and interface shape are determined by that feature's implementation. This spec references the expected contract.

### 3.3 src/agents/intake-agent.ts (Placeholder)

```typescript
import { Agent } from '@mastra/core/agent';
import { env } from '../config/env.js';
import { getTranscript, listTranscriptsForClient } from '../tools/transcript-tools.js';
import { createDraftTasks, getTask, listTasksForClient } from '../tools/task-tools.js';

// Full implementation in feature 19 (workflow-a-intake-agent)
export const intakeAgent = new Agent({
  id: 'intake-agent',
  name: 'Intake Agent',
  instructions:
    'Placeholder agent for Workflow A (Post-Intake → Build Tickets). ' +
    'Full implementation in feature 19.',
  model: env.LLM_MODEL,
  tools: {
    getTranscript,
    listTranscriptsForClient,
    createDraftTasks,
    getTask,
    listTasksForClient,
  },
});
```

### 3.4 src/agents/agenda-agent.ts (Placeholder)

```typescript
import { Agent } from '@mastra/core/agent';
import { env } from '../config/env.js';
import { getTask, listTasksForClient } from '../tools/task-tools.js';
import { createDraftAgenda, getAgenda } from '../tools/agenda-tools.js';

// Full implementation in feature 20 (workflow-b-agenda-agent)
export const agendaAgent = new Agent({
  id: 'agenda-agent',
  name: 'Agenda Agent',
  instructions:
    'Placeholder agent for Workflow B (Pre-Call → Build Agenda). ' +
    'Full implementation in feature 20.',
  model: env.LLM_MODEL,
  tools: {
    getTask,
    listTasksForClient,
    createDraftAgenda,
    getAgenda,
  },
});
```

### 3.5 src/tools/task-tools.ts (Placeholder)

```typescript
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const NOT_IMPLEMENTED = () => {
  throw new Error('This tool is not yet implemented. See feature 19/20.');
};

export const createDraftTasks = createTool({
  id: 'createDraftTasks',
  description: 'Creates one or more draft tasks in the iExcel system for a given client, derived from the intake transcript.',
  inputSchema: z.object({
    clientId: z.string().uuid(),
    tasks: z.array(z.object({
      title: z.string(),
      description: z.object({
        taskContext: z.string(),
        additionalContext: z.string(),
        requirements: z.string(),
      }),
      estimatedTime: z.string().optional(),
      assignee: z.string().optional(),
    })),
  }),
  outputSchema: z.object({
    created: z.array(z.object({
      id: z.string(),
      shortId: z.string(),
      title: z.string(),
    })),
  }),
  execute: NOT_IMPLEMENTED,
});

export const getTask = createTool({
  id: 'getTask',
  description: 'Retrieves a single task by its ID or short ID.',
  inputSchema: z.object({
    taskId: z.string(),
  }),
  outputSchema: z.object({
    task: z.record(z.unknown()),
  }),
  execute: NOT_IMPLEMENTED,
});

export const listTasksForClient = createTool({
  id: 'listTasksForClient',
  description: 'Lists tasks for a client, optionally filtered by status or transcript ID.',
  inputSchema: z.object({
    clientId: z.string().uuid(),
    status: z.string().optional(),
    transcriptId: z.string().optional(),
    page: z.number().int().positive().optional(),
    limit: z.number().int().positive().optional(),
  }),
  outputSchema: z.object({
    data: z.array(z.record(z.unknown())),
    total: z.number(),
    hasMore: z.boolean(),
  }),
  execute: NOT_IMPLEMENTED,
});
```

Similar placeholder structure applies for `transcript-tools.ts` and `agenda-tools.ts`.

---

## 4. Dependencies

### 4.1 Runtime Dependencies

| Package | Version | Purpose |
|---|---|---|
| `mastra` | latest (spike to pin) | Mastra CLI and server framework |
| `@mastra/core` | latest (spike to pin) | Agent, Tool classes and Mastra instance |
| `@iexcel/shared-types` | workspace | TypeScript types for tasks, agendas, transcripts |
| `@iexcel/auth-client` | workspace | Client credentials helpers for service token |
| `@iexcel/api-client` | workspace | Typed API methods for calling the API layer |
| `zod` | ^4.0.0 | Tool input/output schema validation |

### 4.2 Optional Runtime Dependencies

| Package | Version | Purpose |
|---|---|---|
| `@mastra/otel-exporter` | latest | OTLP trace export (conditional on env) |

### 4.3 Development Dependencies (workspace root)

| Tool | Purpose |
|---|---|
| `typescript` | TypeScript compiler |
| `@types/node` | Node.js type definitions |

---

## 5. API Contracts

### 5.1 Auth Service — Token Endpoint

Mastra calls the auth service's token endpoint via the `packages/auth-client/` library:

```
POST {AUTH_ISSUER_URL}/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id=mastra-agent
&client_secret={MASTRA_CLIENT_SECRET}
&scope=api:write
```

**Expected success response:**
```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**Expected error responses:**
- `401` — Invalid client credentials
- `400` — Malformed request

The `packages/auth-client/` library abstracts the OIDC discovery step (fetches the token endpoint URL from `{AUTH_ISSUER_URL}/.well-known/openid-configuration`) so Mastra does not hardcode `/token`.

### 5.2 Health Endpoint

```
GET /health

Response: 200 OK
Content-Type: application/json
{
  "status": "ok",
  "service": "iexcel-mastra",
  "version": "0.1.0"
}
```

This endpoint is built-in to Mastra's server. If Mastra does not expose `/health` by default, a custom route must be added. Confirm during the spike.

---

## 6. Security Requirements

### 6.1 Secret Handling

- `MASTRA_CLIENT_SECRET` and `LLM_API_KEY` must never be logged, even at debug level
- The `env.ts` Zod schema validation error messages must not include the values of failed fields (only the field names and validation failure reasons)
- The service token (`cachedToken`) must not be logged
- The `apiClient` must not expose tokens in error messages

### 6.2 Token Scope

The service token obtained via client credentials must be scoped to the minimum required API access. The `mastra-agent` client should be registered in the auth service with a scope like `api:write` — sufficient to create tasks and agendas, but not to access admin endpoints.

### 6.3 User Token Isolation

User tokens from MCP requests must not be stored in the `ServiceTokenManager` cache. They are ephemeral — valid only for the duration of a single MCP tool call. A separate api-client instance is constructed per user-scoped call.

### 6.4 Network Security

In production, `API_BASE_URL` must point to the internal cluster DNS name of the API service (e.g., `http://api.internal:8080`), not the public load balancer URL. This ensures Mastra-to-API traffic never leaves the private network.

---

## 7. Performance Requirements

### 7.1 Token Cache Hit Rate

The `ServiceTokenManager` must serve `getToken()` from the in-memory cache in >99% of calls. Only proactive refreshes and the initial startup call should result in network requests to the auth service.

### 7.2 Startup Time

The Mastra server must be ready (health endpoint responding) within 30 seconds of container start, assuming the auth service is available. The primary latency contributor is the initial token acquisition network call.

### 7.3 No Blocking

Token refresh must never block agent invocations that are using a still-valid token. Concurrent calls to `getToken()` during a refresh must share the same in-progress refresh promise (see Section 3.2 — `refreshInProgress`).

---

## 8. Observability Configuration

### 8.1 OTLP Configuration

If `OTEL_EXPORTER_OTLP_ENDPOINT` is set:

```typescript
observability: {
  configs: {
    otel: {
      serviceName: env.OTEL_SERVICE_NAME ?? 'iexcel-mastra',
      exporters: [
        new OtelExporter({
          provider: {
            otlp: {
              endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
              headers: parseOtlpHeaders(env.OTEL_EXPORTER_OTLP_HEADERS),
            }
          }
        })
      ],
    },
  },
},
```

Where `parseOtlpHeaders` converts the string format `"key=value,key2=value2"` into `Record<string, string>`.

### 8.2 What Mastra Traces Automatically

When tracing is enabled, Mastra automatically instruments:
- Agent invocations (`agent.generate()`, `agent.stream()`)
- LLM API calls (model, input tokens, output tokens, latency)
- Tool executions (tool ID, input, output, success/failure)
- Workflow step execution

No custom instrumentation is required in this feature. Features 19 and 20 may add custom spans for business logic.

---

## 9. Nx Integration

### 9.1 Affected Graph Behavior

When files in the following locations change, `mastra` is marked affected by Nx:
- `packages/shared-types/src/**` — type changes
- `packages/auth-client/src/**` — auth helper changes
- `packages/api-client/src/**` — API client changes
- `apps/mastra/src/**` — direct source changes

This is enforced by the `implicitDependencies` field in `project.json`.

### 9.2 CI/CD Integration

Per `infra-prd.md`, when `apps/mastra/` is affected:
- `nx run mastra:lint` runs
- `nx run mastra:type-check` runs
- `nx run mastra:build` runs
- If build passes, the Docker image is built and pushed (feature 35)
- The container is deployed (feature 36)

---

## 10. Containerization Spike

### 10.1 Spike Objectives

Before full implementation, the following must be verified:

| Question | Acceptance Criteria |
|---|---|
| Does `mastra build` produce a runnable Node.js output? | `node dist/index.js` starts the server without errors |
| Does Mastra work without a mounted volume? | Server starts and agent calls work in a Docker container with no volumes |
| What port does `mastra serve` / `mastra build` use by default? | Confirmed that `server.port: 8081` override works |
| Does Mastra's observability require a local data directory? | Either no persistent path needed, or the spike documents what to mount |
| What is the correct `mastra build` output directory? | Confirms the `dist/apps/mastra/` path in `project.json` |
| Is `@mastra/otel-exporter` the correct package for OTLP? | Confirmed package name and API from installed version |

### 10.2 Spike Output

The spike must produce a written note (can be a comment in `apps/mastra/README.md` or a decision log in the repo) recording:
- Mastra version used (`mastra@X.Y.Z`, `@mastra/core@X.Y.Z`)
- Build command and output path confirmed
- Volume requirements (none, or specific path)
- Any Mastra-specific configuration flags needed for containerization
- Observability package name and import path confirmed

---

## 11. Open Technical Questions

| Question | Impact | Recommended Resolution |
|---|---|---|
| Does Mastra's built-in `/health` endpoint exist at that path, or does it need to be custom? | Affects FR-90 implementation | Confirm during spike by starting Mastra and checking available routes |
| Does `@mastra/core` export `PinoLogger` directly, or via a sub-path? | Affects import in `src/index.ts` | Check Mastra docs and installed package `exports` field |
| What scope should `mastra-agent` request in the client credentials flow? | Affects what the `mastra-agent` OIDC client can do in the API | Coordinate with feature 05 (auth service) and feature 07 (API auth middleware) |
| Does Mastra support custom middleware for request logging (to capture `requestSource`, `userId`)? | Affects FR-82 implementation | Check Mastra server adapter documentation |
| Should `mastra dev` be used for local development or `mastra start` (post-build)? | Affects `serve` target in `project.json` | Confirm with Mastra CLI reference |
| Is `@iexcel/api-client` available at the time feature 18 is implemented (it's feature 22)? | If not, tools must be defined with stub api-client calls that are replaced in feature 22 | Likely: implement tools with stub api calls now; wire up real api-client when feature 22 ships |

---

## 12. Migration Considerations

This is a greenfield application — no migration from an existing system. However:

- The `apps/mastra/` directory and `project.json` skeleton will be created by feature 00 (Nx monorepo scaffolding). This feature fills in the contents.
- When features 19 and 20 implement the agents, they will replace the placeholder `instructions` and `execute` functions in the existing files. They should not create new files — they modify the existing placeholders in-place.
- When feature 21 (MCP server) is implemented, it will add an MCP server configuration to the `mastra` instance in `src/index.ts`. It must not conflict with the server configuration established here.
- When feature 22 (api-client-package) ships, the tool `execute` functions in `src/tools/` will be updated to use the real api-client methods. The wiring established in this feature (token provider, base URL) remains unchanged.
