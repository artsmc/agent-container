# FRD — Feature Requirement Document
# Feature 18: Mastra Runtime Setup

## 1. Business Objective

Establish `apps/mastra/` as the agent orchestration layer for the iExcel automation system. This feature creates the runtime foundation on which all Mastra agents, tools, and workflows will operate. It configures the Mastra framework, connects it to the LLM provider, authenticates it to the API layer via OIDC client credentials, and makes it observable and operationally ready.

This is a foundational infrastructure feature. It does not implement any agent logic. It creates the configured runtime shell that features 19 (Workflow A Intake Agent), 20 (Workflow B Agenda Agent), and 21 (Mastra MCP Server) build on top of.

## 2. Value Proposition

| Stakeholder | Value Delivered |
|---|---|
| **Development team (features 19, 20, 21)** | A pre-configured, working Mastra instance with proper auth, LLM, observability, and API client wiring — so downstream features only need to implement agent logic, not runtime plumbing. |
| **Operations team** | A containerizable Mastra server with health checks, environment-variable-based configuration, and OpenTelemetry tracing — ready for containerization (feature 35) and deployment (feature 36). |
| **API layer (feature 07+)** | Mastra authenticates itself as a trusted service via OIDC client credentials — every Mastra call to the API carries a valid, expiring, automatically refreshed service identity token. |
| **Security posture** | Service-to-service authentication is established before any agent begins making API calls. User tokens from MCP requests are passed through transparently so API authorization is user-scoped when appropriate. |

## 3. Problem Statement

Without this feature:

- Features 19, 20, and 21 have no runtime to attach to. They cannot be developed or tested.
- The Mastra agent runtime has no identity — it cannot authenticate to the API layer.
- LLM providers are not configured — agents have no model to call.
- There is no health endpoint for container health checks.
- There is no observability — agent calls, tool invocations, and LLM interactions are invisible.
- Environment configuration is ad-hoc — each downstream feature would need to independently handle env var loading.

## 4. Target Users

### Direct Runtime Consumers

- **Feature 19** — Workflow A Intake Agent: registers an agent on this runtime
- **Feature 20** — Workflow B Agenda Agent: registers an agent on this runtime
- **Feature 21** — Mastra MCP Server: runs an MCP server on this runtime

### Indirect Beneficiaries

- **iExcel account managers** — who trigger workflows that ultimately run on this runtime
- **Operations team** — who monitor the runtime via observability tooling
- **API layer** — which receives authenticated requests from this runtime

## 5. Success Metrics

| Metric | Target |
|---|---|
| Mastra server starts without errors with all env vars set | Zero startup errors on happy path |
| Health endpoint returns `200 OK` with expected payload | Load balancer can route traffic |
| Service token is obtained from the auth service on startup | Token request succeeds with `mastra-agent` client credentials |
| Service token is refreshed before expiry | No `401` errors on long-running Mastra processes |
| LLM provider responds to a test invocation (agent.generate) | LLM integration is working end-to-end |
| OpenTelemetry traces appear in the configured exporter | Observability pipeline is functional |
| Placeholder agent definitions are importable by features 19 and 20 | Downstream features can slot in implementations |
| `nx run mastra:serve` starts the development server | Development workflow works |
| `nx run mastra:build` produces a deployable build artifact | CI/CD pipeline can build the container |

## 6. Business Constraints

- **Mastra is the agent orchestration layer only.** It does not own business logic, data persistence, or external service integrations (Asana, Grain, Google Docs, Email). All such operations route through the API layer.
- **Mastra uses `packages/api-client/` for all API calls.** No raw `fetch` or HTTP calls directly to the API. The api-client package provides typed methods and handles token attachment.
- **Service identity uses OIDC client credentials.** Mastra is registered as `mastra-agent` (confidential OIDC client) in the auth service. It must obtain its own access tokens rather than reusing user tokens.
- **User token passthrough for MCP requests.** When a request arrives from an MCP tool caller (feature 21), the user's token must be forwarded to the API so actions are scoped to the user's permissions, not Mastra's service identity.
- **Port 8081.** The container listens on port 8081 as defined in `infra-prd.md`.
- **Spike recommended.** Per `infra-prd.md`, an early spike should confirm Mastra's containerization compatibility and runtime expectations before deep implementation.
- **No persistent storage.** Mastra's telemetry/observability may need an external store or volume — this must be resolved during the spike.
- **Blocked by features 00, 01, and 06.** The Nx monorepo must exist, shared-types must be available, and the auth-client package (with client credentials helpers) must be ready before this feature can be fully implemented.

