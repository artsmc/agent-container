# GS — Gherkin Specification
# Feature 10: Transcript Endpoints

---

## Feature: Submit Transcript (POST /clients/{id}/transcripts)

### Background
```gherkin
Given the iExcel API is running
And the following clients exist:
  | id                                   | name        |
  | a1b2c3d4-0000-0000-0000-000000000001 | Total Life  |
  | a1b2c3d4-0000-0000-0000-000000000002 | HealthFirst |
And the following users exist:
  | id     | role            | assigned_clients       |
  | u-adm  | admin           | (all)                  |
  | u-am   | account_manager | Total Life             |
  | u-tm   | team_member     | Total Life             |
  | u-am2  | account_manager | HealthFirst            |
```

---

### Scenario: Account Manager submits a valid transcript via JSON body
```gherkin
Given I am authenticated as an Account Manager assigned to "Total Life"
When I POST to "/clients/a1b2c3d4-0000-0000-0000-000000000001/transcripts" with body:
  """
  {
    "raw_transcript": "Mark: Hello, let's get started.\nSarah: Sounds good, I have a few updates...",
    "call_type": "client_call",
    "call_date": "2026-03-03T14:00:00Z"
  }
  """
Then the response status is 201
And the response body contains:
  | field               | value                                      |
  | client_id           | a1b2c3d4-0000-0000-0000-000000000001       |
  | call_type           | client_call                                |
  | call_date           | 2026-03-03T14:00:00Z                       |
  | raw_transcript      | (the submitted text)                       |
  | grain_call_id       | null                                       |
  | processed_at        | null                                       |
And the response body contains a non-null "id" (UUID)
And the response body contains a non-null "normalized_segments" object
And "normalized_segments.source" equals "manual"
And "normalized_segments.segments" is a non-empty array
And the transcript row exists in the database with the returned "id"
And an audit log entry exists with action "transcript.created" and entity_id matching the returned "id"
```

### Scenario: Admin submits a transcript for any client
```gherkin
Given I am authenticated as an Admin
When I POST to "/clients/a1b2c3d4-0000-0000-0000-000000000002/transcripts" with body:
  """
  {
    "raw_transcript": "John: Good morning. Let's review the backlog.\nMary: I have three items to discuss...",
    "call_type": "intake",
    "call_date": "2026-03-03T09:00:00Z"
  }
  """
Then the response status is 201
And the response body contains "client_id" equal to "a1b2c3d4-0000-0000-0000-000000000002"
```

### Scenario: Account Manager submits a transcript via file upload
```gherkin
Given I am authenticated as an Account Manager assigned to "Total Life"
When I POST to "/clients/a1b2c3d4-0000-0000-0000-000000000001/transcripts" as multipart/form-data:
  | field      | value                                                  |
  | file       | (a .txt file containing a valid transcript, < 5 MB)    |
  | call_type  | follow_up                                              |
  | call_date  | 2026-03-01T10:00:00Z                                   |
Then the response status is 201
And the response body contains a non-null "normalized_segments" object
```

### Scenario: Team Member is forbidden from submitting a transcript
```gherkin
Given I am authenticated as a Team Member assigned to "Total Life"
When I POST to "/clients/a1b2c3d4-0000-0000-0000-000000000001/transcripts" with any valid body
Then the response status is 403
And the response body contains error code "FORBIDDEN"
And no transcript row is created in the database
And no audit log entry is created
```

### Scenario: Account Manager submits to a client they are not assigned to
```gherkin
Given I am authenticated as an Account Manager assigned to "Total Life"
When I POST to "/clients/a1b2c3d4-0000-0000-0000-000000000002/transcripts" with a valid body
Then the response status is 404
And the response body contains error code "CLIENT_NOT_FOUND"
```

### Scenario: Submit with a non-existent client ID
```gherkin
Given I am authenticated as an Account Manager
When I POST to "/clients/00000000-0000-0000-0000-000000000000/transcripts" with a valid body
Then the response status is 404
And the response body contains error code "CLIENT_NOT_FOUND"
```

### Scenario: Submit with an invalid UUID in the client path parameter
```gherkin
Given I am authenticated as an Account Manager
When I POST to "/clients/not-a-uuid/transcripts" with a valid body
Then the response status is 400
And the response body contains error code "INVALID_ID"
```

