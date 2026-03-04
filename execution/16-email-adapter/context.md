# Feature 16: Email Adapter

## Summary
Build the email adapter within the API layer for agenda distribution. Sends formatted agenda emails to configurable recipient lists using SendGrid or Resend. Manages delivery tracking. Called when POST /agendas/{id}/email is triggered, after lifecycle checks confirm the agenda is finalized.

## Phase
Phase 3 — External Integrations & Workflows

## Dependencies
- **Blocked by**: 14 (Agenda Endpoints — provides the email endpoint that triggers this adapter, enforces finalized status requirement), 09 (Client Management — client config provides default email_recipients)
- **Blocks**: None directly (this is a leaf adapter consumed by the agenda email endpoint)

## Source PRDs
- api-prd.md (External Service Adapters — Email Adapter, POST /agendas/{id}/email endpoint)

## Relevant PRD Extracts

### External Service Adapters (api-prd.md)

> - **Email Adapter** — Sends formatted agenda emails. Manages recipient lists and delivery tracking.
>
> Each adapter is isolated. Replacing Asana with Monday.com means swapping one adapter — nothing else changes.

### Email Endpoint (api-prd.md)

| Endpoint | Method | Description |
|---|---|---|
| `/agendas/{id}/email` | POST | Send agenda to recipients (body: optional recipient override) |

### Agenda Lifecycle (api-prd.md)

> - Agendas can only be shared or emailed if `status = finalized`.

### Clients Entity (database-prd.md)

| Field | Type | Description |
|---|---|---|
| `email_recipients` | JSONB | Default recipient list for agenda distribution |

### Audit Log (database-prd.md)

| Field | Type | Description |
|---|---|---|
| `action` | VARCHAR | e.g., `agenda.emailed` |
| `metadata` | JSONB | Additional context (e.g., recipient list for emails) |

## Scope

### In Scope
- Format agenda content into a professional email body (HTML email template)
- Send emails via SendGrid or Resend API
- Use the client's default `email_recipients` list from the client config
- Support recipient override via the request body (optional field on POST /agendas/{id}/email)
- Track delivery status (sent, delivered, failed) per recipient
- Return delivery status to the calling endpoint for audit logging
- Handle email provider API errors (rate limits, invalid addresses, bounces)
- Handle email provider authentication (API keys from secret manager)
- Adapter isolation — expose a clean interface so the provider can be swapped (e.g., SendGrid to Resend) without affecting callers

### Out of Scope
- Agenda lifecycle enforcement (that is feature 14 — the endpoint checks `status = finalized` before calling this adapter)
- Agenda content generation (that is feature 20 — Workflow B Agenda Agent)
- Email template design/branding (initial implementation uses a clean default; branding can be iterated)
- Bounce management and unsubscribe handling (future iteration)
- Scheduled/delayed email sending
- Email open and click tracking

## Key Decisions
- The adapter is isolated within the API layer following the adapter pattern described in api-prd.md. It exposes a clean interface (e.g., `sendAgendaEmail(agendaContent, recipients, options)`) that the agenda email endpoint calls.
- SendGrid or Resend is the email provider. The adapter abstracts the provider so switching is a single adapter swap.
- Recipient list resolution: the endpoint first checks the request body for an override list. If none is provided, it falls back to the client's default `email_recipients` JSONB field.
- Delivery tracking metadata (recipient list, delivery status per recipient) is included in the audit log entry for the `agenda.emailed` action.
- Email provider API keys are stored in the cloud secret manager and injected at runtime per the infra-prd.md secret management pattern.
- The terminal layer can trigger email sends but should always confirm the recipient list and content first (per terminal-prd.md interaction boundaries).
