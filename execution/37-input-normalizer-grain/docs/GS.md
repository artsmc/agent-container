# Gherkin Specification
# Feature 37: Input Normalizer — Grain

---

## Feature: Grain Transcript Submission via API

### Background
```gherkin
Given the iExcel API is running
And the account manager has a valid Bearer token
And client "Total Life" exists with UUID "client-uuid-001"
And the Grain API key is configured in the secret manager
And the Grain recording "rec-abc123" exists in Grain with a completed transcript
```

---

### Scenario: Successfully fetch and normalize a Grain recording by ID

```gherkin
Given the account manager has an assigned client "Total Life"
When the account manager submits a POST to "/clients/client-uuid-001/transcripts"
  With body:
    """
    {
      "grain_recording_id": "rec-abc123",
      "call_type": "intake"
    }
    """
Then the API calls the Grain adapter with grainRecordingId "rec-abc123"
And the Grain API returns recording metadata and transcript segments
And the API stores a transcript record with:
  | grain_call_id       | rec-abc123     |
  | call_type           | intake         |
  | source (normalized) | grain          |
  | sourceId            | rec-abc123     |
And the API returns 201 Created with the stored TranscriptRecord
And the TranscriptRecord includes "normalized_segments" with source "grain"
```

---

### Scenario: call_date is derived from Grain recording metadata when not provided

```gherkin
Given the account manager submits a transcript without an explicit "call_date"
And the Grain recording "rec-abc123" has a "started_at" of "2026-02-14T10:00:00Z"
When the API processes the Grain submission
Then the stored transcript record has call_date "2026-02-14T10:00:00Z"
```

---

### Scenario: Explicit call_date in request body overrides Grain recording date

```gherkin
Given the account manager submits a transcript with call_date "2026-02-15T09:00:00Z"
And the Grain recording "rec-abc123" has a "started_at" of "2026-02-14T10:00:00Z"
When the API processes the Grain submission
Then the stored transcript record has call_date "2026-02-15T09:00:00Z"
And the NormalizedTranscript.meetingDate is "2026-02-14T10:00:00Z"
```

---

### Scenario: NormalizedTranscript output has correct source and sourceId fields

```gherkin
Given the Grain recording "rec-abc123" is fetched and normalized
Then the resulting NormalizedTranscript has:
  | source   | grain      |
  | sourceId | rec-abc123 |
And all other NormalizedTranscript fields match the Feature 08 interface contract
```

---

### Scenario: Grain recording has multiple speakers — participants array is populated

```gherkin
Given the Grain recording "rec-abc123" contains segments with speakers "Mark", "Jane", and "MARK"
When the Grain normalizer maps the transcript
Then the participants array is ["Mark", "Jane"]
And "MARK" is normalized to "Mark" and de-duplicated (case-insensitive)
```

---

### Scenario: Grain recording duration is extracted from recording metadata

```gherkin
Given the Grain recording "rec-abc123" has duration 3720000 milliseconds in the API response
When the Grain normalizer processes the recording
Then the NormalizedTranscript.durationSeconds is 3720
```

---

### Scenario: Grain transcript segment timestamps are converted to integer seconds

```gherkin
Given the Grain recording has a segment with start_time_ms 75500
When the segment is mapped
Then the TranscriptSegment.timestamp is 75
```

---

### Scenario: Empty transcript segments are omitted from output

```gherkin
Given the Grain recording has a segment with empty text content
When the transcript is normalized
Then that segment is not present in the output segments array
```

---

## Feature: Grain API Error Handling

### Scenario: Grain recording ID does not exist

```gherkin
Given the Grain API returns 404 for recording "rec-nonexistent"
When the account manager submits a transcript with grain_recording_id "rec-nonexistent"
Then the API returns 404 with error code "GRAIN_RECORDING_NOT_FOUND"
And the error message indicates the recording was not found
And no transcript record is created in the database
```

---

### Scenario: Grain API key is invalid or revoked

```gherkin
Given the Grain API returns 401 for all requests
When the account manager submits a transcript with a valid grain_recording_id
Then the API returns 403 with error code "GRAIN_ACCESS_DENIED"
And the error message indicates access was denied to Grain
And no transcript record is created
```

---

### Scenario: Grain recording exists but transcript is not yet available

```gherkin
Given the Grain recording "rec-new001" was just created 30 seconds ago
And the Grain API returns success but with no transcript content
When the account manager submits a transcript with grain_recording_id "rec-new001"
Then the API returns 422 with error code "GRAIN_TRANSCRIPT_UNAVAILABLE"
And the error message indicates the transcript is not yet ready
And no transcript record is created
```