## 7. Integration with Product Roadmap

Feature 18 is on the Mastra sub-path of the critical chain:

```
00 (monorepo) → 06 (auth-client) → 18 (mastra-runtime-setup) → 19/20 (agents) → 21 (MCP server) → 33 (terminal MCP tools)
```

- **Blocked by:** Feature 00 (Nx monorepo scaffolding — provides `apps/mastra/` directory and `project.json`), Feature 01 (shared-types — provides types used by tools and agents), Feature 06 (auth-client — provides client credentials helpers)
- **Blocks:** Feature 19 (Workflow A Intake Agent), Feature 20 (Workflow B Agenda Agent), Feature 21 (Mastra MCP Server)

This feature is a Wave 2 deliverable in the spec generation roadmap. It can proceed as soon as auth-client (feature 06) is specced, even if feature 22 (api-client-package) is not yet complete — placeholder tool definitions can be registered without a real api-client implementation.

## 8. Scope Boundaries

### In Scope

- Initialize Mastra framework instance at `apps/mastra/src/index.ts`
- Configure LLM provider (API key from environment variables; OpenAI or Anthropic)
- Set up Mastra's server with port 8081 and host `0.0.0.0`
- Register placeholder agent definitions for Workflow A (intake) and Workflow B (agenda)
- Register placeholder tool definitions (API-calling tools agents will use)
- Configure service-to-service auth: OIDC client credentials flow using `packages/auth-client/` to obtain tokens for the `mastra-agent` client
- Set up token management: obtain on startup, cache in memory, refresh before expiry
- Configure user token passthrough for MCP-originated requests
- Integrate `packages/api-client/` for all API calls, wiring in the service token provider
- Set up OpenTelemetry tracing via Mastra's `observability` configuration
- Set up Pino logger via Mastra's `logger` configuration
- Configure environment variable loading (`API_BASE_URL`, `LLM_API_KEY`, `AUTH_ISSUER_URL`, `MASTRA_CLIENT_ID`, `MASTRA_CLIENT_SECRET`, Mastra-specific config)
- Update `apps/mastra/project.json` with proper Nx `build`, `serve`, `type-check`, and `lint` targets
- Configure `apps/mastra/package.json` and `tsconfig.json`
- Verify health endpoint (`GET /health`) responds correctly

### Out of Scope

- Workflow A agent implementation — feature 19
- Workflow B agent implementation — feature 20
- MCP server configuration — feature 21
- Dockerfile creation — feature 35
- Terraform deployment configuration — feature 36
- LLM prompt engineering and testing — features 19 and 20
- The `packages/api-client/` package itself — feature 22 (this feature wires it in but does not implement it)
- Product-level authorization or permission checking — that is the API layer's responsibility

## 9. Key Decisions

| Decision | Resolution |
|---|---|
| Mastra's role | Agent orchestration only. No business logic, no direct DB access, no external service calls (Asana/Grain/GDocs). |
| API communication | Via `packages/api-client/` typed methods — never raw HTTP. |
| Service auth | OIDC client credentials flow, `mastra-agent` client. Token obtained via `packages/auth-client/`. Cached in memory, refreshed before expiry. |
| User token passthrough | For MCP requests (feature 21), the calling user's token is forwarded to the API via the api-client's token provider interface. |
| LLM provider | Configurable via environment variable. OpenAI and Anthropic both supported by Mastra. The specific model and provider is a deployment concern, not a code concern. |
| Observability | OpenTelemetry (OTLP) via Mastra's built-in observability configuration. Exporter endpoint and credentials are environment-variable-driven. |
| Port | 8081 per `infra-prd.md`. Mastra's default port is 4111 — this must be overridden. |
| Containerization spike | Per `infra-prd.md`, an early spike is required to confirm that Mastra's runtime works inside a container and that its observability telemetry store is handled appropriately (volume vs. external store). |
