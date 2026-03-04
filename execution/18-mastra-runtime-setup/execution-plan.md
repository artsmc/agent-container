# Execution Plan
# Feature 18: Mastra Runtime Setup

**Feature Name:** mastra-runtime-setup
**Total Tasks:** 47 across 10 phases
**Planned By:** planner-6
**Date:** 2026-03-03

---

## Strategic Analysis

### Complexity Review

- 47 tasks across 10 phases (Phase 0: Spike through Phase 10: Docs)
- Phase 0 (Spike) is a critical unblock — determines containerization strategy for Mastra alongside existing Nest.js API
- Phase 4 (Service Token Manager) is the most complex phase — implements OIDC Client Credentials Flow with token caching, refresh, and retry logic
- Phases 2, 3, 4 can run in parallel (package config, env config, service token are independent concerns)
- Phases 5, 6 can run in parallel (placeholder tools and placeholder agents are independent)
- Phases 8, 9, 10 can run in parallel (validation, Nx integration, documentation are independent)

### Dependency Analysis

**External dependencies:**
- Feature 00 (Project Setup) — monorepo structure must exist
- Feature 01 (Shared Types) — `@iexcel/shared-types` package
- Feature 06 (Auth) — OIDC provider configuration for service tokens

**Blocks:** Features 19, 20, 21 (all Mastra features depend on this runtime)

### Risk Flags

- Phase 0 spike findings may invalidate assumptions about Mastra server configuration
- Service Token Manager (Phase 4) has the most integration risk — depends on OIDC provider being configured
- Placeholder agents/tools (Phases 5-6) must match exact IDs that Features 19, 20, 21 will replace

---

## Execution Waves

### Wave A — Spike (Sequential, 1 sub-agent)

| Task | Phase | Description |
|------|-------|-------------|
| Phase 0 tasks | Phase 0 | Containerization spike — research and document Mastra deployment strategy |

### Wave B — Foundation (Parallel, 3 sub-agents)

| Sub-Agent | Phase | Description |
|-----------|-------|-------------|
| Sub-agent 1 | Phase 2 | Package configuration (package.json, tsconfig.json, project.json) |
| Sub-agent 2 | Phase 3 | Environment configuration (env.ts, validation, Zod schemas) |
| Sub-agent 3 | Phase 4 | Service Token Manager (OIDC client credentials, token cache, refresh) |

### Wave C — Core Components (Parallel, 2 sub-agents)

| Sub-Agent | Phase | Description |
|-----------|-------|-------------|
| Sub-agent 1 | Phase 5 | Placeholder tools (workflow-tools, task-tools, transcript-tools, agenda-tools) |
| Sub-agent 2 | Phase 6 | Placeholder agents (intake-agent, agenda-agent) |

### Wave D — Wiring (Sequential, 1 sub-agent)

| Task | Phase | Description |
|------|-------|-------------|
| Phase 7 tasks | Phase 7 | Mastra instance creation, API client wiring, agent/tool registration |

### Wave E — Verification (Parallel, 3 sub-agents)

| Sub-Agent | Phase | Description |
|-----------|-------|-------------|
| Sub-agent 1 | Phase 8 | Validation (type-check, lint, build, health endpoint test) |
| Sub-agent 2 | Phase 9 | Nx integration (implicit dependencies, affected graph, CI targets) |
| Sub-agent 3 | Phase 10 | Documentation (README, architecture notes, env template) |

---

## Sub-Agent Summary

| Wave | Sub-Agents | Parallelism |
|------|-----------|-------------|
| Wave A | 1 | Sequential |
| Wave B | 3 | Full parallel |
| Wave C | 2 | Full parallel |
| Wave D | 1 | Sequential |
| Wave E | 3 | Full parallel |
| **Total** | **10** | |
