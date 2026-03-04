# FRS — Functional Requirement Specification
# Feature 18: Mastra Runtime Setup

## 1. Overview

This document specifies the functional requirements for initializing, configuring, and operating the Mastra agent runtime at `apps/mastra/`. Requirements are grouped by concern: project structure, Mastra core configuration, LLM provider, authentication, API client wiring, placeholder agents and tools, observability, and health.

---

## 2. Project Structure

### FR-01: Directory Layout

The `apps/mastra/` directory must have the following source structure:

```
apps/mastra/
├── src/
│   ├── agents/
│   │   ├── intake-agent.ts          # Placeholder — implemented in feature 19
│   │   ├── agenda-agent.ts          # Placeholder — implemented in feature 20
│   │   └── index.ts                 # Barrel export of all agents
│   ├── tools/
│   │   ├── task-tools.ts            # Placeholder tools for task API calls
│   │   ├── transcript-tools.ts      # Placeholder tools for transcript API calls
│   │   ├── agenda-tools.ts          # Placeholder tools for agenda API calls
│   │   └── index.ts                 # Barrel export of all tools
│   ├── auth/
│   │   └── service-token.ts         # OIDC client credentials token manager
│   ├── config/
│   │   └── env.ts                   # Environment variable loading and validation
│   └── index.ts                     # Main Mastra instance and server entrypoint
├── package.json
├── project.json
└── tsconfig.json
```

### FR-02: Package Identity

The `apps/mastra/package.json` must:
- Set `name` to `@iexcel/mastra`
- Set `type` to `"module"` (ESM)
- Declare `mastra` as a production dependency
- Declare `@mastra/core` as a production dependency
- Reference `@iexcel/shared-types` and `@iexcel/auth-client` as workspace dependencies
- Reference `@iexcel/api-client` as a workspace dependency (even if feature 22 is not yet complete — peer reference for future wiring)
- Declare `zod` as a production dependency (used by Mastra tools for schema validation)

---

## 3. Environment Configuration

### FR-10: Environment Variable Loading

The `src/config/env.ts` module must:
- Load all required environment variables at startup
- Validate that required variables are present — throw a descriptive error on startup if any are missing
- Export a typed `env` object so all other modules import from this single source rather than reading `process.env` directly

### FR-11: Required Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `API_BASE_URL` | Base URL for the API layer (e.g., `http://api:8080`) | Yes |
| `AUTH_ISSUER_URL` | OIDC issuer URL of the auth service (e.g., `https://auth.iexcel.com`) | Yes |
| `MASTRA_CLIENT_ID` | OIDC client ID for the `mastra-agent` client | Yes |
| `MASTRA_CLIENT_SECRET` | OIDC client secret for the `mastra-agent` client | Yes |
| `LLM_API_KEY` | LLM provider API key (OpenAI or Anthropic) | Yes |
| `LLM_PROVIDER` | LLM provider name (`openai` or `anthropic`) | Yes |
| `LLM_MODEL` | Specific model to use (e.g., `openai/gpt-4o`, `anthropic/claude-opus-4-6`) | Yes |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry OTLP endpoint URL | No (observability disabled if absent) |
| `OTEL_EXPORTER_OTLP_HEADERS` | OTLP auth headers (e.g., `api-key=abc123`) | No |
| `OTEL_SERVICE_NAME` | Service name reported in traces (defaults to `iexcel-mastra`) | No |
| `NODE_ENV` | `development`, `staging`, or `production` | No (defaults to `development`) |

### FR-12: Startup Validation

If any required environment variable is missing, the process must:
1. Log an error message naming the missing variable(s)
2. Exit with a non-zero exit code (do not start the server with a misconfigured state)

---

## 4. Mastra Core Configuration

### FR-20: Mastra Instance Initialization

The `src/index.ts` file must export a configured `Mastra` instance via:
```typescript
export const mastra = new Mastra({ ... });
```

This export is used by Mastra's build tooling and by downstream feature tests.

### FR-21: Server Configuration

