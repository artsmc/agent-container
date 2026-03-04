# GS — Gherkin Specification
## Feature 14: Agenda Endpoints

**Feature Name:** agenda-endpoints
**Date:** 2026-03-03

---

## Feature: Short ID Generation

  As the system
  I need to auto-assign globally unique short IDs to agendas
  So that humans can reference agendas by a memorable identifier across any interface

  Background:
    Given the system has a global agenda sequence starting at 1
    And no short ID is ever reused

  Scenario: First agenda in the system receives AGD-0001
    Given no agendas exist in the system
    When a new agenda is created
    Then the agenda is assigned short_id "AGD-0001"

  Scenario: Short IDs are globally sequential across all clients
    Given client "Total Life" has agendas AGD-0001 through AGD-0005
    And client "Alpha Corp" has no agendas
    When an agenda is created for client "Alpha Corp"
    Then the new agenda is assigned short_id "AGD-0006"

  Scenario: Short IDs grow beyond 4 digits naturally
    Given the system has 9999 agendas
    When a new agenda is created
    Then the agenda is assigned short_id "AGD-10000"

  Scenario: Caller cannot supply a custom short_id
    Given the request body includes "short_id": "AGD-9999"
    When the request is processed
    Then the created agenda has a system-assigned short_id
    And "AGD-9999" is not assigned unless it is the next sequence value

---

## Feature: Create Draft Agenda

  As a Mastra agent or authenticated user
  I need to POST a draft agenda to a client
  So that the generated Running Notes document is captured for human review

  Background:
    Given I am authenticated as the Mastra service account
    And client "Total Life" exists with id "client-uuid-abc"

  Scenario: Successfully create a draft agenda
    Given I send a POST to "/clients/client-uuid-abc/agendas" with:
      """
      {
        "content": "## Running Notes\n\nThis cycle we completed...",
        "cycle_start": "2026-02-01",
        "cycle_end": "2026-02-28",
        "source": "agent"
      }
      """
    When the request is processed
    Then the response status is 201
    And the returned agenda has a short_id matching "AGD-\d+"
    And the returned agenda has status "draft"
    And an Agenda Version record with version 1 and source "agent" exists
    And a "agenda.created" audit entry is written

  Scenario: Missing required field returns validation error
    Given I send a POST to "/clients/client-uuid-abc/agendas" with:
      """
      {
        "content": "Some content",
        "cycle_start": "2026-02-01"
      }
      """
    When the request is processed
    Then the response status is 422
    And the error code is "VALIDATION_ERROR"
    And the validation_errors contain an error for field "cycle_end"

  Scenario: cycle_end before cycle_start is rejected
    Given I send a POST with cycle_start "2026-02-28" and cycle_end "2026-02-01"
    When the request is processed
    Then the response status is 422
    And the error code is "VALIDATION_ERROR"
    And the validation error references field "cycle_end"

  Scenario: Creation for inaccessible client returns 404
    Given I am authenticated as user "jane" who does not have access to client "Total Life"
    When I send a POST to "/clients/client-uuid-abc/agendas"
    Then the response status is 404
    And the error code is "CLIENT_NOT_FOUND"

---

## Feature: List Agendas

  As an authenticated user
  I need to list agendas for a client with optional filters
  So that I can find and review agendas across cycles

  Background:
    Given I am authenticated as account manager "mark"
    And client "Total Life" has 3 draft agendas, 2 finalized agendas, and 1 shared agenda

  Scenario: List all agendas for a client (no filter)
    When I GET "/clients/client-uuid-abc/agendas"
    Then the response status is 200
    And the response contains 6 agendas
    And results are ordered by created_at descending
    And no agenda object in the response contains a "content" or "versions" field

  Scenario: List agendas filtered by status
    When I GET "/clients/client-uuid-abc/agendas?status=finalized"
    Then the response status is 200
    And all returned agendas have status "finalized"
    And the response contains 2 agendas

  Scenario: Pagination returns correct page
    Given 25 agendas exist for the client
    When I GET "/clients/client-uuid-abc/agendas?page=2&per_page=10"
    Then the response status is 200
    And the response contains 10 agendas
    And the pagination object shows total 25 and total_pages 3

---

