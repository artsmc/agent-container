# Technical Requirements
# Feature 16: Email Adapter

**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03

---

## 1. Implementation Strategy

### 1.1 Approach

The email adapter is a new module at `apps/api/src/adapters/email/`. It follows the same adapter pattern as Features 12 and 15: isolated directory, clean public interface, no direct database access, injectable credentials.

The adapter uses a provider abstraction internally so that SendGrid and Resend share the same call path. In V1, the active provider is determined by the `credentials.provider` field at runtime. Only one provider needs to be fully implemented — the abstraction means adding a second provider later is minimal work.

Implementation order:

1. Define all types: `AgendaEmailInput`, `EmailProviderCredentials`, `RecipientDeliveryStatus`, `EmailProviderAdapter`.
2. Implement `email-adapter-error.ts` — `EmailAdapterError` with typed error codes.
3. Implement `html-formatter.ts` — converts agenda content to HTML email template.
4. Implement `sendgrid-provider.ts` — SendGrid REST API integration.
5. Implement `resend-provider.ts` — Resend REST API integration.
6. Implement `adapter.ts` — `sendAgendaEmail` function that selects the provider and executes the send.
7. Wire the public export in `index.ts`.
8. Write unit tests for `html-formatter.ts`.
9. Write integration tests for both providers using mocked HTTP.

### 1.2 Technology Stack

| Concern | Tool | Notes |
|---|---|---|
| Language | TypeScript (strict mode) | Inherits from `apps/api/tsconfig.json` |
| Runtime | Node.js 22 LTS | Via the API application |
| SendGrid API | `@sendgrid/mail` npm package | Official SendGrid Node.js client. Abstracts REST calls. |
| Resend API | `resend` npm package | Official Resend Node.js client |
| HTML templating | String template literals | No templating library for V1. Pure TypeScript string composition. |
| Retry logic | `p-retry` | Same dependency as Features 12, 15 |
| Logger | Pino | Feature 07 pattern |
| Test framework | Vitest | Feature 07 configuration |
| HTTP mocking | `vi.mock('@sendgrid/mail')` and `vi.mock('resend')` | Mock at the SDK method level |

### 1.3 Module Directory Structure

```
apps/api/src/adapters/email/
├── index.ts                        # Public export: sendAgendaEmail
├── adapter.ts                      # Main orchestration: provider selection + send
├── html-formatter.ts               # Agenda content → HTML email body + subject line
├── sendgrid-provider.ts            # SendGrid SDK wrapper
├── resend-provider.ts              # Resend SDK wrapper
└── email-adapter-error.ts          # EmailAdapterError class
```

Co-located tests:

```
apps/api/src/adapters/email/__tests__/
├── html-formatter.test.ts
├── sendgrid-provider.test.ts
├── resend-provider.test.ts
└── adapter.integration.test.ts
```

---

## 2. Data Models

### 2.1 Input and Output Types

```typescript
// apps/api/src/adapters/email/adapter.ts

export interface AgendaEmailInput {
  agendaId: string;       // UUID
  shortId: string;        // e.g., "AGD-0015"
  content: string;        // Markdown content from agendas.content
  cycleStart: string;     // ISO date: "2026-02-17"
  cycleEnd: string;       // ISO date: "2026-02-28"
  clientName: string;     // e.g., "Total Life"
}

export interface EmailProviderCredentials {
  provider: 'sendgrid' | 'resend';
  apiKey: string;
  fromEmail: string;      // e.g., "noreply@iexcel.io"
  fromName: string;       // e.g., "iExcel Automation"
}

export interface RecipientDeliveryStatus {
  email: string;
  status: 'sent' | 'failed';
  providerMessageId: string | null;
  error: string | null;
}
```

### 2.2 Internal Provider Interface

```typescript
// Internal — not exported from index.ts

interface EmailProviderAdapter {
  send(
    to: string[],
    subject: string,
    htmlBody: string,
    credentials: EmailProviderCredentials
  ): Promise<RecipientDeliveryStatus[]>;
}
```

### 2.3 EmailAdapterError

