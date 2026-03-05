# Project Brief

## Project Name
iExcel Automation

## Core Purpose
Automate the workflow from meeting transcripts to actionable tasks in project management tools (Asana). Processes meeting recordings/transcripts through AI agents to extract action items, generate agendas, and synchronize task status bidirectionally with Asana.

## Key Objectives
- Convert meeting transcripts (text, Grain recordings) into structured, normalized task lists
- AI-powered intake agent extracts tasks with context, assignees, priorities, and time estimates
- AI-powered agenda agent generates meeting agendas from reconciled task data
- Bidirectional status reconciliation between internal tasks and Asana
- Multi-client support with role-based access control
- Secure credential management for third-party integrations (Asana, Google Docs, Email)
- Output delivery via Google Docs and Email adapters
- Terminal/CLI access via MCP tools for Claude Code integration
- Full observability and audit logging

## Scope
### Included
- 39 features across 9 phases (all complete)
- Nx monorepo with 4 apps: API (Fastify), Auth, Mastra (AI agents), UI (Next.js)
- 8 shared packages: shared-types, database, api-client, auth-client, auth-database, terminal-auth, terminal-tools, ui-tokens
- Infrastructure: Terraform on GCP (Cloud SQL, Cloud Run, Artifact Registry)
- CI/CD pipeline with container builds

### Not Included (deferred)
- Composio integration (custom adapters used instead)
- Multi-PM-tool support beyond Asana (architecture supports it via `external_ref` JSONB)
- Grain API direct integration (V2 — Feature 37 uses manual paste/upload for V1)

## Success Criteria
- All 39 features implemented and tested (497+ tests in final waves alone)
- End-to-end flow: transcript upload → AI extraction → task creation → Asana push → status reconciliation → agenda generation
- Sub-30s workflow execution for typical meeting transcripts
- FedRAMP-aligned audit logging with encrypted credential storage
- Terminal MCP tools working in Claude Code for hands-free operation
