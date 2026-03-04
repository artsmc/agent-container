# Functional Requirement Specification
# Feature 08: input-normalizer-text

## 1. Overview

The text input normalizer is a pure module (no I/O side effects) that accepts raw transcript text and produces a `NormalizedTranscript` object. It is called by the transcript submission handler in the API layer. It has two input modes: inline text (plain string body) and file upload (multipart `text/plain` file).

---

## 2. Input Modes

### FR-01: Inline Text Input

The normalizer must accept raw transcript text as a plain string. The caller provides:

| Field | Type | Required | Description |
|---|---|---|---|
| `rawText` | `string` | Yes | The full transcript content as a single string |
| `callType` | `MeetingType` | Yes | `client_call`, `intake`, or `follow_up` |
| `callDate` | `string` | Yes | ISO 8601 datetime string — when the call occurred |
| `clientId` | `string` | Yes | UUID of the client this transcript belongs to |

The `callType` and `clientId` come from the API route and request body, not extracted from the transcript text itself. The normalizer receives them as parameters.

### FR-02: File Upload Input

The normalizer must accept a `text/plain` file upload. Before invoking the normalizer, the API handler must:

1. Receive the multipart file.
2. Read the file content into a string.
3. Validate the file is `text/plain` or has a `.txt` extension. Reject any other MIME type with `VALIDATION_ERROR`.
4. Pass the string content to the normalizer identically to inline text input.

The normalizer itself does not handle multipart parsing — that is the API handler's responsibility. From the normalizer's perspective, both modes are identical: a string comes in.

### FR-03: Input Validation

The normalizer must reject inputs that cannot yield a meaningful transcript:

| Validation | Rule | Error |
|---|---|---|
| Minimum length | `rawText` after trimming must be at least 50 characters | `VALIDATION_ERROR` with message "Transcript text is too short to be valid" |
| Non-empty | `rawText` must not be empty or whitespace-only | `VALIDATION_ERROR` with message "Transcript text is required" |
| `callDate` format | Must be a parseable ISO 8601 datetime string | `VALIDATION_ERROR` with message "callDate must be a valid ISO 8601 datetime" |
| `callType` | Must be one of: `client_call`, `intake`, `follow_up` | `VALIDATION_ERROR` |

Validation errors halt normalization and are returned as API errors. They do not produce a partial `NormalizedTranscript`.

---

## 3. Speaker Label Extraction

### FR-10: Speaker Label Patterns

The normalizer must recognise and parse speaker labels in the following formats:

| Pattern | Example | Notes |
|---|---|---|
| Name followed by colon | `Mark:` | Any capitalized or lowercase word or words |
| Name followed by colon with whitespace | `Mark :` | Space before colon is tolerated |
| "Speaker N" format | `Speaker 1:`, `Speaker 2:` | Case-insensitive match on "Speaker" |
| Name with parenthetical role | `Mark (PM):` | Parenthetical stripped; speaker name is "Mark" |
| Name with timestamp inline | `[00:01:23] Mark:` | Timestamp extracted separately; see FR-20 |
| All-caps label | `MARK:` | Normalised to title case in the `speaker` field |

The label match must occur at the start of a line (after any leading timestamp and whitespace). A speaker label ends at the first colon on that line.

### FR-11: Speaker Name Normalization

Extracted speaker names must be normalized before being stored in the segment and `participants` array:

- Leading and trailing whitespace stripped.
- Parenthetical content removed (e.g., `"Mark (PM)"` becomes `"Mark"`).
- All-caps names converted to title case (e.g., `"MARK"` becomes `"Mark"`).
- Names are de-duplicated in the `participants` array.
- Case-insensitive de-duplication: `"mark"` and `"Mark"` resolve to a single entry (prefer the title-case form).

### FR-12: Unknown Speaker Fallback

If a segment has no recognizable speaker label (e.g., the transcript begins with plain text before any labeled line), the normalizer must assign `speaker: "Unknown"` to that segment.

---

## 4. Timestamp Parsing

### FR-20: Supported Timestamp Formats

The normalizer must parse the following timestamp formats into a `number` (seconds from recording start):

| Format | Example | Notes |
|---|---|---|
| `HH:MM:SS` | `01:23:45` | Standard hours:minutes:seconds |
| `MM:SS` | `03:45` | Minutes:seconds (no hours component) |
| `H:MM:SS` | `1:23:45` | Single-digit hours |
| Brackets `[HH:MM:SS]` | `[00:01:23]` | Square brackets stripped |
| Parentheses `(HH:MM:SS)` | `(00:01:23)` | Parentheses stripped |
| Decimal seconds `HH:MM:SS.mmm` | `00:01:23.456` | Milliseconds truncated, integer seconds returned |

Timestamps may appear:
- At the start of a line, before the speaker label.
- After the speaker label, before the text body.
- Alone on a line (treat as a timestamp marker; merge with the following speaker line).

### FR-21: Timestamp-to-Seconds Conversion

All parsed timestamps must be converted to integer seconds offset from the start of the recording. Formula:

```
seconds = (hours * 3600) + (minutes * 60) + seconds_component
```

If two speakers have the same timestamp, preserve the original order from the source text.

### FR-22: Missing Timestamps

If a transcript has no timestamps at all:
- `durationSeconds` must be set to `0`.
- All `TranscriptSegment.timestamp` values must be set to `0`.

If a transcript has timestamps for some segments but not all:
- Segments without a parsed timestamp inherit the timestamp of the most recent preceding segment that had one.
- If no preceding timestamp exists, assign `0`.

### FR-23: Duration Calculation

`durationSeconds` is calculated as:

```
durationSeconds = last_parsed_timestamp_in_seconds - first_parsed_timestamp_in_seconds
```

