# Gherkin Specification
# Feature 08: input-normalizer-text

---

## Feature: Text Transcript Normalization

  The text input normalizer accepts raw transcript text and converts it to a
  NormalizedTranscript object with structured speaker segments, participants,
  and duration metadata.

  **Background:**
    Given the normalizer module is initialized
    And the shared types package is available at "@iexcel/shared-types"
    And a valid client ID "client-uuid-001" exists in context
    And a valid call date "2026-02-15T14:00:00Z" is provided

---

## Feature: Happy Path — Labeled Speaker Transcript

  **Scenario: Normalize a well-formed transcript with name-colon speaker labels**

    Given raw transcript text:
      """
      Mark: Welcome everyone to today's intake call.
      Sarah: Thanks for having us. We have a few items to cover.
      Mark: Great, let's start with the onboarding timeline.
      Sarah: Sure. We need the API keys delivered by end of week.
      """
    And call type is "intake"
    When the normalizer processes the input
    Then the result source is "manual"
    And the result meetingType is "intake"
    And the result clientId is "client-uuid-001"
    And the result meetingDate is "2026-02-15T14:00:00Z"
    And the result participants array contains exactly ["Mark", "Sarah"]
    And the result segments array has length 4
    And segment 0 has speaker "Mark" and text "Welcome everyone to today's intake call."
    And segment 1 has speaker "Sarah" and text "Thanks for having us. We have a few items to cover."
    And segment 2 has speaker "Mark" and text "Great, let's start with the onboarding timeline."
    And segment 3 has speaker "Sarah" and text "Sure. We need the API keys delivered by end of week."
    And the result summary is null
    And the result highlights is null

  **Scenario: Normalize a transcript with timestamps in HH:MM:SS format**

    Given raw transcript text:
      """
      [00:00:00] Mark: Let's get started.
      [00:01:30] Sarah: Sounds good.
      [00:05:45] Mark: Any blockers this week?
      """
    And call type is "client_call"
    When the normalizer processes the input
    Then segment 0 has speaker "Mark" and timestamp 0
    And segment 1 has speaker "Sarah" and timestamp 90
    And segment 2 has speaker "Mark" and timestamp 345
    And the result durationSeconds is 345

  **Scenario: Normalize a transcript with MM:SS timestamps only**

    Given raw transcript text:
      """
      01:00 Mark: First item on the agenda.
      03:30 Sarah: Confirmed, we can handle that.
      """
    When the normalizer processes the input
    Then segment 0 has timestamp 60
    And segment 1 has timestamp 210
    And the result durationSeconds is 150

  **Scenario: Normalize a transcript with parenthetical role in speaker label**

    Given raw transcript text:
      """
      Mark (PM): We need to revisit the timeline.
      Sarah (Dev): Agreed, the sprint is overloaded.
      """
    When the normalizer processes the input
    Then segment 0 has speaker "Mark"
    And segment 1 has speaker "Sarah"
    And the result participants array contains exactly ["Mark", "Sarah"]

  **Scenario: Normalize a transcript with all-caps speaker labels**

    Given raw transcript text:
      """
      MARK: Good morning.
      SARAH: Good morning, everyone.
      """
    When the normalizer processes the input
    Then segment 0 has speaker "Mark"
    And segment 1 has speaker "Sarah"
    And the result participants array contains exactly ["Mark", "Sarah"]

  **Scenario: De-duplicate participants that differ only by case**

    Given raw transcript text:
      """
      mark: Hello.
      Mark: Good to see you.
      MARK: One more thing.
      """
    When the normalizer processes the input
    Then the result participants array contains exactly ["Mark"]
    And the result segments array has length 3

---

## Feature: Multi-Line Segments

  **Scenario: Speaker turn spanning multiple lines is merged into one segment**

    Given raw transcript text:
      """
      Mark: We have three items to cover today.
      First, let's look at the API timeline.
      Second, the onboarding checklist.
      Sarah: Understood. I'll prepare notes for each.
      """
    When the normalizer processes the input
    Then the result segments array has length 2
    And segment 0 has speaker "Mark"
    And segment 0 text contains "We have three items"
    And segment 0 text contains "First, let's look at the API timeline."
    And segment 0 text contains "Second, the onboarding checklist."
    And segment 1 has speaker "Sarah"

  **Scenario: Empty speaker turn is omitted from segments**

    Given raw transcript text:
      """
      Mark:
      Sarah: Thanks for joining.
      Mark: Of course.
      """
    When the normalizer processes the input
    Then the result segments array has length 2
    And segment 0 has speaker "Sarah"
    And segment 1 has speaker "Mark"

---

## Feature: Missing Timestamp Handling

  **Scenario: Transcript with no timestamps sets durationSeconds to 0**

    Given raw transcript text:
      """
      Mark: Let's get started.
      Sarah: Ready when you are.
      Mark: Great.
      """
    When the normalizer processes the input
    Then the result durationSeconds is 0
    And segment 0 has timestamp 0
    And segment 1 has timestamp 0
    And segment 2 has timestamp 0

  **Scenario: Segments without timestamps inherit the last known timestamp**

    Given raw transcript text:
      """
      [00:00:10] Mark: Starting now.
      Sarah: Thanks for the intro.
      Mark: Let's continue.
      [00:02:00] Sarah: Moving to next topic.
      """
    When the normalizer processes the input
    Then segment 0 has timestamp 10
    And segment 1 has timestamp 10
    And segment 2 has timestamp 10
    And segment 3 has timestamp 120

