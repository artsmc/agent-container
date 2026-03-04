# Functional Requirement Specification
# Feature 16: Email Adapter

**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03

---

## 1. Overview

The email adapter is a module within `apps/api/src/adapters/email/`. It exposes a single primary function `sendAgendaEmail(input, recipients, credentials, logger)` that the agenda email endpoint (Feature 14) calls when `POST /agendas/{id}/email` is triggered. The adapter sends an HTML email to each recipient and returns a per-recipient delivery status report.

---

## 2. Functional Requirements

### FR-01: Accept Structured Email Input

**Requirement:** The adapter's primary function must accept an `AgendaEmailInput` object containing:
- `agendaId` — UUID
- `shortId` — e.g., `AGD-0015`
- `content` — agenda content (markdown, as stored in `agendas.content`)
- `cycleStart` — ISO date string (e.g., `"2026-02-17"`)
- `cycleEnd` — ISO date string (e.g., `"2026-02-28"`)
- `clientName` — string (used in email subject and body header)

---

### FR-02: Accept Recipient List

**Requirement:** The adapter must accept a `string[]` of recipient email addresses. The calling endpoint (Feature 14) is responsible for resolving the final recipient list using this precedence:

1. If the `POST /agendas/{id}/email` request body contains a `recipients` array, use that.
2. Otherwise, use the client's `email_recipients` JSONB field from the `clients` table.

The adapter does not perform recipient resolution — it receives the already-resolved list.

**Validation:** If the recipient list is empty, the adapter MUST throw an `EmailAdapterError` with code `NO_RECIPIENTS`.

---

### FR-03: Format HTML Email Body

**Requirement:** The adapter MUST generate an HTML email body from the agenda content. The email format:

**Subject line:** `"Running Notes — {clientName} | {cycleStart formatted} to {cycleEnd formatted}"`
Example: `"Running Notes — Total Life | Feb 17 to Feb 28, 2026"`

**HTML body structure:**
```
[Header]          — Client name as H1, cycle date range as H2 subtitle
[Divider]
[Completed Tasks] — H3 heading + content
[Incomplete Tasks] — H3 heading + content
[Relevant Deliverables] — H3 heading + content
[Recommendations] — H3 heading + content
[New Ideas]       — H3 heading + content
[Next Steps]      — H3 heading + content
[Footer]          — Sent by iExcel Automation | {current date}
```

**Markdown conversion:** Markdown `- item` / `* item` → HTML `<ul><li>` list items. Markdown `**bold**` → `<strong>`. Markdown `*italic*` → `<em>`. All other markdown rendered as plain `<p>` paragraphs.

**Missing sections:** If a section is absent from the agenda content, the section heading is included with a placeholder: `<em>(No items this cycle)</em>`.

---

### FR-04: Send via Email Provider

**Requirement:** The adapter MUST send the email using an email provider SDK or REST API. The provider is either SendGrid or Resend, determined by which API key is injected at runtime (see FR-08). Both providers support per-recipient individual sends via their batch API.

**Sending strategy:** Send to all recipients in a single API call if the provider supports batch/bulk sending. If the provider only supports single-recipient sends, fan out with concurrent calls (max 5 concurrent to avoid rate limits).

**From address:** Configurable via the injected provider credentials — typically `noreply@iexcel.io` or similar. Not hardcoded in the adapter.

---

### FR-05: Return Per-Recipient Delivery Status

**Requirement:** The adapter MUST return a `RecipientDeliveryStatus[]` array containing one entry per recipient:

```typescript
interface RecipientDeliveryStatus {
  email: string;
  status: 'sent' | 'failed';
  providerMessageId: string | null;  // Provider's message ID if available
  error: string | null;              // Error description if failed
}
```

**Status semantics:**
- `'sent'` — the provider accepted the message for delivery. The adapter does not wait for delivery confirmation (that would require webhooks, which are out of scope).
- `'failed'` — the provider rejected the message (invalid address, domain not found, etc.).

