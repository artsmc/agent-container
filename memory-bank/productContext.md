# Product Context

## User Problems
- Meeting action items get lost or forgotten after calls
- Manual transcription of tasks from meetings is time-consuming and error-prone
- Task status across meetings and Asana drifts out of sync
- Preparing meeting agendas requires manually reviewing all open/completed tasks
- Non-technical users need a web UI; power users want terminal/CLI access

## Solution Approach
- **Input Normalization**: Accept transcripts from multiple sources (text paste, file upload, Grain recordings) and normalize to a unified `NormalizedTranscript` format
- **AI-Powered Extraction**: Mastra intake agent (LLM-backed) processes transcripts to extract structured tasks with context, assignees, priorities, and time estimates
- **Task Management**: Full CRUD for tasks with short IDs (e.g., `TSK-001`), batch operations, and approval workflows (draft → approved → pushed)
- **Asana Integration**: Output normalizer pushes approved tasks to Asana; status reconciliation pulls completion status back
- **Agenda Generation**: Mastra agenda agent creates meeting agendas from reconciled task data, delivered via Google Docs and Email
- **MCP Tools**: Terminal access via Mastra MCP server and terminal MCP tools for Claude Code integration

## User Experience Goals
- One-click transcript submission triggers full automated pipeline
- Review and approve/reject AI-extracted tasks before they reach Asana
- Real-time workflow status visibility in dashboard
- Shared agenda links for meeting participants
- Admin settings for client management, Asana credentials, and user roles

## Key Features
- Transcript upload with multi-source normalization (text, Grain)
- AI intake agent: transcript → structured tasks
- AI agenda agent: reconciled tasks → meeting agenda
- Task review UI with batch approve/reject
- Asana bidirectional sync (push tasks, pull status)
- Google Docs and Email delivery adapters
- Workflow orchestration with status tracking
- Historical import from existing Asana projects
- Terminal MCP tools (10 tools with user token passthrough)
- Role-based access: admin, user roles with client-level permissions
- Audit logging for compliance