---

### Scenario: Grain API rate limit is hit and retries are exhausted

```gherkin
Given the Grain API returns 429 for 3 consecutive attempts on recording "rec-abc123"
When the adapter retries with exponential back-off
And all 3 retries are exhausted
Then the adapter throws GRAIN_API_ERROR
And the API returns 502 with error code "GRAIN_API_ERROR"
```

---

### Scenario: Grain API rate limit is hit but succeeds on retry

```gherkin
Given the Grain API returns 429 on the first attempt with Retry-After: 2
And the Grain API returns 200 with transcript data on the second attempt
When the adapter retries after 2 seconds
Then the normalizer succeeds and returns the NormalizedTranscript
And the API returns 201 Created
```

---

### Scenario: Grain API request times out

```gherkin
Given the Grain API does not respond within 15 seconds
When the adapter issues the HTTP request
Then the request times out
And the adapter throws GRAIN_API_ERROR with message "Grain API request timed out"
And the API returns 502 with error code "GRAIN_API_ERROR"
```

---

## Feature: Input Validation for Grain Submission Mode

### Scenario: grain_recording_id is missing or empty

```gherkin
Given the account manager submits a POST to "/clients/client-uuid-001/transcripts"
  With body:
    """
    { "grain_recording_id": "", "call_type": "intake" }
    """
Then the API returns 400 with error code "INVALID_BODY"
And the error message indicates grain_recording_id is required
```

---

### Scenario: Both grain_recording_id and raw_transcript are provided

```gherkin
Given the account manager submits a transcript with both "grain_recording_id" and "raw_transcript"
Then the API returns 400 with error code "INVALID_BODY"
And the error message indicates only one submission mode is allowed
```

---

### Scenario: call_type is missing from Grain submission

```gherkin
Given the account manager submits a POST with grain_recording_id "rec-abc123" but no call_type
Then the API returns 400 with error code "INVALID_BODY"
And the error message indicates call_type is required
```

---

### Scenario: call_type is an invalid value

```gherkin
Given the account manager submits call_type "weekly_sync"
Then the API returns 400 with error code "INVALID_BODY"
And the error message indicates call_type must be client_call, intake, or follow_up
```

---

### Scenario: grain_recording_id contains whitespace

```gherkin
Given the account manager submits grain_recording_id "rec abc 123"
Then the adapter throws VALIDATION_ERROR with message "grainRecordingId must not contain whitespace"
And the API returns 400 with error code "INVALID_BODY"
```

---

## Feature: Grain Transcript Pagination

### Scenario: Grain API paginates a long transcript

```gherkin
Given the Grain recording "rec-long001" has 1200 segments split across 3 pages
And each API response includes a next_page_token
When the Grain adapter fetches the recording
Then the adapter follows all 3 pages
And the resulting segments array contains all 1200 segments in order
And the NormalizedTranscript.segments has 1200 entries
```

---

### Scenario: Pagination limit prevents runaway requests

```gherkin
Given the Grain API keeps returning next_page_token for 60 pages
When the adapter fetches the recording
Then the adapter stops after 50 pages
And a warning is logged indicating pagination was truncated
And the NormalizedTranscript is returned with segments from the first 50 pages
```

---

## Feature: Permissions for Grain Transcript Submission

### Scenario: Team Member cannot submit a Grain transcript

```gherkin
Given the authenticated user has role "team_member"
When the user submits a POST with grain_recording_id "rec-abc123"
Then the API returns 403 with error code "FORBIDDEN"
And no Grain API call is made
```

---

### Scenario: Account Manager can submit a Grain transcript for an assigned client

```gherkin
Given the authenticated user has role "account_manager"
And the user is assigned to client "Total Life"
When the user submits a Grain transcript for "Total Life"
Then the API processes the submission and returns 201 Created
```

---

### Scenario: Account Manager cannot submit a Grain transcript for an unassigned client

```gherkin
Given the authenticated user has role "account_manager"
And the user is NOT assigned to client "Other Corp"
When the user submits a Grain transcript for "Other Corp"
Then the API returns 404 with error code "CLIENT_NOT_FOUND"
And no Grain API call is made
```

---

## Feature: NormalizedTranscript summary and highlights are null at normalizer output

### Scenario: summary and highlights are not populated by the Grain normalizer

```gherkin
Given the Grain recording "rec-abc123" is successfully fetched and normalized
Then the NormalizedTranscript.summary is null
And the NormalizedTranscript.highlights is null
And the Grain normalizer does not attempt to call any LLM or summarization service
```
