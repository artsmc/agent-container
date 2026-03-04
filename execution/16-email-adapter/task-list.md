# Task List
# Feature 16: Email Adapter

**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03
**Blocked by:** Feature 14 (agenda-endpoints), Feature 09 (client-management)
**Blocks:** None (leaf node)

---

## Prerequisites Checklist

Before starting this feature, confirm:
- [ ] Feature 14 is merged and `POST /agendas/{id}/email` handler exists (stub is acceptable)
- [ ] Confirm email provider choice for V1 (SendGrid or Resend). Recommendation: Resend for simpler TypeScript-first API. (References: TR.md Section 16 Open Questions)
- [ ] Confirm `clients.email_recipients` JSONB field exists and is populated by Feature 09
- [ ] Confirm secret name in cloud secret manager (e.g., `EMAIL_PROVIDER_CONFIG`)
- [ ] Confirm whether Feature 15 has already implemented `parseAgendaContent` — if so, extract to shared utility rather than duplicating. (References: TR.md Section 16 Open Questions)
- [ ] Confirm `from` email address to use (e.g., `noreply@iexcel.io`) and whether domain is verified with the email provider

---

## Phase 1: Type Definitions and Error Class

- [ ] **Define `AgendaEmailInput` interface** in `apps/api/src/adapters/email/adapter.ts`
  - Fields: agendaId, shortId, content, cycleStart, cycleEnd, clientName
  - References: FRS.md Section FR-01, TR.md Section 2.1

- [ ] **Define `EmailProviderCredentials` interface**
  - Fields: provider ('sendgrid' | 'resend'), apiKey, fromEmail, fromName
  - References: FRS.md Section FR-08, TR.md Section 2.1

- [ ] **Define `RecipientDeliveryStatus` interface**
  - Fields: email, status ('sent' | 'failed'), providerMessageId (string | null), error (string | null)
  - References: FRS.md Section FR-05, TR.md Section 2.1

- [ ] **Define internal `EmailProviderAdapter` interface** (not exported)
  - `send(to, subject, htmlBody, credentials): Promise<RecipientDeliveryStatus[]>`
  - References: TR.md Section 2.2

- [ ] **Implement `EmailAdapterError` class** in `email-adapter-error.ts`
  - Error codes: `NO_RECIPIENTS`, `EMAIL_AUTH_FAILED`, `EMAIL_TIMEOUT`, `EMAIL_PROVIDER_UNAVAILABLE`
  - References: FRS.md Section FR-09, TR.md Section 2.3

---

## Phase 2: Content Parsing (Shared or Local)

- [ ] **Determine if `parseAgendaContent` from Feature 15 can be shared**
  - If Feature 15 is merged: extract `parseAgendaContent` to `apps/api/src/utils/agenda-content-parser.ts` and update Feature 15's import
  - If Feature 15 is not yet merged: implement locally as a private function in `html-formatter.ts`
  - References: TR.md Section 3.4, TR.md Section 16 Open Questions

- [ ] **Implement or import the section parser** — detects all 6 Running Notes sections in markdown content
  - References: FRS.md Section FR-03

---

## Phase 3: HTML Formatter

- [ ] **Implement `buildEmailSubject` function** in `html-formatter.ts`
  - Format: `"Running Notes — {clientName} | {cycleStart formatted} to {cycleEnd formatted}"`
  - References: FRS.md Section FR-03, TR.md Section 3.1

- [ ] **Implement `formatDateShort` and `formatDateLong` helpers**
  - Convert ISO date strings to human-readable formats (UTC-safe)
  - References: TR.md Section 3.1

- [ ] **Implement `markdownToHtml` function** in `html-formatter.ts`
  - Convert `- item` / `* item` to `<ul><li>` list items
  - Convert `**bold**` to `<strong>`
  - Convert `*italic*` to `<em>`
  - Convert `` `code` `` to `<code>`
  - Plain lines → `<p>` paragraphs
  - Track list open/close state correctly
  - References: FRS.md Section FR-03, TR.md Section 3.3

- [ ] **Implement `escapeHtml` function**
  - Escape `&`, `<`, `>`, `"` in user-supplied strings before inserting into HTML template
  - References: TR.md Section 13

- [ ] **Implement `buildEmailHtml` function** in `html-formatter.ts`
  - Parse sections using `parseAgendaSections`
  - Build full HTML document: H1 client name, H2 cycle dates, divider, 6 sections, footer
  - Use `(No items this cycle)` placeholder for empty sections
  - Apply `markdownToHtml` to section content
  - Apply `escapeHtml` to clientName and section labels
  - Include footer with "Sent by iExcel Automation | {current date}"
  - References: FRS.md Section FR-03, TR.md Section 3.2

---

## Phase 4: Provider Implementations

- [ ] **Install chosen email provider npm package(s)** in `apps/api/package.json`
  - `resend` and/or `@sendgrid/mail`
  - References: TR.md Section 10

