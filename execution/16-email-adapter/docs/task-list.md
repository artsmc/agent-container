# Task List
## Feature 16: Email Adapter

**Version:** 1.0
**Date:** 2026-03-03

---

## Prerequisites

Before beginning implementation, confirm the following are in place:

- [ ] Feature 07 (api-scaffolding) is complete — Fastify app, Pino logger, error handling patterns, `p-retry` dependency, Vitest setup are available
- [ ] Feature 14 (agenda-endpoints) is complete or in progress — `POST /agendas/{id}/email` endpoint exists and will call this adapter
- [ ] Feature 09 (client-management) is complete — client config includes `email_recipients` JSONB field for default recipient lists
- [ ] Decide on V1 email provider: SendGrid or Resend (see TR.md Section 16, open question). Install the chosen SDK package.
- [ ] Coordinate with Feature 15 (google-docs-adapter) team: determine if `parseAgendaContent` should be shared as a utility or duplicated locally
- [ ] Email provider API key is stored in the cloud secret manager

---

## Phase 1: Types and Error Classes

### Task 1.1 — Define adapter input/output types
**Complexity:** Small
**References:** TR.md Section 2.1, FRS.md FR-01, FR-02, FR-05

Create `apps/api/src/adapters/email/adapter.ts` (initial type definitions only):
- `AgendaEmailInput` interface: `agendaId`, `shortId`, `content`, `cycleStart`, `cycleEnd`, `clientName`
- `EmailProviderCredentials` interface: `provider` (`'sendgrid' | 'resend'`), `apiKey`, `fromEmail`, `fromName`
- `RecipientDeliveryStatus` interface: `email`, `status` (`'sent' | 'failed'`), `providerMessageId`, `error`

Also create `apps/api/src/adapters/email/` directory structure with placeholder `index.ts`.

**Verification:** Types compile without errors.

---

### Task 1.2 — Define internal provider interface
**Complexity:** Small
**References:** TR.md Section 2.2

In the adapter module (or a local `types.ts`):
- `EmailProviderAdapter` interface with `send(to, subject, htmlBody, credentials): Promise<RecipientDeliveryStatus[]>`

**Verification:** Interface compiles. Both provider implementations will conform to this shape.

---

### Task 1.3 — Implement `EmailAdapterError` class
**Complexity:** Small
**References:** TR.md Section 2.3, FRS.md FR-09

Create `apps/api/src/adapters/email/email-adapter-error.ts`:
- `EmailAdapterErrorCode` type: `'NO_RECIPIENTS' | 'EMAIL_AUTH_FAILED' | 'EMAIL_TIMEOUT' | 'EMAIL_PROVIDER_UNAVAILABLE'`
- `EmailAdapterError` class extending `Error` with `code`, `details`, and `name = 'EmailAdapterError'`

**Verification:** Error class instantiates with each code. `instanceof EmailAdapterError` works.

---

## Phase 2: HTML Email Template

### Task 2.1 — Implement section parser
**Complexity:** Small
**References:** TR.md Section 3.4, FRS.md FR-03

If Feature 15's `parseAgendaContent` is available as a shared utility:
- Import from `apps/api/src/utils/agenda-content-parser.ts` (or `../google-docs/content-parser.ts`)

If not, implement locally in `apps/api/src/adapters/email/html-formatter.ts`:
- Same 6-section detection using regex patterns (case-insensitive `## Completed Tasks`, etc.)
- Returns `ParsedAgendaContent` with one string per section

**Verification:** All 6 sections extracted correctly. Missing sections return empty string. Case-insensitive matching works.

---

### Task 2.2 — Implement `buildEmailSubject` function
**Complexity:** Small
**References:** TR.md Section 3.1, FRS.md FR-03

In `apps/api/src/adapters/email/html-formatter.ts`:
- `buildEmailSubject(clientName, cycleStart, cycleEnd)`: returns `"Running Notes — {clientName} | {start} to {end}"`
- Date formatting: `"Feb 17"` for start, `"Feb 28, 2026"` for end (UTC to avoid timezone issues)

**Verification:** `buildEmailSubject('Total Life', '2026-02-17', '2026-02-28')` returns `"Running Notes — Total Life | Feb 17 to Feb 28, 2026"`.

---

### Task 2.3 — Implement `buildEmailHtml` function
**Complexity:** Medium
**References:** TR.md Section 3.2, 3.3, FRS.md FR-03

In `apps/api/src/adapters/email/html-formatter.ts`:
- `buildEmailHtml(input: AgendaEmailInput)`: returns a full HTML document string
- HTML structure:
  - `<h1>` with client name
  - `<h2>` with cycle date range
  - Horizontal rule divider
  - 6 sections, each with `<h3>` heading and body content
  - Footer: "Sent by iExcel Automation | {current date}"
- `markdownToHtml(markdown)` converter:
  - `- item` / `* item` → `<ul><li>item</li></ul>`
  - `**bold**` → `<strong>bold</strong>`
  - `*italic*` → `<em>italic</em>`
  - Other text → `<p>` paragraphs