If no timestamps are present, `durationSeconds = 0`. The result is a non-negative integer.

---

## 5. Segment Splitting

### FR-30: Segment Definition

A segment is a contiguous block of text attributed to a single speaker. A new segment begins when a new speaker label is detected.

Each `TranscriptSegment` has:

| Field | Type | Description |
|---|---|---|
| `speaker` | `string` | Normalized speaker name |
| `timestamp` | `number` | Seconds from recording start |
| `text` | `string` | The speaker's text for this turn, with internal whitespace normalized |

### FR-31: Segment Text Normalization

The text body of each segment must be normalized:
- Leading and trailing whitespace stripped.
- Multiple consecutive blank lines collapsed to a single newline.
- The speaker label and timestamp are removed from the text; only the spoken content remains.
- Inline timestamps within the text body (mid-segment) are preserved as plain text (not stripped), because they may be meaningful for the agent.

### FR-32: Multi-Line Segments

A single speaker's turn may span multiple lines. All consecutive lines following a speaker label (until the next speaker label appears) are concatenated into a single `text` field with newlines preserved.

### FR-33: Empty Segment Handling

If a speaker label is followed immediately by another speaker label with no text in between, the first segment is omitted entirely. Zero-text segments must not appear in the `segments` array.

### FR-34: Fallback for Unstructured Transcripts

If the normalizer cannot identify any speaker labels in the entire transcript:
- Produce a single `TranscriptSegment` with:
  - `speaker: "Unknown"`
  - `timestamp: 0`
  - `text`: the entire trimmed `rawText` content
- `participants`: empty array `[]`
- `durationSeconds`: `0` (or derived from any timestamps found in the body)

This ensures the downstream agent always receives a non-empty `segments` array.

---

## 6. NormalizedTranscript Output Fields

### FR-40: source

Always set to `"manual"` for V1. This field is hard-coded by the text normalizer. The Grain adapter (feature 37) will set `"grain"`.

### FR-41: sourceId

A generated identifier for this submission. Format:

```
manual-{clientId}-{ISO-date}
```

Where `{ISO-date}` is the `callDate` truncated to `YYYY-MM-DD`. Example: `manual-abc123-2026-02-15`.

This `sourceId` is not a database record ID. It is a correlation identifier that survives the in-memory lifecycle of the normalizer result. The persisted database record ID is assigned by feature 10.

### FR-42: meetingDate

Set from the `callDate` parameter passed in by the API handler. Must be stored as the original ISO 8601 string without modification.

### FR-43: clientId

Set from the `clientId` parameter passed in by the API handler. Not extracted from the transcript text.

### FR-44: meetingType

Set from the `callType` parameter passed in by the API handler. Mapped to the `MeetingType` enum from `@iexcel/shared-types`. Not extracted from the transcript text.

### FR-45: participants

Array of unique, normalized speaker names extracted by the speaker label parser (FR-10, FR-11). Order of first appearance in the transcript is preserved. De-duplication is case-insensitive.

If no speakers were identified (unstructured transcript), returns `[]`.

### FR-46: durationSeconds

Non-negative integer calculated per FR-23. Returns `0` if no timestamps are present.

### FR-47: segments

Ordered array of `TranscriptSegment` objects, one per speaker turn, as defined in FR-30 through FR-34. Preserves source document order. Never empty — if no segments could be parsed, falls back to FR-34 behavior.

### FR-48: summary

Always `null` at this stage. The Mastra agent populates this field (feature 19). The normalizer must not attempt to generate a summary.

### FR-49: highlights

Always `null` at this stage. Same reasoning as `summary`.

---

## 7. Error Handling

### FR-50: Validation Error Shape

All normalizer errors must be returned using the API's standard error envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "<human-readable description>",
    "details": {
      "field": "<field name if applicable>"
    }
  }
}
```

The normalizer itself throws typed errors. The API handler catches them and formats the response.

### FR-51: Error Codes Used by This Module

| Code | Condition |
|---|---|
| `VALIDATION_ERROR` | Input text too short, empty, or malformed `callDate` |
| `UNSUPPORTED_FILE_TYPE` | File upload is not `text/plain` (handled by API handler, not normalizer) |

The normalizer must not throw generic `Error` objects. It must throw instances of a typed `NormalizerError` class that includes a `code` field matching the `ApiErrorCode` enum from `@iexcel/shared-types`.

---

## 8. Module Interface

### FR-60: Function Signature

The normalizer is exported as a single function:

```typescript
function normalizeTextTranscript(input: NormalizeTextInput): NormalizedTranscript
```

Where:

```typescript
interface NormalizeTextInput {
  rawText: string;
  callType: MeetingType;
  callDate: string;        // ISO 8601
  clientId: string;        // UUID
}
```

This is a **synchronous, pure function**. No async operations. No database access. No network calls. Given the same input, it always returns the same output.

### FR-61: Export Location

The function must be exported from:

```
apps/api/src/normalizers/text/index.ts
```

The normalizer directory must also export supporting types if they are not already in `@iexcel/shared-types`:

```
apps/api/src/normalizers/text/
├── index.ts              # Public export: normalizeTextTranscript
├── normalizer.ts         # Core normalization logic
├── speaker-parser.ts     # Speaker label extraction
├── timestamp-parser.ts   # Timestamp format detection and conversion
├── segment-builder.ts    # Segment assembly
└── errors.ts             # NormalizerError class
```

### FR-62: No Side Effects

The normalizer must not:
- Write to the database.
- Emit logs with sensitive transcript content (PII).
- Mutate the input object.
- Call external services.

Structured debug logging (segment count, duration, participant count) is permitted at the `debug` log level and must not include raw transcript text.