### Scenario: Submit with missing call_type
```gherkin
Given I am authenticated as an Account Manager assigned to "Total Life"
When I POST to "/clients/a1b2c3d4-0000-0000-0000-000000000001/transcripts" with body:
  """
  {
    "raw_transcript": "Mark: Hello, let's get started.\nSarah: Sounds good, I have a few updates...",
    "call_date": "2026-03-03T14:00:00Z"
  }
  """
Then the response status is 400
And the response body contains error code "INVALID_BODY"
```

### Scenario: Submit with an invalid call_type value
```gherkin
Given I am authenticated as an Account Manager assigned to "Total Life"
When I POST to "/clients/a1b2c3d4-0000-0000-0000-000000000001/transcripts" with body:
  """
  {
    "raw_transcript": "Mark: Hello, let's get started.\nSarah: Sounds good...",
    "call_type": "weekly_standup",
    "call_date": "2026-03-03T14:00:00Z"
  }
  """
Then the response status is 400
And the response body contains error code "INVALID_BODY"
And the response body contains a message referencing "call_type"
```

### Scenario: Submit with missing call_date
```gherkin
Given I am authenticated as an Account Manager assigned to "Total Life"
When I POST to "/clients/a1b2c3d4-0000-0000-0000-000000000001/transcripts" with body:
  """
  {
    "raw_transcript": "Mark: Hello, let's get started.\nSarah: Sounds good...",
    "call_type": "client_call"
  }
  """
Then the response status is 400
And the response body contains error code "INVALID_BODY"
```

### Scenario: Submit with a non-ISO-8601 call_date
```gherkin
Given I am authenticated as an Account Manager assigned to "Total Life"
When I POST to "/clients/a1b2c3d4-0000-0000-0000-000000000001/transcripts" with body:
  """
  {
    "raw_transcript": "Mark: Hello, let's get started.\nSarah: Sounds good...",
    "call_type": "client_call",
    "call_date": "March 3 2026"
  }
  """
Then the response status is 400
And the response body contains error code "INVALID_BODY"
```

### Scenario: Submit with empty raw_transcript
```gherkin
Given I am authenticated as an Account Manager assigned to "Total Life"
When I POST to "/clients/a1b2c3d4-0000-0000-0000-000000000001/transcripts" with body:
  """
  {
    "raw_transcript": "",
    "call_type": "client_call",
    "call_date": "2026-03-03T14:00:00Z"
  }
  """
Then the response status is 400
And the response body contains error code "INVALID_BODY"
```

### Scenario: Submit with transcript text that is too short (< 50 characters)
```gherkin
Given I am authenticated as an Account Manager assigned to "Total Life"
When I POST to "/clients/a1b2c3d4-0000-0000-0000-000000000001/transcripts" with body:
  """
  {
    "raw_transcript": "Hi.",
    "call_type": "client_call",
    "call_date": "2026-03-03T14:00:00Z"
  }
  """
Then the response status is 400
And the response body contains error code "INVALID_BODY"
```

### Scenario: Submit with both raw_transcript and file upload provided
```gherkin
Given I am authenticated as an Account Manager assigned to "Total Life"
When I POST to "/clients/a1b2c3d4-0000-0000-0000-000000000001/transcripts" as multipart/form-data with both a "file" and "raw_transcript" field
Then the response status is 400
And the response body contains error code "INVALID_BODY"
```

### Scenario: Submit with a file that is not a .txt file
```gherkin
Given I am authenticated as an Account Manager assigned to "Total Life"
When I POST to "/clients/a1b2c3d4-0000-0000-0000-000000000001/transcripts" as multipart/form-data with a .pdf file
Then the response status is 400
And the response body contains error code "UNSUPPORTED_FILE_TYPE"
```

### Scenario: Submit with a file that exceeds 5 MB
```gherkin
Given I am authenticated as an Account Manager assigned to "Total Life"
When I POST to "/clients/a1b2c3d4-0000-0000-0000-000000000001/transcripts" as multipart/form-data with a .txt file larger than 5 MB
Then the response status is 400
And the response body contains error code "FILE_TOO_LARGE"
```