- `escapeHtml(text)` for XSS prevention: escape `<`, `>`, `&`, `"`
- Missing sections show `<em>(No items this cycle)</em>` placeholder
- Inline CSS styles (no external stylesheet — email clients require inline styles)

**Verification:**
- HTML contains `<h1>` with client name
- HTML contains all 6 `<h3>` section headings
- Bullet lists produce `<ul><li>` elements
- Bold markers produce `<strong>` tags
- Missing section shows placeholder text
- Footer contains "Sent by iExcel Automation"
- HTML entities are escaped in user-provided content

---

## Phase 3: Email Provider Implementations

### Task 3.1 — Implement SendGrid provider
**Complexity:** Medium
**References:** TR.md Section 4.1, FRS.md FR-04

Create `apps/api/src/adapters/email/sendgrid-provider.ts`:
- Uses `@sendgrid/mail` SDK (or native `fetch` to SendGrid REST API, per TR.md decision)
- `sendViaSendGrid(to, subject, htmlBody, credentials)`: Promise<RecipientDeliveryStatus[]>
- Supports multiple recipients in a single API call via `personalizations` array
- Returns `RecipientDeliveryStatus[]` with message ID from `X-Message-Id` header
- Error handling:
  - `401/403`: throw `EmailAdapterError('EMAIL_AUTH_FAILED')` — non-retryable
  - `429`: retryable via `p-retry`
  - `5xx`: retryable
  - Individual recipient rejection: mark as `failed`, do not throw
- Retry wrapper: `p-retry` with max 2 retries (3 total attempts), exponential back-off

**Verification:**
- Successful send returns `status: 'sent'` for all recipients
- 401 throws `EMAIL_AUTH_FAILED` immediately
- 429 retries and succeeds on next attempt
- All retries exhausted throws `EMAIL_PROVIDER_UNAVAILABLE`

---

### Task 3.2 — Implement Resend provider
**Complexity:** Medium
**References:** TR.md Section 5.1, FRS.md FR-04

Create `apps/api/src/adapters/email/resend-provider.ts`:
- Uses `resend` SDK (or native `fetch` to Resend REST API)
- `sendViaResend(to, subject, htmlBody, credentials)`: Promise<RecipientDeliveryStatus[]>
- Supports multiple recipients in the `to` array
- Returns `RecipientDeliveryStatus[]` with message ID from response
- Same error handling pattern as SendGrid provider (Task 3.1)
- Same retry wrapper

**Verification:** Same test scenarios as Task 3.1 but using Resend API shapes.

---

## Phase 4: Retry Wrapper

### Task 4.1 — Implement shared email retry utility
**Complexity:** Small
**References:** TR.md Section 6

Create a shared `withEmailRetry` function (used by both providers):
- `p-retry` with 2 retries (3 total attempts)
- Exponential back-off: 1s, 2s, 4s (factor 2, randomized)
- `shouldRetry`: returns `false` for `EmailAdapterError` instances (auth failures, empty recipients — these are not retryable)
- Returns `true` for all other errors (provider 429, 5xx, network)

**Verification:** Auth errors are not retried. Provider errors are retried up to 3 total attempts.

---

## Phase 5: Main Adapter Orchestration

### Task 5.1 — Implement `sendAgendaEmail` function
**Complexity:** Large
**References:** TR.md Section 7, FRS.md FR-01 through FR-10

Implement the main orchestration function in `apps/api/src/adapters/email/adapter.ts`:

1. Guard: if `recipients` array is empty, throw `EmailAdapterError('NO_RECIPIENTS')`
2. Log "Send started" with `agendaId`, `shortId`, `recipientCount`
3. Parse agenda content into sections (Task 2.1)
4. Build HTML email body (Task 2.3) and subject line (Task 2.2)
5. Select provider based on `credentials.provider` (`sendgrid` → Task 3.1, `resend` → Task 3.2)
6. Log "Provider call made" with provider name
7. Call provider `send` function
8. Log "Delivery status received" with `totalSent`, `totalFailed`
9. For each failed recipient: log warning with hashed email address (SHA-256, first 12 chars)
10. Log "Send completed" with `durationMs`
11. Return `RecipientDeliveryStatus[]`

**PII protection:** Use `hashEmail(email)` — `createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 12)` — for any email address that appears in log output.

**Verification:**
- Single recipient: email sent, 1 status returned
- Multiple recipients: all statuses returned
- Empty recipients: throws `NO_RECIPIENTS` before any provider call
- Partial failure: non-rejected recipients have `sent`, rejected have `failed`
- Provider selection: SendGrid credentials route to SendGrid, Resend to Resend
- Log output does not contain plain-text email addresses or API keys

---

### Task 5.2 — Wire public export in `index.ts`
**Complexity:** Small
**References:** TR.md Section 8.2

Create `apps/api/src/adapters/email/index.ts`:
- Export `sendAgendaEmail` from `adapter.ts`
- Export types: `AgendaEmailInput`, `EmailProviderCredentials`, `RecipientDeliveryStatus`
- Export `EmailAdapterError` from `email-adapter-error.ts`

