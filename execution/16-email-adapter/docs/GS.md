# Gherkin Specification
# Feature 16: Email Adapter

**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03

---

```gherkin
Feature: Email Adapter
  As the agenda email endpoint
  I need to send formatted agenda emails to a recipient list
  So that clients receive their Running Notes via email after finalization

  Background:
    Given the email provider API is accessible
    And a valid email provider API key is available
    And all email provider API calls are mocked at the HTTP layer

  # ---------------------------------------------------------------------------
  # Happy Path — Sending Scenarios
  # ---------------------------------------------------------------------------

  Scenario: Send agenda email to a single recipient
    Given a finalized agenda for client "Total Life" with cycle "Feb 17 to Feb 28, 2026"
    And the recipient list is ["mark@totallife.com"]
    When sendAgendaEmail is called
    Then the email provider API is called once
    And the returned delivery status contains 1 entry
    And the entry has status "sent"
    And the entry has a non-null providerMessageId

  Scenario: Send agenda email to multiple recipients
    Given a finalized agenda for client "Total Life"
    And the recipient list is ["ceo@totallife.com", "mark@totallife.com", "ops@totallife.com"]
    When sendAgendaEmail is called
    Then all 3 recipients receive the email (or are included in a single batch call)
    And the returned delivery status contains 3 entries
    And all 3 entries have status "sent"

  Scenario: Email subject contains client name and cycle dates
    Given a finalized agenda with clientName "Total Life" and cycle "2026-02-17" to "2026-02-28"
    When sendAgendaEmail is called
    Then the email sent to the provider has subject "Running Notes — Total Life | Feb 17 to Feb 28, 2026"

  Scenario: Email HTML body contains all 6 Running Notes sections
    Given a finalized agenda with content containing all 6 standard sections
    When sendAgendaEmail is called
    Then the email HTML body contains an H3 "Completed Tasks"
    And the HTML body contains an H3 "Incomplete Tasks"
    And the HTML body contains an H3 "Relevant Deliverables"
    And the HTML body contains an H3 "Recommendations"
    And the HTML body contains an H3 "New Ideas"
    And the HTML body contains an H3 "Next Steps"

  Scenario: Email HTML body contains client name as H1 header
    Given a finalized agenda for client "Total Life"
    When sendAgendaEmail is called
    Then the email HTML body begins with an H1 containing "Total Life"

  Scenario: Email HTML body includes cycle date range
    Given a finalized agenda with cycleStart "2026-02-17" and cycleEnd "2026-02-28"
    When sendAgendaEmail is called
    Then the email HTML body contains "Feb 17 to Feb 28, 2026"

  Scenario: Email HTML body includes footer
    Given a finalized agenda
    When sendAgendaEmail is called
    Then the email HTML body contains a footer with "Sent by iExcel Automation"

  # ---------------------------------------------------------------------------
  # Content Formatting Scenarios
  # ---------------------------------------------------------------------------

  Scenario: Markdown bullet lists are converted to HTML list items
    Given agenda content with a "Completed Tasks" section containing:
      """
      - Finished CI pipeline setup
      - Deployed staging environment
      """
    When sendAgendaEmail is called
    Then the email HTML contains "<ul>" and "<li>Finished CI pipeline setup</li>"
    And no raw "- " markdown markers appear in the email HTML

  Scenario: Markdown bold text is converted to HTML strong tags
    Given agenda content containing "**Total Life CRM Integration**"
    When sendAgendaEmail is called
    Then the email HTML contains "<strong>Total Life CRM Integration</strong>"

  Scenario: Missing section shows placeholder in email
    Given agenda content that omits the "New Ideas" section
    When sendAgendaEmail is called
    Then the email HTML contains an H3 "New Ideas"
    And the "New Ideas" section body contains "(No items this cycle)"

  # ---------------------------------------------------------------------------
  # Recipient List Scenarios
  # ---------------------------------------------------------------------------

  Scenario: Adapter sends to the provided recipient list
    Given the recipient list is ["alice@client.com", "bob@client.com"]
    When sendAgendaEmail is called
    Then the email provider receives both email addresses

  Scenario: Empty recipient list throws an error before sending
    Given the recipient list is []
    When sendAgendaEmail is called
    Then an EmailAdapterError is thrown with code "NO_RECIPIENTS"
    And no email provider API calls are made

  # ---------------------------------------------------------------------------
  # Delivery Status Scenarios
  # ---------------------------------------------------------------------------

  Scenario: Returned status array contains one entry per recipient
    Given the recipient list has 3 addresses
    And the provider accepts all 3
    When sendAgendaEmail is called
    Then the returned array contains exactly 3 RecipientDeliveryStatus entries

  Scenario: All successful sends have status "sent"
    Given the provider accepts all recipients
    When sendAgendaEmail is called
    Then all returned entries have status "sent"

  Scenario: Partial failure — one recipient rejected by provider
    Given the recipient list is ["valid@client.com", "invalid@@bad.com"]
    And the provider accepts "valid@client.com" and rejects "invalid@@bad.com"
    When sendAgendaEmail is called
    Then no exception is thrown
    And the returned array contains 2 entries
    And the entry for "valid@client.com" has status "sent"
    And the entry for "invalid@@bad.com" has status "failed"
    And the "failed" entry has a non-null error description

  Scenario: providerMessageId is populated for sent messages
    Given the provider returns message ID "msg_abc123" for a successful send
    When sendAgendaEmail is called
    Then the returned entry has providerMessageId "msg_abc123"

  # ---------------------------------------------------------------------------
  # Provider Authentication Scenarios
  # ---------------------------------------------------------------------------

  Scenario: SendGrid provider uses the correct API endpoint and key
    Given the credentials specify provider "sendgrid" with a valid API key
    When sendAgendaEmail is called
    Then the SendGrid API endpoint is called with the Bearer API key in Authorization header

  Scenario: Resend provider uses the correct API endpoint and key
    Given the credentials specify provider "resend" with a valid API key
    When sendAgendaEmail is called
    Then the Resend API endpoint is called with the Bearer API key in Authorization header

  Scenario: API key is not logged
    Given a valid API key is provided
    When sendAgendaEmail is called
    Then no log event at any level contains the API key value

  # ---------------------------------------------------------------------------
  # Error Handling Scenarios
  # ---------------------------------------------------------------------------

  Scenario: Provider returns 401 Unauthorized
    Given the API key is invalid
    And the provider returns 401
    When sendAgendaEmail is called
    Then an EmailAdapterError is thrown with code "EMAIL_AUTH_FAILED"
    And the error is not retried

  Scenario: Provider returns 403 Forbidden
    Given the provider returns 403
    When sendAgendaEmail is called
    Then an EmailAdapterError is thrown with code "EMAIL_AUTH_FAILED"

  Scenario: Provider returns 429 and succeeds on retry
    Given the provider returns 429 on the first attempt
    And returns 200 on the second attempt
    When sendAgendaEmail is called
    Then the send succeeds after 1 retry
    And a warning log is emitted for the failed attempt

  Scenario: All retries exhausted after repeated 429
    Given the provider returns 429 on all 3 attempts
    When sendAgendaEmail is called
    Then an EmailAdapterError is thrown with code "EMAIL_PROVIDER_UNAVAILABLE"

  Scenario: Provider request times out
    Given the provider API takes longer than 15 seconds to respond
    When sendAgendaEmail is called
    Then an EmailAdapterError is thrown with code "EMAIL_TIMEOUT"

  Scenario: Provider returns 5xx then succeeds on retry
    Given the provider returns 503 on the first attempt
    And returns 200 on the second attempt
    When sendAgendaEmail is called
    Then the send succeeds after 1 retry

  # ---------------------------------------------------------------------------
  # Logging Scenarios
  # ---------------------------------------------------------------------------

  Scenario: Structured logs are emitted for a successful send
    Given a valid agenda and recipient list
    When sendAgendaEmail is called successfully
    Then an info log "Send started" is emitted with agendaId, shortId, and recipientCount
    And an info log "Delivery status received" is emitted with agendaId, totalSent, totalFailed
    And an info log "Send completed" is emitted with agendaId, shortId, and durationMs

  Scenario: Recipient email addresses are not logged in plain text
    Given a recipient list with real email addresses
    When sendAgendaEmail is called
    Then no log event contains the plain text email addresses
    And if any address is referenced in a warning log it is hashed or redacted

  Scenario: Agenda content is not logged
    Given an agenda with substantial body content
    When sendAgendaEmail is called
    Then no log event contains the agenda body text

  # ---------------------------------------------------------------------------
  # Adapter Isolation Scenarios
  # ---------------------------------------------------------------------------

  Scenario: Adapter can be swapped from SendGrid to Resend without changing the caller
    Given the calling endpoint uses AgendaEmailInput and EmailProviderCredentials interfaces
    When the adapter implementation switches from SendGrid to Resend
    Then the calling endpoint requires no code changes
    And the returned RecipientDeliveryStatus[] shape remains identical

  Scenario: Adapter does not query the database directly
    Given a valid email input and recipient list passed to the adapter
    When sendAgendaEmail is called
    Then no Drizzle or SQL queries are executed inside the adapter
    And all data is sourced from function parameters
```