If the provider rejects a single recipient but accepts others, the adapter MUST still return statuses for all recipients (partial success is valid).

---

### FR-06: Recipient Override Support

**Requirement (delegated to Feature 14):** The adapter itself accepts only the already-resolved recipient list. The override logic lives in Feature 14's endpoint handler:

```
if (req.body.recipients?.length > 0) {
  use req.body.recipients
} else {
  use client.email_recipients from database
}
```

The adapter is agnostic to whether the list came from the request body or the client default.

---

### FR-07: Track Delivery in Audit Log

**Requirement (delegated to Feature 14):** The adapter returns `RecipientDeliveryStatus[]`. Feature 14's handler is responsible for writing the audit log entry:

```
action: 'agenda.emailed'
entity_type: 'agenda'
entity_id: agendaId
metadata: {
  recipients: [{ email, status, providerMessageId, error }],
  totalSent: N,
  totalFailed: N
}
```

The adapter's responsibility is only to return accurate delivery status data.

---

### FR-08: Email Provider Authentication

**Requirement:** The adapter accepts a `EmailProviderCredentials` object containing:
- `provider` — `'sendgrid' | 'resend'`
- `apiKey` — string

The API key is retrieved from the cloud secret manager by the calling endpoint (Feature 14) and passed to the adapter. The adapter MUST NOT read environment variables or the database directly.

---

### FR-09: Error Handling

**Requirement:** The adapter MUST handle email provider API errors as follows:

| Error | Behavior |
|---|---|
| Empty recipient list | Throw `EmailAdapterError` with code `NO_RECIPIENTS` before any API call |
| `401 / 403` (invalid API key) | Throw `EmailAdapterError` with code `EMAIL_AUTH_FAILED`. Do not retry. |
| `429` (rate limit) | Retry up to 3 times with exponential back-off |
| `5xx` (provider server error) | Retry up to 3 times with exponential back-off |
| Network timeout (>15s) | Throw `EmailAdapterError` with code `EMAIL_TIMEOUT` |
| All retries exhausted | Throw `EmailAdapterError` with code `EMAIL_PROVIDER_UNAVAILABLE` |
| Individual recipient rejected by provider | Mark that recipient `failed` in status — do not throw |

---

### FR-10: Logging

**Requirement:** The adapter MUST emit structured Pino log events at:

| Event | Level | Fields |
|---|---|---|
| Send started | `info` | `agendaId`, `shortId`, `recipientCount` |
| Provider call made | `debug` | `agendaId`, `provider` |
| Delivery status received | `info` | `agendaId`, `totalSent`, `totalFailed` |
| Individual recipient failure | `warn` | `agendaId`, `email` (hashed or redacted), `error` |
| Provider API retry | `warn` | `agendaId`, `attempt`, `statusCode` |
| Send completed | `info` | `agendaId`, `shortId`, `durationMs` |

**PII in logs:** Recipient email addresses MUST NOT appear in plain text in log output. If email addresses need to be logged (e.g., for failure diagnosis), they MUST be hashed (SHA-256, one-way) or redacted to `[redacted]`.

**Email content** MUST NOT be logged at any level.

**API key** MUST NOT be logged at any level.

---

## 3. Caller Interface

```typescript
async function sendAgendaEmail(
  input: AgendaEmailInput,
  recipients: string[],
  credentials: EmailProviderCredentials,
  logger: Logger
): Promise<RecipientDeliveryStatus[]>
```

---

## 4. Non-Functional Requirements

| Requirement | Specification |
|---|---|
| Sends are immediate | No scheduling or delay queue in V1 |
| Idempotency | Calling send twice sends the email twice — the calling endpoint controls whether to prevent duplicate sends |
| Timeout budget | Total send operation must complete within 15 seconds |
| Adapter isolation | Switching from SendGrid to Resend requires only this adapter's internal implementation change |
| Max concurrent outgoing calls | 5 concurrent provider API calls if fan-out is required |
