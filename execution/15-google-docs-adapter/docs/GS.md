# Gherkin Specification
# Feature 15: Google Docs Adapter

**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03

---

```gherkin
Feature: Google Docs Adapter
  As the agenda export endpoint
  I need to convert agenda content into a formatted Google Doc
  So that account managers can share polished Running Notes with clients

  Background:
    Given the Google Docs API is accessible
    And a valid Google service account credential is available
    And all Google Docs API calls are mocked at the HTTP layer

  # ---------------------------------------------------------------------------
  # Create Mode Scenarios
  # ---------------------------------------------------------------------------

  Scenario: Create a new Google Doc when no existing document is configured
    Given a finalized agenda for client "Total Life" with cycle "Feb 17 to Feb 28, 2026"
    And the client has no existing Google Doc configured (googleDocId is null)
    And the agenda content contains all 6 standard sections
    When exportToGoogleDoc is called with the agenda and client config
    Then a new Google Doc is created via the Google Docs API
    And the document title is "Total Life — Running Notes"
    And the returned googleDocId is a non-empty string
    And the returned documentUrl is "https://docs.google.com/document/d/{googleDocId}/edit"

  Scenario: New document contains correct Running Notes structure
    Given a finalized agenda with content containing all 6 sections
    And the client has no existing Google Doc
    When exportToGoogleDoc is called
    Then the created document body contains a HEADING_1 "Running Notes — Feb 17 to Feb 28, 2026"
    And the document contains HEADING_2 "Completed Tasks"
    And the document contains HEADING_2 "Incomplete Tasks"
    And the document contains HEADING_2 "Relevant Deliverables"
    And the document contains HEADING_2 "Recommendations"
    And the document contains HEADING_2 "New Ideas"
    And the document contains HEADING_2 "Next Steps"
    And each section heading is followed by its corresponding content

  Scenario: Cycle date range formatted correctly in heading
    Given a finalized agenda with cycleStart "2026-02-17" and cycleEnd "2026-02-28"
    And the client has no existing Google Doc
    When exportToGoogleDoc is called
    Then the HEADING_1 contains "Running Notes — Feb 17 to Feb 28, 2026"

  # ---------------------------------------------------------------------------
  # Append Mode Scenarios
  # ---------------------------------------------------------------------------

  Scenario: Append to existing Google Doc when document ID is configured
    Given a finalized agenda for client "Total Life"
    And the client has an existing Google Doc with id "existing-doc-id-123"
    And the existing document has content already
    When exportToGoogleDoc is called with clientConfig.googleDocId = "existing-doc-id-123"
    Then the Google Docs API is called to get the existing document (documents.get)
    And new content is inserted at the end of the document
    And the original document content is NOT modified
    And the returned googleDocId is "existing-doc-id-123" (unchanged)

  Scenario: Separator is inserted before appended content
    Given a finalized agenda for client "Total Life"
    And the client has an existing Google Doc with content
    When exportToGoogleDoc is called in append mode
    Then a separator (horizontal rule or equivalent) is inserted before the new cycle header

  Scenario: Appended content has correct structure
    Given a finalized agenda with cycleStart "2026-03-03" and cycleEnd "2026-03-14"
    And the client has an existing Google Doc
    When exportToGoogleDoc is called in append mode
    Then the appended section begins with HEADING_1 "Running Notes — Mar 3 to Mar 14, 2026"
    And the appended section contains all 6 section headings

  # ---------------------------------------------------------------------------
  # Content Parsing Scenarios
  # ---------------------------------------------------------------------------

  Scenario: ProseMirror bullet lists are converted to Google Docs list items
    Given agenda content with a "Completed Tasks" section containing a bulletList node with 3 listItem nodes:
      | Finished CI pipeline setup |
      | Deployed staging environment |
      | Updated client onboarding docs |
    When exportToGoogleDoc is called
    Then the Google Docs "Completed Tasks" section contains 3 unordered list items

  Scenario: ProseMirror bold text marks are converted to Google Docs bold formatting
    Given agenda content with a text node with bold mark "Total Life CRM Integration"
    When exportToGoogleDoc is called
    Then the corresponding Google Docs text run has bold formatting applied

  Scenario: Missing section in agenda content produces empty section heading
    Given agenda content that contains "Completed Tasks" and "Next Steps" but not "New Ideas"
    When exportToGoogleDoc is called
    Then the Google Doc contains HEADING_2 "New Ideas"
    And the "New Ideas" section body is empty (no content follows the heading)
    And no sections are omitted from the document

  Scenario: Unstructured ProseMirror content without recognized section headings
    Given agenda content as ProseMirror JSON with no recognized heading nodes
    When exportToGoogleDoc is called
    Then the full agenda content is serialized as plain text and inserted as a single NORMAL_TEXT block
    And the cycle header HEADING_1 is still present
    And no error is thrown

  Scenario: All 6 sections present and populated
    Given agenda content with all 6 sections fully populated
    When exportToGoogleDoc is called
    Then each section in the Google Doc contains its respective content
    And no section body is empty

  # ---------------------------------------------------------------------------
  # Return Value Scenarios
  # ---------------------------------------------------------------------------

  Scenario: Export returns googleDocId and documentUrl
    Given a valid finalized agenda and client config
    When exportToGoogleDoc is called successfully
    Then the returned object has a non-empty "googleDocId" string
    And the returned "documentUrl" is "https://docs.google.com/document/d/{googleDocId}/edit"

  Scenario: Returned googleDocId matches created document
    Given the client has no existing Google Doc
    And Google Docs API returns documentId "new-doc-id-456" on creation
    When exportToGoogleDoc is called
    Then the returned googleDocId is "new-doc-id-456"

  # ---------------------------------------------------------------------------
  # Error Handling Scenarios
  # ---------------------------------------------------------------------------

  Scenario: Google Docs API returns 401
    Given the service account credentials are invalid or expired
    And the Google Docs API returns 401
    When exportToGoogleDoc is called
    Then a GoogleDocsAdapterError is thrown with code "GOOGLE_AUTH_FAILED"

  Scenario: Google Docs API returns 403
    Given the service account lacks permission on the target document
    And the Google Docs API returns 403
    When exportToGoogleDoc is called
    Then a GoogleDocsAdapterError is thrown with code "GOOGLE_AUTH_FAILED"

  Scenario: Target document not found in append mode
    Given the client config specifies googleDocId "nonexistent-doc-id"
    And the Google Docs API returns 404 for that document
    When exportToGoogleDoc is called in append mode
    Then a GoogleDocsAdapterError is thrown with code "GOOGLE_DOC_NOT_FOUND"
    And the adapter does NOT fall back to create mode

  Scenario: Google Docs API returns 429 and succeeds on retry
    Given the Google Docs API returns 429 on the first attempt
    And returns 200 on the second attempt
    When exportToGoogleDoc is called
    Then the export succeeds after 1 retry
    And a warning log is emitted for the failed attempt

  Scenario: All retries exhausted after repeated 429
    Given the Google Docs API returns 429 on all 3 attempts
    When exportToGoogleDoc is called
    Then a GoogleDocsAdapterError is thrown with code "GOOGLE_DOCS_UNAVAILABLE"

  Scenario: Google Docs API request times out
    Given the Google Docs API takes longer than 30 seconds to respond
    When exportToGoogleDoc is called
    Then a GoogleDocsAdapterError is thrown with code "GOOGLE_DOCS_TIMEOUT"

  Scenario: 5xx error is retried then succeeds
    Given the Google Docs API returns 503 on the first attempt
    And returns 200 on the second attempt
    When exportToGoogleDoc is called
    Then the export succeeds after 1 retry

  # ---------------------------------------------------------------------------
  # Authentication Scenarios
  # ---------------------------------------------------------------------------

  Scenario: Service account credentials are used for Google Auth
    Given a valid service account credential JSON is provided
    When exportToGoogleDoc is called
    Then the Google Auth client is initialized with the service account credential
    And the OAuth scope is "https://www.googleapis.com/auth/documents"

  Scenario: Service account credentials are not logged
    Given a valid service account credential JSON is provided
    When exportToGoogleDoc is called
    Then no log event at any level contains the private key or any credential field values

  # ---------------------------------------------------------------------------
  # Logging Scenarios
  # ---------------------------------------------------------------------------

  Scenario: Structured logs are emitted for create mode export
    Given a finalized agenda and client with no existing Google Doc
    When exportToGoogleDoc is called successfully
    Then an info log "Export started" is emitted with agendaId, shortId, and mode "create"
    And an info log "Google Doc created" is emitted with agendaId, googleDocId, and documentUrl
    And an info log "Export completed" is emitted with agendaId, googleDocId, and durationMs

  Scenario: Structured logs are emitted for append mode export
    Given a finalized agenda and client with an existing Google Doc
    When exportToGoogleDoc is called successfully
    Then an info log "Export started" is emitted with mode "append"
    And an info log "Content appended" is emitted with agendaId, googleDocId, and documentUrl

  Scenario: Agenda content is not included in log output
    Given a finalized agenda with substantial content
    When exportToGoogleDoc is called
    Then no log event contains the agenda body text

  # ---------------------------------------------------------------------------
  # Adapter Isolation Scenarios
  # ---------------------------------------------------------------------------

  Scenario: Adapter can be swapped without changing the calling endpoint
    Given the calling endpoint uses the AgendaExportInput and ClientDocConfig interfaces
    When the Google Docs adapter is replaced with a different document export adapter
    Then the calling endpoint requires no code changes
    And the calling endpoint receives the same GoogleDocExportResult shape

  Scenario: Adapter does not query the database directly
    Given a finalized agenda and client config passed to the adapter
    When exportToGoogleDoc is called
    Then no Drizzle or SQL queries are executed inside the adapter
    And all data is sourced from the function parameters
```