**Verification:** Downstream consumers (Feature 14) can import all exported symbols.

---

## Phase 6: Testing

### Task 6.1 — Unit tests for `html-formatter.ts`
**Complexity:** Small
**References:** TR.md Section 9.1

Create `apps/api/src/adapters/email/__tests__/html-formatter.test.ts`:

Test cases:
- Subject line: `"Running Notes — Total Life | Feb 17 to Feb 28, 2026"`
- HTML contains `<h1>` with client name
- HTML contains cycle date range in `<h2>`
- HTML contains all 6 `<h3>` section headings
- Missing section shows `(No items this cycle)` placeholder
- Bullet lists → `<ul><li>` structure (no raw `- ` markers)
- Bold markers → `<strong>` tags
- Italic markers → `<em>` tags
- HTML special characters are escaped (`<script>` → `&lt;script&gt;`)
- Footer contains "Sent by iExcel Automation"

**Verification:** All tests pass.

---

### Task 6.2 — Unit tests for SendGrid provider
**Complexity:** Small
**References:** TR.md Section 9.2

Create `apps/api/src/adapters/email/__tests__/sendgrid-provider.test.ts`:

Mock the SendGrid SDK/fetch at the module level.

Test cases:
- Successful send: returns `status: 'sent'` with `providerMessageId`
- 401 auth failure: throws `EmailAdapterError('EMAIL_AUTH_FAILED')`
- 429 → 200 retry: succeeds after 1 retry
- 429 exhausted: throws `EmailAdapterError('EMAIL_PROVIDER_UNAVAILABLE')`
- 5xx → 200 retry: succeeds after 1 retry
- Timeout: throws error after 15s

**Verification:** All tests pass.

---

### Task 6.3 — Unit tests for Resend provider
**Complexity:** Small
**References:** TR.md Section 9.2

Create `apps/api/src/adapters/email/__tests__/resend-provider.test.ts`:

Same test cases as Task 6.2 but against the Resend provider implementation.

**Verification:** All tests pass.

---

### Task 6.4 — Integration tests for main adapter
**Complexity:** Medium
**References:** TR.md Section 9.2, GS.md

Create `apps/api/src/adapters/email/__tests__/adapter.integration.test.ts`:

Mock provider SDK/fetch calls.

Test suites:
- Single recipient happy path: 1 status with `'sent'`
- Multiple recipients happy path: all `'sent'`
- Empty recipients: `EmailAdapterError('NO_RECIPIENTS')` thrown before any SDK call
- Partial failure: 1 sent, 1 failed — no exception thrown
- Provider routing: SendGrid credentials → SendGrid called; Resend credentials → Resend called
- Subject line contains client name and cycle dates
- HTML body contains all 6 section headings
- Missing section in content → `(No items this cycle)` in HTML
- API key not present in any log event
- Email addresses in log output are hashed (not plain text)
- Agenda content not present in any log event
- Adapter does not execute any database queries

**Verification:** All integration tests pass.

---

### Task 6.5 — Verify adapter isolation
**Complexity:** Small
**References:** FRS.md Section 4, GS.md adapter isolation scenarios

Add a test verifying:
- No Drizzle or SQL queries are executed inside the adapter
- All data is sourced from function parameters
- Switching from `'sendgrid'` to `'resend'` in credentials requires no code changes in the caller

**Verification:** Adapter is stateless and provider-swappable.

---

## Summary

| Phase | Tasks | Complexity |
|---|---|---|
| 1: Types and Error Classes | 1.1, 1.2, 1.3 | Small, Small, Small |
| 2: HTML Email Template | 2.1, 2.2, 2.3 | Small, Small, Medium |
| 3: Email Provider Implementations | 3.1, 3.2 | Medium, Medium |
| 4: Retry Wrapper | 4.1 | Small |
| 5: Main Adapter Orchestration | 5.1, 5.2 | Large, Small |
| 6: Testing | 6.1, 6.2, 6.3, 6.4, 6.5 | Small, Small, Small, Medium, Small |

**Total estimated complexity:** 1 Large task (main orchestration), 3 Medium tasks (HTML builder, SendGrid provider, Resend provider), remainder Small.

**Critical path:** Task 1.1 → 1.2 → 1.3 → 2.1 → 2.2 → 2.3 → 4.1 → 3.1 or 3.2 (providers can be built in parallel) → 5.1 → 5.2 → 6.1 → 6.2 → 6.3 → 6.4.

**Parallelization opportunity:** Tasks 3.1 (SendGrid) and 3.2 (Resend) can be built in parallel by different developers since they share only the `EmailProviderAdapter` interface and `withEmailRetry` utility. If only one provider is needed for V1, defer the other to a follow-up task.

**Provider decision:** If the team decides to implement only one provider for V1, skip the deferred provider's Task 3.x and Task 6.x but keep the `EmailProviderAdapter` interface so the second provider can be added later without changing the adapter's public API.