```typescript
// apps/api/src/adapters/email/email-adapter-error.ts

export type EmailAdapterErrorCode =
  | 'NO_RECIPIENTS'
  | 'EMAIL_AUTH_FAILED'
  | 'EMAIL_TIMEOUT'
  | 'EMAIL_PROVIDER_UNAVAILABLE';

export class EmailAdapterError extends Error {
  readonly code: EmailAdapterErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: EmailAdapterErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'EmailAdapterError';
    this.code = code;
    this.details = details;
  }
}
```

---

## 3. HTML Formatter Implementation

### 3.1 Subject Line

```typescript
// apps/api/src/adapters/email/html-formatter.ts

export function buildEmailSubject(clientName: string, cycleStart: string, cycleEnd: string): string {
  const start = formatDateShort(cycleStart);  // e.g., "Feb 17"
  const end = formatDateLong(cycleEnd);        // e.g., "Feb 28, 2026"
  return `Running Notes — ${clientName} | ${start} to ${end}`;
}

function formatDateShort(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatDateLong(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
```

### 3.2 HTML Body Builder

```typescript
export function buildEmailHtml(input: AgendaEmailInput): string {
  const cycleLabel = `${formatDateShort(input.cycleStart)} to ${formatDateLong(input.cycleEnd)}`;
  const sections = parseAgendaSections(input.content);

  const sectionDefs: Array<{ label: string; content: string }> = [
    { label: 'Completed Tasks',     content: sections.completedTasks },
    { label: 'Incomplete Tasks',    content: sections.incompleteTasks },
    { label: 'Relevant Deliverables', content: sections.relevantDeliverables },
    { label: 'Recommendations',     content: sections.recommendations },
    { label: 'New Ideas',           content: sections.newIdeas },
    { label: 'Next Steps',          content: sections.nextSteps },
  ];

  const sectionsHtml = sectionDefs.map(({ label, content }) => {
    const bodyHtml = content.trim()
      ? markdownToHtml(content)
      : '<p><em>(No items this cycle)</em></p>';
    return `
      <h3 style="color: #333; border-bottom: 1px solid #eee; padding-bottom: 4px;">${escapeHtml(label)}</h3>
      ${bodyHtml}
    `;
  }).join('\n');

  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Running Notes — ${escapeHtml(input.clientName)}</title>
</head>
<body style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 24px; color: #222;">
  <h1 style="color: #111;">${escapeHtml(input.clientName)}</h1>
  <h2 style="color: #555; font-weight: normal;">${escapeHtml(cycleLabel)}</h2>
  <hr style="border: none; border-top: 2px solid #333; margin: 24px 0;" />

  ${sectionsHtml}

  <hr style="border: none; border-top: 1px solid #ccc; margin: 40px 0 16px;" />
  <p style="color: #999; font-size: 12px;">Sent by iExcel Automation | ${today}</p>
</body>
</html>`;
}
```

### 3.3 Markdown to HTML Converter

```typescript
function markdownToHtml(markdown: string): string {
  const lines = markdown.split('\n');
  const htmlLines: string[] = [];
  let inList = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        htmlLines.push('<ul>');
        inList = true;
      }
      const content = applyInlineFormatting(line.replace(/^[-*]\s+/, ''));
      htmlLines.push(`  <li>${content}</li>`);
    } else {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      htmlLines.push(`<p>${applyInlineFormatting(line)}</p>`);
    }
  }

  if (inList) {
    htmlLines.push('</ul>');
  }

  return htmlLines.join('\n');
}

