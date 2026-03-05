# Feature 18: Mastra Runtime Setup — Task Update

## Summary

Implemented the `apps/mastra` runtime package for the iExcel Automation platform.
This establishes the Mastra AI agent framework runtime with placeholder agents and
tools that Features 19 and 20 will flesh out.

## Work Accomplished

### Phase 1 — Package Configuration
- Created `apps/mastra/package.json` (`@iexcel/mastra`, `type: module`)
- Created `apps/mastra/tsconfig.json` (extends `tsconfig.base.json`, `noEmit: true`,
  `moduleResolution: bundler`). Intentionally omits `rootDir` to avoid TypeScript
  errors when the compiler resolves monorepo workspace path aliases that point outside
  the `src/` directory.
- Updated `apps/mastra/project.json` with `build`, `serve`, `type-check`, and `lint`
  targets. Build and serve delegate to the `mastra` CLI (`mastra build` / `mastra dev`).
- Created directory tree: `src/agents/`, `src/tools/`, `src/auth/`, `src/config/`

### Phase 2 — Environment Configuration
- `src/config/env.ts`: Zod-validated env schema covering API URLs, auth credentials,
  LLM config, server config, and OTEL. Side-effects: injects `OPENAI_API_KEY` or
  `ANTHROPIC_API_KEY` into `process.env` based on `LLM_PROVIDER`.
- `apps/mastra/.env.example`: Documented all env vars with descriptions.

### Phase 3 — Service Token Manager
- `src/auth/service-token.ts`: Thin wrapper over `createClientCredentialsClient`
  from `@iexcel/auth-client`. Adds `initialize()` with 3 retries (5s apart) and a
  stable `getToken()` accessor. The underlying client handles caching and deduplication.

### Phase 4 — Placeholder Tools
- `src/tools/task-tools.ts`: `createDraftTasks`, `getTask`, `listTasksForClient`
- `src/tools/transcript-tools.ts`: `getTranscript`, `listTranscriptsForClient`
- `src/tools/agenda-tools.ts`: `createDraftAgenda`, `getAgenda`
- `src/tools/index.ts`: Central re-export
- All `execute` functions throw `'Not implemented — see feature N'`

### Phase 5 — Placeholder Agents
- `src/agents/intake-agent.ts`: `intakeAgent` with transcript + task tools
- `src/agents/agenda-agent.ts`: `agendaAgent` with task + agenda tools
- `src/agents/index.ts`: Re-exports
- Model specified as `{ id: "<provider>/<model>" }` via `OpenAICompatibleConfig`
  shape, populated from `env.LLM_PROVIDER` and `env.LLM_MODEL` at runtime.

### Phase 6 — API Client Stub
- `src/api-client-stub.ts`: `createApiClient()` returning a typed stub with
  placeholder methods that throw `'Not implemented — see Feature 22'`.

### Phase 7 — Main Entry Point
- `src/index.ts`: Top-level module that boots in sequence: env validation →
  `ServiceTokenManager.initialize()` → API client stub → `new Mastra({...})`.
  Exports `export const mastra` per Mastra's framework discovery convention.

### Documentation
- `apps/mastra/SPIKE.md`: Documents Mastra version, CLI build approach, model config,
  container notes, and all pending TODOs per feature.

## Important Notes for Reviewer

1. **`rootDir` intentionally absent** from `tsconfig.json`. Adding `rootDir: "src"`
   causes TS6059 errors because TypeScript resolves `@iexcel/auth-client` path aliases
   to files in `packages/auth-client/src/` which are outside `src/`. The `noEmit: true`
   flag makes this safe — Mastra's own bundler handles compilation.

2. **Top-level `await`** in `src/index.ts` is intentional. Mastra's file-based
   convention requires the module to be fully initialised before the framework
   discovers the exported `mastra` instance. The `"module": "ES2022"` compiler option
   enables this.

3. **Model format**: Mastra's model router accepts `ModelRouterModelId` strings for
   known models. For arbitrary model versions (e.g., `claude-sonnet-4-20250514`), the
   `OpenAICompatibleConfig` `{ id: "provider/model" }` shape is used. This is
   intentional and type-safe.

4. **`@mastra/core@^1.9.0` peer dep**: Zod `^3.23` is specified in `package.json`.
   `@mastra/core@1.9.0` lists `zod: "^3.25.0 || ^4.0.0"` as a peer dependency. The
   version range `^3.23` satisfies this because `^3.25` is included. If Mastra moves
   to zod v4 exclusively, bump to `"zod": "^4.0.0"`.

5. **Lint**: Zero ESLint errors. Zero TypeScript errors.