## Feature: Get Agenda Detail

  As an authenticated user
  I need to retrieve a specific agenda by UUID or short ID
  So that I can see full content and version history

  Background:
    Given agenda "AGD-0015" exists with 3 version records
    And it belongs to client "Total Life" which I can access

  Scenario: Retrieve agenda by short ID
    When I GET "/agendas/AGD-0015"
    Then the response status is 200
    And the response contains the agenda with short_id "AGD-0015"
    And the versions array contains 3 entries ordered by version ascending

  Scenario: Retrieve agenda by UUID
    Given the UUID of "AGD-0015" is "3f2a1b4c-0000-0000-0000-000000000015"
    When I GET "/agendas/3f2a1b4c-0000-0000-0000-000000000015"
    Then the response status is 200
    And the response contains the agenda with short_id "AGD-0015"

  Scenario: Retrieve agenda that does not exist
    When I GET "/agendas/AGD-9999"
    Then the response status is 404
    And the error code is "AGENDA_NOT_FOUND"

  Scenario: Retrieve agenda belonging to inaccessible client
    Given agenda "AGD-0099" belongs to client "Alpha Corp" which I cannot access
    When I GET "/agendas/AGD-0099"
    Then the response status is 403
    And the error code is "FORBIDDEN"

  Scenario: Response includes share tokens for authenticated user
    Given agenda "AGD-0015" has status "shared"
    And shared_url_token is "abc123token"
    When I GET "/agendas/AGD-0015"
    Then the response includes "shared_url_token": "abc123token"
    And the response includes "internal_url_token"

---

## Feature: Edit Agenda

  As an authenticated user
  I need to edit a draft or in_review agenda
  So that I can refine agent-generated content before finalization

  Background:
    Given agenda "AGD-0015" exists with status "draft" and 1 version record
    And I am authenticated as account manager "mark"

  Scenario: Successfully edit a draft agenda promotes status to in_review
    When I PATCH "/agendas/AGD-0015" with:
      """
      {
        "content": "## Running Notes (Updated)\n\nRevised content..."
      }
      """
    Then the response status is 200
    And the returned agenda has the updated content
    And the returned agenda has status "in_review"
    And the versions array now contains 2 entries
    And version 2 has source matching the caller's client type
    And version 2 has edited_by set to my user id
    And a "agenda.edited" audit entry is written

  Scenario: Edit an in_review agenda without changing status
    Given agenda "AGD-0020" has status "in_review"
    When I PATCH "/agendas/AGD-0020" with updated content
    Then the response status is 200
    And the returned agenda has status "in_review"
    And a new version record is created

  Scenario: Edit cycle dates only
    When I PATCH "/agendas/AGD-0015" with:
      """
      {
        "cycle_start": "2026-02-03",
        "cycle_end": "2026-02-27"
      }
      """
    Then the response status is 200
    And the returned agenda has cycle_start "2026-02-03"
    And the returned agenda has cycle_end "2026-02-27"
    And a new version record is created

  Scenario: Cannot edit a finalized agenda
    Given agenda "AGD-0030" has status "finalized"
    When I PATCH "/agendas/AGD-0030" with any content
    Then the response status is 422
    And the error code is "AGENDA_NOT_EDITABLE"

  Scenario: Cannot edit a shared agenda
    Given agenda "AGD-0031" has status "shared"
    When I PATCH "/agendas/AGD-0031" with any content
    Then the response status is 422
    And the error code is "AGENDA_NOT_EDITABLE"

  Scenario: Team member can edit an in_review agenda
    Given I am authenticated with role "team_member" with access to "Total Life"
    And agenda "AGD-0015" has status "in_review"
    When I PATCH "/agendas/AGD-0015" with updated content
    Then the response status is 200
    And a new version record is created with source "ui"

  Scenario: Non-editable fields are silently ignored
    When I PATCH "/agendas/AGD-0015" with:
      """
      { "status": "finalized", "short_id": "AGD-0001", "finalized_by": "fake-user-id" }
      """
    Then the response status is 200
    And the agenda status remains "in_review"
    And the short_id remains "AGD-0015"

---