The Mastra server must be configured to:
- Listen on port `8081` (not Mastra's default of 4111)
- Bind to host `0.0.0.0` (so the container receives external traffic)
- The port and host must be overridable via environment variables `MASTRA_PORT` and `MASTRA_HOST` for local development flexibility

### FR-22: Agent Registration

The Mastra instance must register all agents exported from `src/agents/index.ts`. Initially, this includes placeholder definitions for:
- `intakeAgent` — Workflow A agent (implementation in feature 19)
- `agendaAgent` — Workflow B agent (implementation in feature 20)

Agents must be registered so that `mastra.getAgent('intakeAgent')` and `mastra.getAgent('agendaAgent')` return the respective agent instances.

### FR-23: Tool Registration (via Agents)

Tools are registered at the agent level, not globally on the Mastra instance. Placeholder tool sets must be attached to each placeholder agent definition. The tool structure must match what features 19 and 20 will replace with real implementations.

---

## 5. LLM Provider Configuration

### FR-30: Provider Injection via Environment

The LLM model must be specified as a string in the format `{provider}/{model}` (e.g., `openai/gpt-4o`, `anthropic/claude-opus-4-6`). The Mastra framework supports this format natively via its model routing system.

The appropriate provider API key must be injected via environment variable:
- OpenAI: reads `OPENAI_API_KEY` (set from `LLM_API_KEY`)
- Anthropic: reads `ANTHROPIC_API_KEY` (set from `LLM_API_KEY`)

### FR-31: Model Configuration in Agent Definition

Each placeholder agent definition must include a `model` field referencing the configured model string. The `env.ts` module exposes the resolved model string, and agent definitions read from it:
```typescript
model: env.LLM_MODEL,  // e.g., 'openai/gpt-4o'
```

### FR-32: Provider API Key Exposure

The `src/config/env.ts` module must set the correct provider-specific environment variable:
- If `LLM_PROVIDER` is `openai`, set `process.env.OPENAI_API_KEY = env.LLM_API_KEY`
- If `LLM_PROVIDER` is `anthropic`, set `process.env.ANTHROPIC_API_KEY = env.LLM_API_KEY`

This must happen before any agent is instantiated.

---

## 6. Service-to-Service Authentication

### FR-40: OIDC Client Credentials Token Manager

The `src/auth/service-token.ts` module must implement a `ServiceTokenManager` class (or functional equivalent) that:
- Obtains an access token from the auth service using the OIDC client credentials flow
- Uses `packages/auth-client/`'s client credentials helper — does not implement the OAuth flow directly
- Caches the token in memory with its expiry time
- Proactively refreshes the token before expiry (threshold: 60 seconds before `exp`)
- Exposes a `getToken(): Promise<string>` method that returns a valid, non-expired access token
- Logs a warning if token refresh fails, and retries with exponential backoff (max 3 retries)
- Throws a typed error if a token cannot be obtained after retries

### FR-41: Token Acquisition on Startup

The service token manager must be initialized and a token obtained before the Mastra server begins accepting requests. If the initial token acquisition fails (auth service unreachable), the startup should:
1. Log the error with detail
2. Retry up to 3 times with 5-second intervals
3. If all retries fail, exit with a non-zero exit code (do not start in an unauthenticated state)

### FR-42: Token Provider Interface

The `ServiceTokenManager` must implement or be adaptable to the token provider interface expected by `packages/api-client/`. Specifically, it must supply `getAccessToken(): Promise<string>` that the api-client uses when attaching `Authorization: Bearer <token>` headers to API requests.

### FR-43: User Token Passthrough

For requests that originate from MCP tool calls (feature 21), the calling user's token must be forwarded to the API instead of the service token. The runtime must support constructing an api-client instance with a user-scoped token provider:
```typescript
// Mastra service calls (autonomous)
const serviceApiClient = createApiClient({ getAccessToken: serviceTokenManager.getToken });

// MCP-originated calls (user-scoped)
const userApiClient = createApiClient({ getAccessToken: async () => userToken });
```

Feature 21 will wire in the user token passthrough. This feature must ensure the api-client construction is parameterized to support this pattern.

---

## 7. API Client Wiring

### FR-50: API Client Instance

The `src/index.ts` or a dedicated `src/api-client.ts` module must create and export a pre-configured api-client instance using the service token manager:
```typescript
export const apiClient = createApiClient({
  baseUrl: env.API_BASE_URL,
  getAccessToken: () => serviceTokenManager.getToken(),
});
```

### FR-51: API Client Availability to Tools

All tool definitions in `src/tools/` must import the service api-client instance (or accept an api-client as a parameter for user-scoped calls). Tools must not construct their own HTTP clients or hardcode the API base URL.

### FR-52: Type Safety

All api-client calls must use the typed methods from `packages/api-client/` and the types from `packages/shared-types/`. No `any` types, no untyped fetch calls.

---

## 8. Placeholder Agent Definitions

### FR-60: Intake Agent Placeholder (`src/agents/intake-agent.ts`)

Must define and export an `intakeAgent` using the Mastra `Agent` class with:
- `id: 'intake-agent'`
- `name: 'Intake Agent'`
- `instructions`: a brief placeholder string (e.g., `'Placeholder — implemented in feature 19'`)
- `model`: the configured LLM model string from `env`
- `tools`: the placeholder tool set from `src/tools/` relevant to intake (transcript tools, task tools)

The file must include a comment: `// Full implementation in feature 19 (workflow-a-intake-agent)`.

### FR-61: Agenda Agent Placeholder (`src/agents/agenda-agent.ts`)

Must define and export an `agendaAgent` using the Mastra `Agent` class with:
- `id: 'agenda-agent'`
- `name: 'Agenda Agent'`
- `instructions`: a brief placeholder string (e.g., `'Placeholder — implemented in feature 20'`)
- `model`: the configured LLM model string from `env`
- `tools`: the placeholder tool set from `src/tools/` relevant to agenda building (task tools, agenda tools)

The file must include a comment: `// Full implementation in feature 20 (workflow-b-agenda-agent)`.

### FR-62: Agent Barrel Export

`src/agents/index.ts` must export both agents:
```typescript
export { intakeAgent } from './intake-agent';
export { agendaAgent } from './agenda-agent';
```

---

## 9. Placeholder Tool Definitions

### FR-70: Tool Structure

Each tool must be defined using Mastra's tool definition pattern:
- An `id` string
- A `description` string (used by the LLM to decide when to call the tool)
- An `inputSchema` using `zod` (defines parameters the LLM may pass)
- An `outputSchema` using `zod` (defines the structure of the tool's return value)
- An `execute` function that calls the appropriate api-client method

Placeholder tools must have a properly typed `execute` that throws `new Error('Placeholder — implemented in feature 19/20')` until replaced.

### FR-71: Task Tools (`src/tools/task-tools.ts`)

Must define placeholder tools for:
- `createDraftTasks` — calls `apiClient.tasks.createDraftTasks(clientId, tasks)`
- `getTask` — calls `apiClient.tasks.getTask(taskId)`
- `listTasksForClient` — calls `apiClient.tasks.listTasksForClient(clientId, params)`

### FR-72: Transcript Tools (`src/tools/transcript-tools.ts`)

Must define placeholder tools for:
- `getTranscript` — calls `apiClient.transcripts.getTranscript(transcriptId)`
- `listTranscriptsForClient` — calls `apiClient.transcripts.listTranscripts(clientId)`

### FR-73: Agenda Tools (`src/tools/agenda-tools.ts`)

Must define placeholder tools for:
- `createDraftAgenda` — calls `apiClient.agendas.createDraftAgenda(clientId, content)`
- `getAgenda` — calls `apiClient.agendas.getAgenda(agendaId)`

### FR-74: Tool Barrel Export

`src/tools/index.ts` must export all tool sets:
```typescript
export * from './task-tools';
export * from './transcript-tools';
export * from './agenda-tools';
```

---

## 10. Observability and Logging

### FR-80: Pino Logger

The Mastra instance must be configured with a Pino logger:
```typescript
logger: new PinoLogger({
  name: 'iexcel-mastra',
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
})
```

The logger name must match the OTEL service name for trace correlation.

### FR-81: OpenTelemetry Tracing

If `OTEL_EXPORTER_OTLP_ENDPOINT` is set, the Mastra instance must be configured with observability:
```typescript
observability: {
  configs: {
    otel: {
      serviceName: env.OTEL_SERVICE_NAME ?? 'iexcel-mastra',
      exporters: [
        new OtelExporter({
          provider: {
            /* OTLP configuration from env */
          }
        })
      ]
    }
  }
}
```

If `OTEL_EXPORTER_OTLP_ENDPOINT` is absent, observability must be disabled cleanly (no errors, no failed connection attempts).

### FR-82: Structured Request Logging

Every agent invocation must produce a structured log entry including:
- `agentId` — which agent was invoked
- `requestSource` — `'api'` (workflow triggered by API) or `'mcp'` (MCP tool call)
- `userId` — user UUID if user token is present; `'mastra-service'` if service token
- `startedAt` — ISO 8601 timestamp
- `durationMs` — duration of the invocation

This may be implemented via Mastra's built-in tracing rather than manual log statements.

---

## 11. Health Endpoint

### FR-90: Health Check Response

Mastra's built-in health endpoint must respond at `GET /health` with:
- HTTP status `200 OK`
- Content-Type `application/json`
- Response body:
  ```json
  {
    "status": "ok",
    "service": "iexcel-mastra",
    "version": "0.1.0"
  }
  ```

The load balancer (feature 36, Terraform) will use this endpoint to determine container health.

### FR-91: Health Endpoint Accessibility

The health endpoint must respond even if the LLM provider is temporarily unavailable or the service token is being refreshed. It must not block on external service checks.

---

## 12. Nx Integration

### FR-100: project.json Targets

The `apps/mastra/project.json` must define:

| Target | Description |
|---|---|
| `build` | Compile TypeScript and produce runnable output (`mastra build`) |
| `serve` | Start the Mastra development server (`mastra dev`) |
| `type-check` | Run `tsc --noEmit` |
| `lint` | Run ESLint against `src/` |

### FR-101: Nx Tags

The `project.json` must include tags:
```json
"tags": ["scope:mastra", "type:app"]
```

### FR-102: Nx Dependency Declarations

The `project.json` must declare its implicit dependencies on:
- `shared-types`
- `auth-client`
- `api-client`

So that Nx's affected graph correctly marks `mastra` as affected when these packages change.

---

## 13. Error Handling

### FR-110: Startup Errors

All startup errors (missing env vars, failed token acquisition, failed server bind) must:
1. Log the error with full context (not just a message, but the error object and relevant config)
2. Exit with code `1`
3. Never swallow errors silently

### FR-111: Runtime Tool Errors

When a placeholder tool's `execute` function is called (before feature 19/20 replaces it), it must throw an error with the message `'This tool is not yet implemented. See feature 19/20.'`. This prevents silent no-ops.

### FR-112: Token Refresh Errors

If the service token cannot be refreshed, the `ServiceTokenManager` must:
1. Log a `warn`-level message with the underlying error
2. Retry up to 3 times with exponential backoff (1s, 2s, 4s)
3. If all retries fail, throw a typed error so the api-client call fails with a clear error rather than making an unauthenticated request

---

## 14. User Workflows

### Workflow 1: Agent Invocation (Service Context)

1. API layer triggers a workflow (POST `/workflows/intake` or `/workflows/agenda`)
2. API calls Mastra's agent endpoint
3. Mastra resolves the `intakeAgent` or `agendaAgent` via `mastra.getAgent()`
4. Agent calls LLM with its instructions and the provided input
5. Agent calls tools as needed; tools call the API via the service api-client (service token)
6. Agent returns structured output
7. API persists the output

### Workflow 2: MCP Tool Call (User Context)

1. Terminal user calls an MCP tool (feature 21)
2. MCP server receives the call with the user's auth token
3. MCP server constructs a user-scoped api-client (user token provider)
4. Agent runs with user-scoped API access
5. API receives requests with user's token — authorization is user-scoped

### Workflow 3: Startup Sequence

1. `src/config/env.ts` validates all required env vars
2. Provider API key is set in the appropriate `process.env` variable
3. `ServiceTokenManager` is instantiated; initial token fetch attempt begins
4. Token is obtained successfully
5. api-client is constructed with service token provider
6. Mastra instance is constructed with agents, tools, logger, and observability
7. Mastra server starts on port 8081
8. Health endpoint becomes available
9. Server logs a startup message with the bound address