function applyInlineFormatting(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

### 3.4 Section Parser (Reuse Pattern from Feature 15)

The section detection logic mirrors Feature 15's `content-parser.ts`. Ideally this is extracted to a shared utility in `apps/api/src/utils/agenda-content-parser.ts` and imported by both adapters. If Feature 15 has already implemented `parseAgendaContent`, import it; do not duplicate.

```typescript
// If Feature 15's parser is importable:
import { parseAgendaContent } from '../google-docs/content-parser.js';

// Otherwise implement locally as a private function
function parseAgendaSections(markdown: string): ParsedAgendaContent { ... }
```

---

## 4. SendGrid Provider Implementation

### 4.1 sendgrid-provider.ts

```typescript
// apps/api/src/adapters/email/sendgrid-provider.ts

import sgMail from '@sendgrid/mail';

export async function sendViaSendGrid(
  to: string[],
  subject: string,
  htmlBody: string,
  credentials: EmailProviderCredentials
): Promise<RecipientDeliveryStatus[]> {
  sgMail.setApiKey(credentials.apiKey);

  // SendGrid supports a `personalizations` array for multi-recipient sends in a single call
  const msg = {
    to,
    from: {
      email: credentials.fromEmail,
      name: credentials.fromName,
    },
    subject,
    html: htmlBody,
  };

  return withEmailRetry(async () => {
    try {
      const [response] = await sgMail.send(msg);

      // SendGrid returns 202 for accepted sends
      return to.map(email => ({
        email,
        status: 'sent' as const,
        providerMessageId: response.headers['x-message-id'] ?? null,
        error: null,
      }));
    } catch (err: unknown) {
      const statusCode = extractSendGridStatusCode(err);

      if (statusCode === 401 || statusCode === 403) {
        throw new EmailAdapterError('EMAIL_AUTH_FAILED', `SendGrid returned ${statusCode}`);
      }

      // Individual recipient errors are in the response body
      if (statusCode && statusCode >= 400 && statusCode < 500) {
        const errors = extractSendGridErrors(err);
        return resolvePartialFailures(to, errors);
      }

      throw err; // Retryable
    }
  });
}

function extractSendGridStatusCode(err: unknown): number | null {
  if (err && typeof err === 'object' && 'code' in err) {
    return (err as { code: number }).code ?? null;
  }
  return null;
}
```

---

## 5. Resend Provider Implementation

### 5.1 resend-provider.ts

```typescript
// apps/api/src/adapters/email/resend-provider.ts

import { Resend } from 'resend';

export async function sendViaResend(
  to: string[],
  subject: string,
  htmlBody: string,
  credentials: EmailProviderCredentials
): Promise<RecipientDeliveryStatus[]> {
  const resend = new Resend(credentials.apiKey);

  // Resend supports a single send to multiple recipients in the `to` array
  return withEmailRetry(async () => {
    const { data, error } = await resend.emails.send({
      from: `${credentials.fromName} <${credentials.fromEmail}>`,
      to,
      subject,
      html: htmlBody,
    });

    if (error) {
      if (error.statusCode === 401 || error.statusCode === 403) {
        throw new EmailAdapterError('EMAIL_AUTH_FAILED', `Resend returned ${error.statusCode}`);
      }
      if (error.statusCode === 429) {
        throw error; // Retryable
      }
      // Other errors: return failed status for all recipients
      return to.map(email => ({
        email,
        status: 'failed' as const,
        providerMessageId: null,
        error: error.message,
      }));
    }

    return to.map(email => ({
      email,
      status: 'sent' as const,
      providerMessageId: data?.id ?? null,
      error: null,
    }));
  });
}
```

---

## 6. Retry Wrapper

```typescript
// Shared within the email adapter module

import pRetry, { AbortError } from 'p-retry';

const MAX_RETRIES = 2; // 3 total attempts

async function withEmailRetry<T>(fn: () => Promise<T>): Promise<T> {
  return pRetry(fn, {
    retries: MAX_RETRIES,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 8000,
    randomize: true,
    shouldRetry: (err) => {
      // Do not retry auth errors or user errors — only provider unavailability
      if (err instanceof EmailAdapterError) return false;
      return true;
    },
  });
}
```

---

## 7. Main Adapter Orchestration

### 7.1 sendAgendaEmail Function

```typescript
// apps/api/src/adapters/email/adapter.ts

export async function sendAgendaEmail(
  input: AgendaEmailInput,
  recipients: string[],
  credentials: EmailProviderCredentials,
  logger: Logger
): Promise<RecipientDeliveryStatus[]> {
  const startMs = Date.now();

  // Guard: empty recipient list
  if (recipients.length === 0) {
    throw new EmailAdapterError('NO_RECIPIENTS', 'Recipient list is empty — no email sent.');
  }

  logger.info(
    { agendaId: input.agendaId, shortId: input.shortId, recipientCount: recipients.length },
    'Send started'
  );

  // Build email content
  const subject = buildEmailSubject(input.clientName, input.cycleStart, input.cycleEnd);
  const htmlBody = buildEmailHtml(input);

  // Select provider and send
  logger.debug({ agendaId: input.agendaId, provider: credentials.provider }, 'Provider call made');

  let statuses: RecipientDeliveryStatus[];

  if (credentials.provider === 'sendgrid') {
    statuses = await sendViaSendGrid(recipients, subject, htmlBody, credentials);
  } else {
    statuses = await sendViaResend(recipients, subject, htmlBody, credentials);
  }

  const totalSent = statuses.filter(s => s.status === 'sent').length;
  const totalFailed = statuses.filter(s => s.status === 'failed').length;

  logger.info(
    { agendaId: input.agendaId, totalSent, totalFailed },
    'Delivery status received'
  );

  // Log failures with redacted email (hash for correlation without exposure)
  for (const failed of statuses.filter(s => s.status === 'failed')) {
    logger.warn(
      { agendaId: input.agendaId, email: hashEmail(failed.email), error: failed.error },
      'Individual recipient failure'
    );
  }

  const durationMs = Date.now() - startMs;
  logger.info({ agendaId: input.agendaId, shortId: input.shortId, durationMs }, 'Send completed');

  return statuses;
}

// One-way hash for logging — allows correlation without exposing PII
function hashEmail(email: string): string {
  import { createHash } from 'node:crypto';
  return createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 12);
}
```

---

## 8. API Layer Integration

### 8.1 Call Site (Feature 14 — Agenda Email Endpoint)

Feature 14 owns `POST /agendas/{id}/email`. It performs recipient resolution and then calls this adapter.

```typescript
// Pseudocode — Feature 14 owns this handler
import { sendAgendaEmail } from '../adapters/email/index.js';

// Inside POST /agendas/{id}/email handler:

// Resolve recipients
const recipients = req.body.recipients?.length > 0
  ? req.body.recipients
  : client.emailRecipients ?? [];

// Fetch credentials from secret manager
const emailCredentials = await secretManager.get('EMAIL_PROVIDER_CONFIG');
const credentials: EmailProviderCredentials = JSON.parse(emailCredentials);

// Send
const deliveryStatuses = await sendAgendaEmail(
  {
    agendaId: agenda.id,
    shortId: agenda.shortId,
    content: agenda.content,
    cycleStart: agenda.cycleStart,
    cycleEnd: agenda.cycleEnd,
    clientName: client.name,
  },
  recipients,
  credentials,
  req.log
);

// Audit log
const totalSent = deliveryStatuses.filter(s => s.status === 'sent').length;
const totalFailed = deliveryStatuses.filter(s => s.status === 'failed').length;

await db.insert(auditLog).values({
  userId: req.user.id,
  action: 'agenda.emailed',
  entityType: 'agenda',
  entityId: agenda.id,
  metadata: {
    recipients: deliveryStatuses,
    totalSent,
    totalFailed,
  },
  source: 'ui',
});
```

### 8.2 Export from Adapter Index

```typescript
// apps/api/src/adapters/email/index.ts

export { sendAgendaEmail } from './adapter.js';
export type {
  AgendaEmailInput,
  EmailProviderCredentials,
  RecipientDeliveryStatus,
} from './adapter.js';
export { EmailAdapterError } from './email-adapter-error.js';
```

---

## 9. Testing Strategy

### 9.1 Unit Tests — html-formatter.ts

| Test Case | Description |
|---|---|
| Subject line format | `"Running Notes — Total Life \| Feb 17 to Feb 28, 2026"` |
| HTML contains client name H1 | `<h1>Total Life</h1>` present |
| HTML contains cycle date | Date range in H2 element |
| HTML contains all 6 section H3 headings | All sections present even if content empty |
| Missing section shows placeholder | `(No items this cycle)` in relevant section |
| Bullet list → `<ul><li>` | `- item` converts to `<li>item</li>` |
| Bold markers → `<strong>` | `**text**` converts to `<strong>text</strong>` |
| HTML special chars escaped | `<`, `>`, `&` in content are escaped |
| Footer present | Footer contains "Sent by iExcel Automation" |

### 9.2 Integration Tests — adapter.integration.test.ts

All tests mock the SDK clients using `vi.mock`.

| Test Suite | Scenarios |
|---|---|
| SendGrid happy path | Single recipient, multiple recipients, correct docId returned |
| Resend happy path | Single recipient, multiple recipients |
| Empty recipients | `EmailAdapterError('NO_RECIPIENTS')` thrown before any SDK call |
| SendGrid 401 | `EmailAdapterError('EMAIL_AUTH_FAILED')` |
| Resend 403 | `EmailAdapterError('EMAIL_AUTH_FAILED')` |
| 429 → success retry | Send succeeds after 1 retry |
| 429 exhausted | `EmailAdapterError('EMAIL_PROVIDER_UNAVAILABLE')` |
| 5xx → success retry | Send succeeds after 1 retry |
| Partial failure | One recipient failed, others sent; no exception |
| Email address hashing | Failed email in logs is hashed, not plain text |

---

## 10. New npm Dependencies

| Package | Type | Purpose |
|---|---|---|
| `@sendgrid/mail` | Runtime | SendGrid email SDK |
| `resend` | Runtime | Resend email SDK |

If the team decides to use only one provider in V1, install only that package. The adapter abstraction supports adding the second later.

---

## 11. Environment Variables

| Variable | Description | Source |
|---|---|---|
| `EMAIL_PROVIDER_CONFIG` | JSON string containing `{ provider, apiKey, fromEmail, fromName }` | Cloud secret manager |

The calling endpoint (Feature 14) fetches this secret and passes it to the adapter. The adapter does not read environment variables directly.

---

## 12. Performance Requirements

| Metric | Requirement |
|---|---|
| Total send latency | Under 5 seconds for up to 20 recipients |
| Provider timeout | 15 seconds per API call |
| Concurrent sends | Max 5 if fan-out is required (provider-specific) |

---

## 13. Security Considerations

| Concern | Requirement |
|---|---|
| API key logging | MUST NOT appear in any log output at any level |
| Email addresses in logs | MUST be hashed (SHA-256, first 12 chars) or fully redacted |
| Email content in logs | MUST NOT be logged at any level |
| HTML injection | `escapeHtml()` MUST be applied to all user-supplied fields inserted into the HTML template (clientName, section labels) |
| Recipient validation | V1 does not validate email address format before sending — the provider returns failures for invalid addresses |

---

## 14. Dependencies

### 14.1 Feature Dependencies

| Feature | What Is Needed |
|---|---|
| 07 (api-scaffolding) | Pino logger, error handling patterns, `p-retry` |
| 14 (agenda-endpoints) | Provides the `POST /agendas/{id}/email` endpoint; owns recipient resolution and audit log write |
| 09 (client-management) | `clients.email_recipients` JSONB field for default recipient list |

### 14.2 Downstream Dependents

None (leaf node).

---

## 15. Nx Integration

```bash
# Test
nx run api:test --testPathPattern=adapters/email

# Type check
nx run api:type-check

# Lint
nx run api:lint
```

---

## 16. Open Technical Questions

| Question | Impact | Recommendation |
|---|---|---|
| SendGrid or Resend as the V1 default provider? | Determines which SDK to install first and which integration test to prioritize | Recommend Resend for V1: simpler API, TypeScript-first SDK, faster setup. SendGrid remains the fallback if the team has an existing account. |
| Should `parseAgendaContent` be a shared utility imported by both Feature 15 and Feature 16, or duplicated? | Avoids logic drift if section detection patterns need to change | Extract to `apps/api/src/utils/agenda-content-parser.ts` and import in both adapters. This is a small refactor if Feature 15 is already merged. Coordinate with Feature 15 team. |
| Should recipient email addresses be stored in `email_recipients` as plain strings or as objects `{ email, name }` for display name support? | Affects the `from` field and `to` field construction in the provider SDK calls | If `{ email, name }` format, update `AgendaEmailInput.recipients` type accordingly. Current spec assumes plain string array for V1. |
| Should there be a per-agenda guard against duplicate email sends (e.g., a `last_emailed_at` timestamp)? | Prevents accidental double-sends | Feature 14 should track this. The adapter itself is stateless and does not prevent duplicate sends. |