## Feature: Finalize Agenda

  As an account manager or admin
  I need to finalize an agenda
  So that it is ready for sharing and distribution

  Background:
    Given I am authenticated with role "account_manager"

  Scenario: Successfully finalize an in_review agenda
    Given agenda "AGD-0015" has status "in_review"
    And it has version 1 (agent) and version 2 (ui — a human edit)
    When I POST "/agendas/AGD-0015/finalize"
    Then the response status is 200
    And the returned agenda has status "finalized"
    And finalized_by is set to my user id
    And finalized_at is a recent UTC timestamp
    And a "agenda.finalized" audit entry is written with forced: false

  Scenario: Cannot finalize an unreviewed agenda without force flag
    Given agenda "AGD-0020" has status "draft"
    And it has only version 1 with source "agent" (never edited by a human)
    When I POST "/agendas/AGD-0020/finalize" with no body
    Then the response status is 422
    And the error code is "AGENDA_NOT_FINALIZABLE"
    And the error details include requires_force: true

  Scenario: Finalize an unreviewed agenda with force flag
    Given agenda "AGD-0020" has only one version with source "agent"
    When I POST "/agendas/AGD-0020/finalize" with:
      """
      { "force": true }
      """
    Then the response status is 200
    And the returned agenda has status "finalized"
    And a "agenda.finalized" audit entry is written with forced: true

  Scenario: Cannot finalize an already-finalized agenda
    Given agenda "AGD-0030" has status "finalized"
    When I POST "/agendas/AGD-0030/finalize"
    Then the response status is 422
    And the error code is "AGENDA_ALREADY_FINALIZED"

  Scenario: Cannot finalize a shared agenda
    Given agenda "AGD-0031" has status "shared"
    When I POST "/agendas/AGD-0031/finalize"
    Then the response status is 422
    And the error code is "AGENDA_ALREADY_FINALIZED"

  Scenario: Team member cannot finalize
    Given I am authenticated with role "team_member"
    When I POST "/agendas/AGD-0015/finalize"
    Then the response status is 403
    And the error code is "FORBIDDEN"

---

## Feature: Generate Share URLs

  As an account manager or admin
  I need to generate shareable URLs for a finalized agenda
  So that I can share the Running Notes with the client and team

  Background:
    Given I am authenticated with role "account_manager"
    And agenda "AGD-0015" has status "finalized"

  Scenario: Successfully generate share URLs for a finalized agenda
    When I POST "/agendas/AGD-0015/share"
    Then the response status is 200
    And the response contains "share_urls.client_url" with the shared_url_token embedded
    And the response contains "share_urls.internal_url" with the internal_url_token embedded
    And the returned agenda has status "shared"
    And shared_at is a recent UTC timestamp
    And a "agenda.shared" audit entry is written

  Scenario: Calling share a second time returns existing tokens without regenerating
    Given agenda "AGD-0015" already has shared_url_token "existing-token-abc"
    And agenda "AGD-0015" has status "shared"
    When I POST "/agendas/AGD-0015/share" again
    Then the response status is 200
    And share_urls.client_url contains "existing-token-abc"
    And no new "agenda.shared" audit entry is written

  Scenario: Cannot share an unfinalized agenda
    Given agenda "AGD-0020" has status "in_review"
    When I POST "/agendas/AGD-0020/share"
    Then the response status is 422
    And the error code is "AGENDA_NOT_SHAREABLE"
    And the error details include current_status "in_review"

  Scenario: Cannot share a draft agenda
    Given agenda "AGD-0021" has status "draft"
    When I POST "/agendas/AGD-0021/share"
    Then the response status is 422
    And the error code is "AGENDA_NOT_SHAREABLE"

  Scenario: Team member cannot generate share URLs
    Given I am authenticated with role "team_member"
    When I POST "/agendas/AGD-0015/share"
    Then the response status is 403
    And the error code is "FORBIDDEN"

---