### Scenario: Unauthenticated request to submit
```gherkin
Given I am not authenticated (no Bearer token)
When I POST to "/clients/a1b2c3d4-0000-0000-0000-000000000001/transcripts" with a valid body
Then the response status is 401
And the response body contains error code "UNAUTHORIZED"
```

---

## Feature: List Transcripts (GET /clients/{id}/transcripts)

### Scenario: Account Manager lists transcripts for their assigned client
```gherkin
Given I am authenticated as an Account Manager assigned to "Total Life"
And "Total Life" has 3 transcripts with call_dates 2026-01-01, 2026-02-01, 2026-03-01
When I GET "/clients/a1b2c3d4-0000-0000-0000-000000000001/transcripts"
Then the response status is 200
And the response body contains "data" with 3 transcript summaries
And the summaries are ordered by call_date descending (2026-03-01 first)
And each summary contains "id", "client_id", "call_type", "call_date", "processed_at", "created_at"
And each summary does NOT contain "raw_transcript" or "normalized_segments"
And the "pagination" object shows total: 3, page: 1, per_page: 20, total_pages: 1
```

### Scenario: Pagination returns the correct page
```gherkin
Given I am authenticated as an Admin
And "Total Life" has 25 transcripts
When I GET "/clients/a1b2c3d4-0000-0000-0000-000000000001/transcripts?page=2&per_page=10"
Then the response status is 200
And the "data" array contains 10 transcripts
And "pagination.page" equals 2
And "pagination.total" equals 25
And "pagination.total_pages" equals 3
```

### Scenario: Filter by call_type
```gherkin
Given I am authenticated as an Account Manager assigned to "Total Life"
And "Total Life" has 2 "client_call" transcripts and 1 "intake" transcript
When I GET "/clients/a1b2c3d4-0000-0000-0000-000000000001/transcripts?call_type=intake"
Then the response status is 200
And the "data" array contains exactly 1 transcript
And that transcript's "call_type" equals "intake"
```

### Scenario: Filter by date range
```gherkin
Given I am authenticated as an Account Manager assigned to "Total Life"
And "Total Life" has transcripts on 2026-01-15, 2026-02-15, 2026-03-15
When I GET "/clients/a1b2c3d4-0000-0000-0000-000000000001/transcripts?from_date=2026-02-01&to_date=2026-02-28"
Then the response status is 200
And the "data" array contains exactly 1 transcript
And that transcript's "call_date" starts with "2026-02-15"
```

### Scenario: Client with no transcripts returns empty list
```gherkin
Given I am authenticated as an Account Manager assigned to "Total Life"
And "Total Life" has no transcripts
When I GET "/clients/a1b2c3d4-0000-0000-0000-000000000001/transcripts"
Then the response status is 200
And "data" is an empty array
And "pagination.total" equals 0
```

### Scenario: Account Manager cannot list transcripts for a client they are not assigned to
```gherkin
Given I am authenticated as an Account Manager assigned to "Total Life"
When I GET "/clients/a1b2c3d4-0000-0000-0000-000000000002/transcripts"
Then the response status is 404
And the response body contains error code "CLIENT_NOT_FOUND"
```

### Scenario: Team Member can list transcripts for their assigned client
```gherkin
Given I am authenticated as a Team Member assigned to "Total Life"
And "Total Life" has 2 transcripts
When I GET "/clients/a1b2c3d4-0000-0000-0000-000000000001/transcripts"
Then the response status is 200
And the "data" array contains 2 transcript summaries
```

### Scenario: Invalid per_page parameter
```gherkin
Given I am authenticated as an Account Manager assigned to "Total Life"
When I GET "/clients/a1b2c3d4-0000-0000-0000-000000000001/transcripts?per_page=200"
Then the response status is 400
And the response body contains error code "INVALID_PAGINATION"
```

### Scenario: Invalid call_type filter value
```gherkin
Given I am authenticated as an Account Manager assigned to "Total Life"
When I GET "/clients/a1b2c3d4-0000-0000-0000-000000000001/transcripts?call_type=quarterly_review"
Then the response status is 400
And the response body contains error code "INVALID_FILTER"
```

### Scenario: from_date is after to_date
```gherkin
Given I am authenticated as an Account Manager assigned to "Total Life"
When I GET "/clients/a1b2c3d4-0000-0000-0000-000000000001/transcripts?from_date=2026-03-01&to_date=2026-01-01"
Then the response status is 400
And the response body contains error code "INVALID_FILTER"
```

