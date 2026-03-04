# Feature Requirement Document
# Feature 16: Email Adapter

**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03
**Status:** Pending Implementation

---

## 1. Business Objective

After a work cycle is complete and an agenda is finalized, iExcel account managers need to distribute the Running Notes to the client's stakeholders. Currently this is a manual copy-paste process: open the document, copy the content, compose an email in Gmail or Outlook, paste and reformat, and send to a manually maintained recipient list.

This feature automates agenda email distribution. When an account manager triggers `POST /agendas/{id}/email`, the system composes a professional HTML email with the agenda content and delivers it to the configured recipient list. Delivery status (sent, delivered, failed) is tracked per recipient and recorded in the audit log.

The business value: a single API call distributes the Running Notes to all relevant parties without manual effort, with a reliable audit trail confirming who received it and when.

---

## 2. Target Users

**Primary — Account Managers:** Trigger the email send after finalizing an agenda. They may want to override the default recipient list for a specific send (e.g., add the client's new CTO to one agenda).

**Secondary — Admins:** May review the audit log to confirm emails were delivered for compliance or client management purposes.

**Integration consumers:**
- The agenda email endpoint (Feature 14) is the direct caller of this adapter.
- The Mastra terminal (Feature 33) may trigger email sends as part of the agenda distribution workflow, but must confirm the recipient list before sending (per terminal-prd.md interaction boundaries).

**Indirect recipients — Clients:** Receive the formatted agenda email. They do not interact with this system.

---

## 3. Problem Solved

### 3.1 Manual Distribution

Without this feature, distribution requires:
1. Opening the agenda document
2. Manually composing an email
3. Maintaining recipient lists separately (or from memory)
4. No confirmation that delivery succeeded

### 3.2 No Audit Trail

There is currently no record of which agendas were emailed, to whom, when, or whether delivery succeeded. This is a gap for account management accountability and client relationship tracking.

### 3.3 Recipient Management

Client contacts change. The `email_recipients` JSONB field on the `clients` table provides a managed, per-client default list. The override mechanism supports one-off additions without permanently changing the client's default configuration.

---

## 4. Success Metrics

| Metric | Target |
|---|---|
| Email delivery success rate | 99%+ for valid recipient addresses (barring provider outages) |
| Send latency | Under 5 seconds for sends to up to 20 recipients |
| Delivery tracking | Per-recipient delivery status recorded in audit log on every send |
| Audit completeness | Every `POST /agendas/{id}/email` call produces exactly one audit log entry with `action = 'agenda.emailed'` |
| Recipient list accuracy | Request body override used when provided; client default used when not |

---

## 5. Business Constraints

- **Only sends finalized agendas.** The `status = finalized` check is enforced by Feature 14's endpoint before this adapter is called. The adapter does not recheck agenda status.
- **Adapter isolation.** Switching from SendGrid to Resend (or any other provider) means replacing this adapter's implementation only. The calling endpoint's type signature and behavior do not change.
- **No unsubscribe or bounce management in V1.** These are deferred to a future iteration.
- **No scheduled or delayed sends.** All sends are immediate upon invocation.
- **API keys from secret manager.** Email provider credentials are never hardcoded or stored in Postgres.
- **Delivery tracking in audit log only.** The system does not maintain a separate email delivery table — per-recipient status is captured in the `audit_log.metadata` JSONB field.

---

## 6. Integration with Product Roadmap

This is a leaf node (nothing in the system depends on this adapter). It is the final delivery mechanism in the agenda distribution workflow:

```
14 (agenda-endpoints) → 16 (email-adapter)
09 (client-management) → 16 (email-adapter)  [for default email_recipients]
```

The audit log entry created by Feature 14 (using delivery data returned by this adapter) is the system's persistent record of each email send.

---

## 7. Out of Scope

- Agenda lifecycle enforcement (`status = finalized` check) — that is Feature 14.
- Agenda content generation — that is Feature 20.
- Email template design and branding — initial implementation uses a clean, unstyled default HTML template.
- Bounce management, unsubscribe handling, suppression lists — future iteration.
- Email open tracking, click tracking, or engagement metrics — future iteration.
- Scheduled or delayed email delivery.
- Multi-provider routing (e.g., SendGrid for bulk, Resend for transactional) — V1 uses a single configured provider.
- Storing sent emails or maintaining a separate email history table.