- [ ] **Implement `sendViaResend` function** in `resend-provider.ts` (if Resend is the chosen provider)
  - Initialize `new Resend(credentials.apiKey)`
  - Call `resend.emails.send` with `from`, `to`, `subject`, `html`
  - Handle error object from Resend SDK: 401/403 → `EmailAdapterError('EMAIL_AUTH_FAILED')`, 429/5xx → retryable
  - Return `RecipientDeliveryStatus[]` with `providerMessageId` from response `data.id`
  - References: FRS.md Section FR-04, TR.md Section 5.1

- [ ] **Implement `sendViaSendGrid` function** in `sendgrid-provider.ts` (if SendGrid is the chosen provider)
  - Call `sgMail.setApiKey` and `sgMail.send`
  - Handle SendGrid SDK error codes: 401/403 → `EmailAdapterError('EMAIL_AUTH_FAILED')`
  - Extract `x-message-id` from response headers as `providerMessageId`
  - References: FRS.md Section FR-04, TR.md Section 4.1

- [ ] **Implement `withEmailRetry` wrapper** (shared within the module)
  - Uses `p-retry` with 3 total attempts, exponential back-off
  - Does not retry `EmailAdapterError` instances
  - Retries on 429 and 5xx provider errors
  - References: FRS.md Section FR-09, TR.md Section 6

---

## Phase 5: Main Adapter Orchestration

- [ ] **Implement `sendAgendaEmail` function** in `adapter.ts`
  - Guard: throw `EmailAdapterError('NO_RECIPIENTS')` if recipients list is empty
  - Build subject via `buildEmailSubject`
  - Build HTML body via `buildEmailHtml`
  - Route to `sendViaSendGrid` or `sendViaResend` based on `credentials.provider`
  - Return `RecipientDeliveryStatus[]`
  - References: FRS.md Section FR-02, FR-04, FR-05, TR.md Section 7.1

- [ ] **Implement `hashEmail` helper** for PII-safe logging
  - SHA-256 hash of `email.toLowerCase()`, first 12 hex chars
  - References: FRS.md Section FR-10, TR.md Section 7.1, TR.md Section 13

- [ ] **Add structured log: Send started** (info, agendaId, shortId, recipientCount)
  - References: FRS.md Section FR-10

- [ ] **Add structured log: Provider call made** (debug, agendaId, provider)
  - References: FRS.md Section FR-10

- [ ] **Add structured log: Delivery status received** (info, agendaId, totalSent, totalFailed)
  - References: FRS.md Section FR-10

- [ ] **Add structured log: Individual recipient failure** (warn, agendaId, email hashed, error)
  - References: FRS.md Section FR-10

- [ ] **Add structured log: Send completed** (info, agendaId, shortId, durationMs)
  - References: FRS.md Section FR-10

- [ ] **Verify API key is never logged** — confirm no log event in any code path includes `credentials.apiKey`
  - References: FRS.md Section FR-10, TR.md Section 13

---

## Phase 6: Export and Integration Wiring

- [ ] **Export `sendAgendaEmail` and all public types from `index.ts`**
  - References: TR.md Section 8.2

- [ ] **Verify Feature 14's call site compiles** — Feature 14 imports and calls `sendAgendaEmail` with correct types
  - References: TR.md Section 8.1

---

## Phase 7: Unit Tests

- [ ] **Write unit tests for `html-formatter.ts`** (`__tests__/html-formatter.test.ts`)
  - Test cases: subject line format, H1 client name, cycle date range, all 6 section headings present, missing section shows placeholder, bullet list → `<ul><li>`, bold → `<strong>`, HTML escaping, footer present
  - References: TR.md Section 9.1, GS.md content formatting scenarios

---

## Phase 8: Integration Tests

- [ ] **Write integration tests for `adapter.integration.test.ts`**
  - Mock provider SDK using `vi.mock('resend')` and/or `vi.mock('@sendgrid/mail')`
  - Test cases: single recipient success, multiple recipients success, empty recipients throws, 401 auth failure, 403 auth failure, 429 retry success, 429 exhausted, 5xx retry, partial failure (one recipient fails), email hashing in failure log
  - References: TR.md Section 9.2, GS.md all error handling scenarios

- [ ] **Verify no real email sends in test suite** — all provider calls are mocked

- [ ] **Verify test coverage meets 85% threshold**

---

## Phase 9: Final Verification

- [ ] **Run full adapter test suite**: `nx run api:test --testPathPattern=adapters/email`
- [ ] **Run type check**: `nx run api:type-check`
- [ ] **Run lint**: `nx run api:lint`
- [ ] **Manual smoke test**: Send one test agenda email to a real inbox using dev credentials
- [ ] **Confirm audit log entry is created correctly** in the Feature 14 call site — verify `metadata.recipients` contains the `RecipientDeliveryStatus[]` array
- [ ] **Confirm no plain-text email addresses appear in server logs** during the smoke test