## Feature: Email Agenda

  As an account manager or admin
  I need to email a finalized agenda to recipients
  So that clients and stakeholders receive the Running Notes

  Background:
    Given I am authenticated with role "account_manager"
    And agenda "AGD-0015" has status "finalized"
    And client "Total Life" has email_recipients ["client@totallife.com"]

  Scenario: Successfully email using client default recipients
    When I POST "/agendas/AGD-0015/email" with an empty body
    Then the response status is 200
    And the email adapter is called with recipients ["client@totallife.com"]
    And the response contains email.sent_to ["client@totallife.com"]
    And a "agenda.emailed" audit entry is written with recipients in metadata

  Scenario: Successfully email with recipient override
    When I POST "/agendas/AGD-0015/email" with:
      """
      { "recipients": ["override@example.com", "cc@example.com"] }
      """
    Then the response status is 200
    And the email adapter is called with recipients ["override@example.com", "cc@example.com"]
    And the response contains email.sent_to with both addresses

  Scenario: Cannot email a draft agenda
    Given agenda "AGD-0020" has status "draft"
    When I POST "/agendas/AGD-0020/email"
    Then the response status is 422
    And the error code is "AGENDA_NOT_EMAILABLE"

  Scenario: Cannot email an in_review agenda
    Given agenda "AGD-0021" has status "in_review"
    When I POST "/agendas/AGD-0021/email"
    Then the response status is 422
    And the error code is "AGENDA_NOT_EMAILABLE"

  Scenario: No recipients configured and no override provided
    Given client "Total Life" has no email_recipients configured
    When I POST "/agendas/AGD-0015/email" with no body
    Then the response status is 422
    And the error code is "NO_EMAIL_RECIPIENTS"

  Scenario: Invalid recipient email address
    When I POST "/agendas/AGD-0015/email" with:
      """
      { "recipients": ["not-an-email"] }
      """
    Then the response status is 422
    And the error code is "VALIDATION_ERROR"
    And the validation error references "recipients[0]"

  Scenario: Email adapter returns an error
    Given the email adapter returns an error "SMTP connection refused"
    When I POST "/agendas/AGD-0015/email" with valid recipients
    Then the response status is 502
    And the error code is "EMAIL_FAILED"
    And the agenda status remains "finalized"

  Scenario: Team member cannot send email
    Given I am authenticated with role "team_member"
    When I POST "/agendas/AGD-0015/email"
    Then the response status is 403
    And the error code is "FORBIDDEN"

---

## Feature: Export Agenda to Google Docs

  As an account manager or admin
  I need to export a finalized agenda to Google Docs
  So that there is a canonical formatted document linked to the record

  Background:
    Given I am authenticated with role "account_manager"
    And agenda "AGD-0015" has status "finalized"

  Scenario: Successfully export a finalized agenda
    Given the Google Docs adapter returns google_doc_id "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
    When I POST "/agendas/AGD-0015/export"
    Then the response status is 200
    And the returned agenda has google_doc_id "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
    And the response contains export.google_doc_id and export.exported_at
    And a "agenda.exported" audit entry is written

  Scenario: Re-exporting updates the stored google_doc_id
    Given agenda "AGD-0015" already has google_doc_id "old-doc-id"
    And the Google Docs adapter returns a new google_doc_id "new-doc-id"
    When I POST "/agendas/AGD-0015/export" again
    Then the response status is 200
    And the agenda now has google_doc_id "new-doc-id"

  Scenario: Cannot export a draft agenda
    Given agenda "AGD-0020" has status "draft"
    When I POST "/agendas/AGD-0020/export"
    Then the response status is 422
    And the error code is "AGENDA_NOT_EXPORTABLE"

  Scenario: Google Docs adapter returns an error
    Given the Google Docs adapter returns an error "Google API quota exceeded"
    When I POST "/agendas/AGD-0015/export"
    Then the response status is 502
    And the error code is "EXPORT_FAILED"
    And the agenda google_doc_id is unchanged

  Scenario: Team member cannot export
    Given I am authenticated with role "team_member"
    When I POST "/agendas/AGD-0015/export"
    Then the response status is 403
    And the error code is "FORBIDDEN"

---

## Feature: Public Shared Agenda Access

  As an unauthenticated client
  I need to access a shared agenda via a public URL
  So that I can read my Running Notes without needing to log in

  Background:
    Given agenda "AGD-0015" has status "shared"
    And its shared_url_token is "abc123validtoken"
    And it belongs to client "Total Life"

  Scenario: Successfully retrieve a shared agenda with no authentication
    Given I am not authenticated (no Bearer token)
    When I GET "/shared/abc123validtoken"
    Then the response status is 200
    And the response contains short_id "AGD-0015"
    And the response contains client_name "Total Life"
    And the response contains content and cycle dates
    And the response does NOT contain "id" (UUID)
    And the response does NOT contain "client_id"
    And the response does NOT contain "shared_url_token"
    And the response does NOT contain "internal_url_token"
    And the response does NOT contain "finalized_by"
    And the response does NOT contain "versions"

  Scenario: Unknown token returns 404
    When I GET "/shared/unknowntoken999"
    Then the response status is 404
    And the error code is "SHARED_LINK_NOT_FOUND"

  Scenario: Valid token with Bearer header is still publicly accessible
    Given I include a valid Bearer token in the request
    When I GET "/shared/abc123validtoken"
    Then the response status is 200
    And the same public response is returned (auth is ignored, not rejected)

  Scenario: Public endpoint does not require authentication even for finalized agendas
    Given I have no authentication token whatsoever
    When I GET "/shared/abc123validtoken"
    Then no 401 is returned
    And the agenda content is returned normally
