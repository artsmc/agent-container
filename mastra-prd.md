# Mastra Agent System — Product Requirements Document

## Overview

Build an agent-powered automation system using [Mastra](https://mastra.ai) that streamlines iExcel's client management cycle. The system handles two core workflows tied to the weekly client call cadence. Mastra is the **agent orchestration layer only** — it does not own business logic, data persistence, or external service integrations. Those responsibilities belong to the [API layer](./api-prd.md) and [database](./database-prd.md).

## Problem Statement

iExcel account managers manually build Asana tickets from call transcripts and manually compile status update documents ("Running Notes") before follow-up calls. This process is repetitive, time-consuming, and dependent on a single person's interpretation of call content.

## System Context

- All client and internal calls are recorded via **Grain**, with transcripts available per call.
- Each client has a dedicated Grain "playlist" (folder of calls).
- After each client call, an internal **"intake" call** is held to discuss action items.
- Tasks are managed in **Asana** with custom fields (Client, Scrum Stage, Estimated Time).
- Status updates are delivered via **"Running Notes"** documents in Google Docs.

---

## Workflows

### Workflow A: Post-Intake → Build Tickets

**Trigger:** Manual (account manager initiates after intake call)

**Input:** Grain call transcript (intake call)

**Process:**
1. Parse transcript for action items assigned to iExcel team members.
2. Generate structured Asana tasks with:
   - **Description** formatted as:
     - Task Context — conversational summary with transcript quotes and call dates
     - Additional Context — related, external, or historical factors
     - Requirements — tools, steps, and specifics needed to execute
   - **Custom Fields:**
     - Client (e.g., `Total Life`)
     - Scrum Stage (`Backlog`)
     - Estimated Time (`hh mm` format, based on industry best practices)
3. Output tasks via Asana API (or CSV export as fallback).

**Output:** Asana tasks created for the respective client project.

### Workflow B: Pre-Call → Build Agenda

**Trigger:** Manual or scheduled (before the next client follow-up call)

**Prerequisite:** Completed tasks must exist in Asana for the client since the last cycle. If no completed tasks are found, the system should warn the user rather than generate an empty agenda.

**Input:** Completed Asana tasks for the respective client.

**Process:**
1. Pull completed tasks from Asana, filtered by client.
2. Group and summarize tasks by **theme/project** (not a raw data dump).
3. Compile into the Running Notes format:
   - Completed Tasks
   - Incomplete Tasks
   - Relevant Deliverables
   - Recommendations
   - New Ideas
   - Next Steps
4. Output to Google Docs via API.

**Output:** Running Notes document ready for the client follow-up call.

---

## Architecture

### Platform

**Mastra** serves as the **agent orchestration layer**, providing:
- **Agents** — LLM-powered agents for transcript interpretation and task summarization.
- **Tools** — Mastra tools that call the [API layer](./api-prd.md). Mastra does **not** talk to Grain, Asana, or Google Docs directly.
- **Workflows** — Step-by-step pipelines for each automation track.

### How Mastra Interacts with the System

Mastra agents are invoked by the API layer when a workflow is triggered. The agent does its LLM work (parsing, summarizing) and writes results back to the API:

```
Consumer triggers workflow → API layer → invokes Mastra agent
Mastra agent processes transcript → calls API to save draft tasks
Mastra agent builds agenda → calls API to save draft agenda
```

Mastra has its own backend for agent orchestration, observability, and runtime management. Business data (tasks, agendas, clients) lives in the [PostgreSQL database](./database-prd.md), accessed through the [API layer](./api-prd.md).

### MCP Server

Mastra exposes an MCP server for AI-native access from Claude Code and Claw. MCP tool calls route through the [API layer](./api-prd.md) — Mastra does not serve business data directly. See [`terminal-prd.md`](./terminal-prd.md) for details.

### Authentication & Security

Authentication is handled by the [Auth Service](./auth-prd.md). Mastra participates in two auth flows:

**Service-to-Service (Mastra → API):**
- Mastra is registered as OIDC client `mastra-agent` (confidential client).
- Uses the **client credentials flow** to obtain access tokens from the auth service.
- Tokens are attached to all API calls Mastra makes to save draft tasks, agendas, etc.

**User Context (Terminal → Mastra MCP):**
- When a user calls Mastra via MCP, their auth token (obtained via device flow — see [`terminal-prd.md`](./terminal-prd.md)) is passed through.
- Mastra forwards the user's token to the API so actions are scoped to the user's permissions.

**Security Layers:**

| Layer | Implementation |
|---|---|
| **Authentication** | OIDC tokens from the [Auth Service](./auth-prd.md) |
| **Authorization** | User tokens scoped to specific clients via product permissions in the API |
| **Service identity** | Mastra's own client credentials for autonomous API calls |
| **Request logging** | Every agent call logged (who, what, when) |
| **Rate limiting** | Prevent abuse from runaway agent sessions |
| **Human-in-the-loop** | Optional approval gate for sensitive operations |

---

## System Architecture

Mastra is one layer in a five-layer system:

| Layer | PRD | Responsibility |
|---|---|---|
| **Auth** | [`auth-prd.md`](./auth-prd.md) | Identity, SSO, OIDC tokens — platform-level |
| **Database** | [`database-prd.md`](./database-prd.md) | Source of truth — all business data persists here |
| **API** | [`api-prd.md`](./api-prd.md) | Business logic, authorization, external service adapters |
| **Mastra** | (this doc) | Agent orchestration — LLM workflows only |
| **Web UI** | [`ui-prd.md`](./ui-prd.md) | Human interaction — approval, collaboration, sharing |
| **Terminal** | [`terminal-prd.md`](./terminal-prd.md) | AI-native access via MCP/API |

### Data Flow

```
┌──────────┐  ┌──────────┐
│  Web UI  │  │ Terminal  │
└────┬─────┘  └────┬──────┘
     │             │
     └──────┬──────┘
            │
            ▼
     ┌──────────────┐       ┌──────────┐
     │  API LAYER   │◄─────►│  MASTRA  │
     │              │       │ (agents) │
     └──────┬───────┘       └──────────┘
            │
     ┌──────┴───────┐
     │              │
     ▼              ▼
┌──────────┐  ┌───────────────┐
│ Postgres │  │ External Svcs │
│          │  │ Asana, Grain, │
│          │  │ GDocs, Email  │
└──────────┘  └───────────────┘
```

Mastra talks to the API. The API talks to the database and external services. Mastra never touches Postgres, Asana, Grain, or Google Docs directly.

---

## Historical Reprocessing

When a returning client is reactivated, the API may invoke Mastra to **reprocess old transcripts** from a previous engagement. This is the same Workflow A logic (transcript → tasks) applied retroactively to historical Grain recordings. The output is saved as imported historical records in the database, giving the agent full context before the first new intake call. See [`database-prd.md`](./database-prd.md) for import schema details and [`api-prd.md`](./api-prd.md) for the import endpoints.

---

## Guardrails

- **Intake vs. Follow-up disambiguation:** Workflow A is always manually triggered. Workflow B validates that completed tasks exist before generating output. If none exist, it surfaces a warning instead of producing an empty document.
- **Data scoping:** All queries are scoped to a specific client. No cross-client data leakage.
- **Prompt structure:** Task descriptions use a defined template to ensure consistency regardless of which account manager triggers the workflow.

---

## Open Questions

- [ ] Does Grain have an API for pulling transcripts programmatically, or is copy-paste the input method?
- [ ] Should Workflow B also pull incomplete/in-progress tasks from Asana for the "Incomplete Tasks" section?
- [ ] What is the desired cadence — weekly per client, or variable?
- [ ] Are there additional custom fields in Asana beyond Client, Scrum Stage, and Estimated Time?
- [ ] Should the Running Notes doc append to an existing Google Doc per client, or create a new one each cycle?