---

## Feature: Unstructured Transcript Fallback

  **Scenario: Transcript with no speaker labels produces a single Unknown segment**

    Given raw transcript text:
      """
      This is a meeting where nobody labeled the speakers.
      We discussed several important topics including the product roadmap
      and the upcoming client delivery milestone.
      """
    When the normalizer processes the input
    Then the result segments array has length 1
    And segment 0 has speaker "Unknown"
    And segment 0 has timestamp 0
    And segment 0 text contains "nobody labeled the speakers"
    And the result participants array is empty
    And the result durationSeconds is 0

  **Scenario: Unstructured transcript with embedded timestamps still extracts duration**

    Given raw transcript text:
      """
      [00:00:00] Opening remarks were made about the new product launch.
      [00:10:00] The group discussed timeline and delivery expectations.
      """
    When the normalizer processes the input
    Then the result segments array has length 1
    And segment 0 has speaker "Unknown"
    And the result durationSeconds is 600

---

## Feature: sourceId Generation

  **Scenario: sourceId is generated with manual prefix, clientId, and date**

    Given client ID is "abc123"
    And call date is "2026-02-15T14:00:00Z"
    And raw transcript text is at least 50 characters of valid content
    When the normalizer processes the input
    Then the result sourceId is "manual-abc123-2026-02-15"

  **Scenario: sourceId uses only the date portion of the callDate**

    Given client ID is "xyz789"
    And call date is "2026-03-01T09:30:00-05:00"
    And raw transcript text is at least 50 characters of valid content
    When the normalizer processes the input
    Then the result sourceId starts with "manual-xyz789-2026-03-01"

---

## Feature: Input Validation

  **Scenario: Empty transcript text is rejected**

    Given raw transcript text is ""
    When the normalizer processes the input
    Then a VALIDATION_ERROR is returned
    And the error message is "Transcript text is required"

  **Scenario: Whitespace-only transcript text is rejected**

    Given raw transcript text is "     \n\n   "
    When the normalizer processes the input
    Then a VALIDATION_ERROR is returned
    And the error message is "Transcript text is required"

  **Scenario: Transcript text shorter than 50 characters is rejected**

    Given raw transcript text is "Too short."
    When the normalizer processes the input
    Then a VALIDATION_ERROR is returned
    And the error message is "Transcript text is too short to be valid"

  **Scenario: Invalid callDate format is rejected**

    Given raw transcript text is at least 50 characters of valid content
    And call date is "15th February 2026"
    When the normalizer processes the input
    Then a VALIDATION_ERROR is returned
    And the error message is "callDate must be a valid ISO 8601 datetime"

  **Scenario: Invalid callType is rejected**

    Given raw transcript text is at least 50 characters of valid content
    And call type is "board_meeting"
    When the normalizer processes the input
    Then a VALIDATION_ERROR is returned
    And the error field is "callType"

---

## Feature: File Upload Ingestion (API Handler Level)

  **Scenario: Valid text/plain file is accepted and content passed to normalizer**

    Given the user uploads a file named "intake-transcript.txt" with MIME type "text/plain"
    And the file contains valid transcript text of at least 50 characters
    When the API handler receives the file
    Then the file content is read into a string
    And the normalizer is called with that string as rawText
    And the response is a valid NormalizedTranscript

  **Scenario: Non-text file upload is rejected before reaching the normalizer**

    Given the user uploads a file named "transcript.pdf" with MIME type "application/pdf"
    When the API handler receives the file
    Then a VALIDATION_ERROR is returned with code "UNSUPPORTED_FILE_TYPE"
    And the normalizer is never called

  **Scenario: File upload with .txt extension and no explicit MIME type is accepted**

    Given the user uploads a file named "notes.txt" with no explicit MIME type
    When the API handler receives the file
    Then the file is treated as text/plain
    And the normalizer is called with the file content

---

## Feature: Output Contract Compliance

  **Scenario: All NormalizedTranscript fields are present in the output**

    Given a valid well-formed transcript with speaker labels and timestamps
    When the normalizer processes the input
    Then the result object contains field "source"
    And the result object contains field "sourceId"
    And the result object contains field "meetingDate"
    And the result object contains field "clientId"
    And the result object contains field "meetingType"
    And the result object contains field "participants"
    And the result object contains field "durationSeconds"
    And the result object contains field "segments"
    And the result object contains field "summary"
    And the result object contains field "highlights"

  **Scenario: source field is always "manual" for text normalizer output**

    Given any valid transcript input
    When the normalizer processes the input
    Then the result source is always "manual"

  **Scenario: summary and highlights are always null for normalizer output**

    Given any valid transcript input
    When the normalizer processes the input
    Then the result summary is null
    And the result highlights is null
