# Mastra Runtime — Feature 18 Spike Notes

## Version

- `@mastra/core`: **1.9.0** (pinned via `^1.9.0` in package.json)
- `mastra` CLI: **1.3.6** (used for `mastra dev` and `mastra build`)

## Architecture Overview

```
apps/mastra/
  src/
    config/env.ts          — Zod-validated env config + API key injection
    auth/service-token.ts  — Thin wrapper over @iexcel/auth-client CC grant
    tools/                 — Placeholder Mastra tools (Feature 19 / 20)
    agents/                — Placeholder Mastra agents (Feature 19 / 20)
    api-client-stub.ts     — Typed stub until @iexcel/api-client ships (F-22)
    index.ts               — Entry point; exports `mastra` instance
```

## Build Approach

Mastra uses its own bundler (via the `mastra` CLI) rather than esbuild/tsc directly:

- **Development**: `mastra dev` — starts a Hono-based server with hot reload.
  Output served from `.mastra/output/`.
- **Production build**: `mastra build` — bundles the entry point to
  `.mastra/output/index.mjs`. The server is then started with:
  `node .mastra/output/index.mjs`

The Nx `build` and `serve` targets delegate to these CLI commands via
`nx:run-commands` with `cwd: apps/mastra`.

The `type-check` target runs `tsc --noEmit` directly for CI type safety checks
without triggering the full Mastra build pipeline.

## Model Configuration

Models are specified as `{ id: "provider/model" }` matching the
`OpenAICompatibleConfig` shape accepted by `AgentConfig.model`.

The model string format is `<LLM_PROVIDER>/<LLM_MODEL>` — both values come
from environment variables. Supported Mastra model router IDs include:

- `anthropic/claude-sonnet-4.5`, `anthropic/claude-opus-4`, etc.
- `openai/gpt-4o`, `openai/gpt-4o-mini`, etc.

Custom model versions (e.g., `anthropic/claude-sonnet-4-20250514`) that are
not in the Mastra model registry are accepted via the
`{ id: \`${string}/${string}\` }` overload of `OpenAICompatibleConfig`.

## Container Notes

The existing `Dockerfile` (from Feature 35) runs `mastra build` and then
starts the server with `node .mastra/output/index.mjs`. Ensure the following
env vars are injected at runtime via Cloud Run secrets / Secret Manager:

- `API_BASE_URL`
- `AUTH_ISSUER_URL`
- `MASTRA_CLIENT_ID`
- `MASTRA_CLIENT_SECRET`
- `LLM_API_KEY`
- `LLM_PROVIDER` (default: `anthropic`)
- `LLM_MODEL` (default: `claude-sonnet-4-20250514`)

## Placeholder Strategy

All tool `execute` functions throw `'Not implemented — see feature N'`.
This is intentional: it makes the gap explicit at runtime and prevents
silent no-ops from masking missing implementations during integration testing.

## Known Limitations / TODOs

- **Feature 19**: Implement `createDraftTasks`, `getTask`, `listTasksForClient`,
  `getTranscript`, `listTranscriptsForClient` using real API calls.
  Replace placeholder `intakeAgent` instructions with production system prompt.
- **Feature 20**: Implement `createDraftAgenda`, `getAgenda`.
  Replace placeholder `agendaAgent` instructions with production system prompt.
- **Feature 22**: Replace `src/api-client-stub.ts` with `@iexcel/api-client`.
- **Observability**: Wire `OTEL_EXPORTER_OTLP_ENDPOINT` via
  `@mastra/observability` when that package is evaluated.