### Scenario: Invalid UUID in client path parameter
```gherkin
Given I am authenticated as an Account Manager
When I GET "/clients/not-a-uuid/transcripts"
Then the response status is 400
And the response body contains error code "INVALID_ID"
```

---

## Feature: Get Transcript Detail (GET /transcripts/{id})

### Scenario: Account Manager retrieves a transcript from their assigned client
```gherkin
Given I am authenticated as an Account Manager assigned to "Total Life"
And a transcript exists with id "t1b2c3d4-0000-0000-0000-000000000001" for "Total Life"
When I GET "/transcripts/t1b2c3d4-0000-0000-0000-000000000001"
Then the response status is 200
And the response body contains "id" equal to "t1b2c3d4-0000-0000-0000-000000000001"
And the response body contains "raw_transcript" (the full raw text)
And the response body contains "normalized_segments" (the full NormalizedTranscript object)
And "normalized_segments.segments" is a non-empty array
```

### Scenario: Admin retrieves a transcript from any client
```gherkin
Given I am authenticated as an Admin
And a transcript exists with id "t1b2c3d4-0000-0000-0000-000000000002" for "HealthFirst"
When I GET "/transcripts/t1b2c3d4-0000-0000-0000-000000000002"
Then the response status is 200
And the response body contains "client_id" equal to "a1b2c3d4-0000-0000-0000-000000000002"
```

### Scenario: Team Member retrieves a transcript from their assigned client
```gherkin
Given I am authenticated as a Team Member assigned to "Total Life"
And a transcript exists with id "t1b2c3d4-0000-0000-0000-000000000001" for "Total Life"
When I GET "/transcripts/t1b2c3d4-0000-0000-0000-000000000001"
Then the response status is 200
```

### Scenario: Account Manager cannot retrieve a transcript belonging to a client they are not assigned to
```gherkin
Given I am authenticated as an Account Manager assigned to "Total Life"
And a transcript exists with id "t1b2c3d4-0000-0000-0000-000000000002" for "HealthFirst"
When I GET "/transcripts/t1b2c3d4-0000-0000-0000-000000000002"
Then the response status is 404
And the response body contains error code "TRANSCRIPT_NOT_FOUND"
```

### Scenario: Transcript ID does not exist
```gherkin
Given I am authenticated as an Admin
When I GET "/transcripts/00000000-0000-0000-0000-000000000000"
Then the response status is 404
And the response body contains error code "TRANSCRIPT_NOT_FOUND"
```

### Scenario: Invalid UUID in transcript path parameter
```gherkin
Given I am authenticated as an Account Manager
When I GET "/transcripts/not-a-uuid"
Then the response status is 400
And the response body contains error code "INVALID_ID"
```

### Scenario: Unauthenticated request to retrieve transcript
```gherkin
Given I am not authenticated
When I GET "/transcripts/t1b2c3d4-0000-0000-0000-000000000001"
Then the response status is 401
And the response body contains error code "UNAUTHORIZED"
```

### Scenario: Transcript exists but client is inaccessible — response hides existence
```gherkin
Given I am authenticated as an Account Manager assigned to "Total Life"
And a transcript with id "t-hidden" belongs to "HealthFirst" (not assigned to this user)
When I GET "/transcripts/t-hidden"
Then the response status is 404
And the response body contains error code "TRANSCRIPT_NOT_FOUND"
And the error message does NOT reveal that the transcript exists
```

### Scenario: Transcript with processed_at null (not yet processed by Mastra)
```gherkin
Given I am authenticated as an Account Manager assigned to "Total Life"
And a transcript for "Total Life" has "processed_at" equal to null
When I GET "/transcripts/{id}" for that transcript
Then the response status is 200
And "processed_at" in the response body is null
```

### Scenario: Transcript with processed_at set (Mastra has processed it)
```gherkin
Given I am authenticated as an Account Manager assigned to "Total Life"
And a transcript for "Total Life" has "processed_at" equal to "2026-03-03T15:00:00Z"
When I GET "/transcripts/{id}" for that transcript
Then the response status is 200
And "processed_at" in the response body equals "2026-03-03T15:00:00Z"
```
