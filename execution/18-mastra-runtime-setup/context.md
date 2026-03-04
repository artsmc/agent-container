# Feature 18: Mastra Runtime Setup

## Summary
Set up the Mastra agent runtime at apps/mastra/ in the Nx monorepo. Configure the Mastra framework, agent definitions, tool registrations, and LLM provider setup. Set up Mastra's built-in backend for orchestration and observability. Configure service-to-service authentication using OIDC client credentials flow via the auth service.

## Phase
Phase 3 — External Integrations & Workflows

## Dependencies
- **Blocked by**: 00 (Nx Monorepo Scaffolding — apps/mastra/ directory and project.json), 01 (Shared Types — TypeScript types for tasks, agendas, transcripts used by tools), 06 (Auth Client Package — OIDC client credentials flow for Mastra-to-API auth)
- **Blocks**: 19 (Workflow A Intake Agent — agent runs on this runtime), 20 (Workflow B Agenda Agent — agent runs on this runtime), 21 (Mastra MCP Server — MCP server runs on this runtime)

## Source PRDs
- mastra-prd.md (Architecture, Platform, Authentication & Security)
- infra-prd.md (apps/mastra container spec, Nx Dependency Graph)

## Relevant PRD Extracts

### Architecture — Platform (mastra-prd.md)

> **Mastra** serves as the **agent orchestration layer**, providing:
> - **Agents** — LLM-powered agents for transcript interpretation and task summarization.
> - **Tools** — Mastra tools that call the API layer. Mastra does **not** talk to Grain, Asana, or Google Docs directly.
> - **Workflows** — Step-by-step pipelines for each automation track.

### How Mastra Interacts with the System (mastra-prd.md)

> Mastra agents are invoked by the API layer when a workflow is triggered. The agent does its LLM work (parsing, summarizing) and writes results back to the API.
>
> Mastra has its own backend for agent orchestration, observability, and runtime management. Business data (tasks, agendas, clients) lives in the PostgreSQL database, accessed through the API layer.

### Authentication & Security (mastra-prd.md)

> **Service-to-Service (Mastra -> API):**
> - Mastra is registered as OIDC client `mastra-agent` (confidential client).
> - Uses the **client credentials flow** to obtain access tokens from the auth service.
> - Tokens are attached to all API calls Mastra makes to save draft tasks, agendas, etc.
>
> **User Context (Terminal -> Mastra MCP):**
> - When a user calls Mastra via MCP, their auth token (obtained via device flow) is passed through.
> - Mastra forwards the user's token to the API so actions are scoped to the user's permissions.

### Security Layers (mastra-prd.md)

| Layer | Implementation |
|---|---|
| **Authentication** | OIDC tokens from the Auth Service |
| **Authorization** | User tokens scoped to specific clients via product permissions in the API |
| **Service identity** | Mastra's own client credentials for autonomous API calls |
| **Request logging** | Every agent call logged (who, what, when) |
| **Rate limiting** | Prevent abuse from runaway agent sessions |
| **Human-in-the-loop** | Optional approval gate for sensitive operations |

### apps/mastra Container Spec (infra-prd.md)

| Property | Value |
|---|---|
| **Runtime** | Node.js (Mastra's runtime) |
| **Port** | 8081 (agent API) + Mastra's observability port |
| **Health check** | Mastra's built-in health endpoint |
| **Environment variables** | `API_BASE_URL`, `API_SERVICE_TOKEN`, `LLM_API_KEY`, Mastra-specific config |
| **Scaling** | Horizontal — based on workflow queue depth |
| **Persistent storage** | None — Mastra's own telemetry/observability may need a volume or external store |
| **Notes** | Mastra has its own backend for agent orchestration and observability. Container must respect Mastra's runtime expectations. Spike early to confirm containerization compatibility. |

### Nx Dependency Graph (infra-prd.md)

> - `mastra` depends on `shared-types` and `api-client`.

## Scope

### In Scope
- Initialize Mastra framework at apps/mastra/ with proper configuration
- Configure LLM provider(s) (API key injection from environment variables)
- Set up Mastra's built-in backend for agent orchestration and observability
- Register placeholder agent definitions (Workflow A and Workflow B agents — implementations in features 19 and 20)
- Register placeholder tool definitions (API-calling tools that agents use)
- Configure service-to-service auth: implement OIDC client credentials flow (`mastra-agent` client) to obtain tokens for API calls
- Set up token management (obtain, cache, refresh service tokens)
- Configure user token passthrough for MCP requests (forward user's token to API)
- Set up the api-client package dependency for typed API calls
- Configure health endpoint for container health checks
- Configure environment variable loading (API_BASE_URL, LLM_API_KEY, auth credentials)
- Set up Mastra's observability/logging
- Update apps/mastra/project.json with proper Nx build/serve targets

### Out of Scope
- Workflow A agent implementation (that is feature 19)
- Workflow B agent implementation (that is feature 20)
- MCP server configuration (that is feature 21)
- Dockerfile creation (that is feature 35)
- Terraform deployment config (that is feature 36)
- LLM prompt engineering and testing (that happens in features 19 and 20)

## Key Decisions
- Mastra is the agent orchestration layer only. It does not own business logic, data persistence, or external service integrations. All business data flows through the API layer.
- Mastra uses the `api-client` shared package (from packages/api-client/) for typed API calls rather than raw HTTP requests.
- Service-to-service auth uses OIDC client credentials flow. Mastra is registered as `mastra-agent` (confidential client) in the auth service and obtains its own access tokens for API calls.
- User token passthrough is required for MCP-originated requests so that API actions are scoped to the calling user's permissions, not Mastra's service identity.
- Early spike recommended (per infra-prd.md) to confirm Mastra's containerization compatibility and runtime expectations before deep implementation.
- Mastra's observability backend may need a volume or external store for telemetry — this should be resolved during the spike.
