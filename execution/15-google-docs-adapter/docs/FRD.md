# Feature Requirement Document
# Feature 15: Google Docs Adapter

**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03
**Status:** Pending Implementation

---

## 1. Business Objective

iExcel delivers a client-facing "Running Notes" document after each work cycle. This document summarizes completed tasks, outstanding work, deliverables, recommendations, new ideas, and next steps — organized by theme (Asana project). The Running Notes have historically been created manually in Google Docs.

This feature automates the production of that document. When an account manager triggers an export from the iExcel system, the Google Docs adapter converts the finalized agenda content into a properly structured Google Doc — either creating a fresh document for new clients or appending a new cycle's entry to an existing client document.

The business value is direct: the effort of formatting and populating Running Notes documents is eliminated. Account managers export with one action and receive a formatted, client-ready Google Doc.

---

## 2. Target Users

**Primary — Account Managers:** The users who trigger the export. They expect a Google Doc to appear (or be updated) in their Drive with properly formatted Running Notes after clicking "Export to Google Docs" in the UI or triggering `POST /agendas/{id}/export` via the terminal.

**Indirect — Clients:** Receive the final Running Notes document. They never interact with this system — they consume the Google Doc output.

**Integration consumers:**
- The agenda export endpoint (Feature 14) is the direct caller of this adapter.
- The Mastra terminal (Feature 33) may trigger exports as part of the agenda finalization workflow.

---

## 3. Problem Solved

### 3.1 Manual Document Production

Without this adapter, an account manager must:
1. Open Google Docs
2. Find or create the client's Running Notes document
3. Manually copy agenda content section by section
4. Apply correct heading styles, section structure, and formatting
5. Add date headers for the cycle

This takes 10–20 minutes per cycle per client and is error-prone (missed sections, inconsistent formatting).

### 3.2 Format Consistency

The Running Notes format is defined (see asana-call-agenda.md): Completed Tasks, Incomplete Tasks, Relevant Deliverables, Recommendations, New Ideas, Next Steps. Manual production leads to format drift across account managers and over time. This adapter enforces the format on every export.

---

## 4. Success Metrics

| Metric | Target |
|---|---|
| Export success rate | 99%+ for valid finalized agendas (barring Google API outages) |
| Export latency | Under 10 seconds for typical agenda content (under 5,000 words) |
| Format accuracy | All 6 Running Notes sections present and correctly headed in every export |
| Google Doc ID stored | `agendas.google_doc_id` is populated after every successful export |
| Create vs append | Correct behavior for both new and existing document configurations |

---

## 5. Business Constraints

- **Only exports finalized agendas.** The `status = finalized` check is enforced by Feature 14's endpoint before calling this adapter. The adapter itself does not recheck agenda status.
- **Adapter isolation.** The adapter exposes a clean TypeScript interface. Replacing Google Docs with Notion or another document platform means swapping this adapter only — the calling endpoint and the agenda data format do not change.
- **No reading from Google Docs.** The adapter is write-only. It does not read document contents back into the system.
- **Credentials via secret manager.** Google service account credentials are injected at runtime from the cloud secret manager (per infra-prd.md). They are never hardcoded or stored in Postgres.
- **Returns Google Doc ID.** The adapter must return the document ID to the caller so Feature 14 can persist it on the `agendas` record.

---

## 6. Integration with Product Roadmap

This is a leaf node (nothing depends on it in the feature dependency graph). It is the terminal point of the export branch:

```
14 (agenda-endpoints) → 15 (google-docs-adapter)
09 (client-management) → 15 (google-docs-adapter)  [for create-vs-append config]
```

The output of this feature is consumed directly by clients as a Google Doc. It feeds no further automated processing in this system.

---

## 7. Out of Scope

- Agenda content generation — that is Feature 20 (Workflow B Agenda Agent).
- Agenda lifecycle management (finalize, share) — that is Feature 14.
- Real-time collaborative editing features within Google Docs.
- Reading data back from Google Docs into the system.
- Google Drive folder organization, permissions management, or sharing settings.
- PDF export of the Google Doc.
- Sending the Google Doc link via email — that is a separate action (Feature 16).
- Template management or branding within Google Docs (initial implementation uses a clean default format).
