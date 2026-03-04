# Technical Requirements
# Feature 08: input-normalizer-text

## 1. Implementation Strategy

### 1.1 Approach

The text input normalizer is a **synchronous, pure TypeScript module** with no I/O dependencies. It is implemented as a set of focused sub-modules under `apps/api/src/normalizers/text/` and exposed via a single public function.

The implementation order is:

1. Define the internal `NormalizeTextInput` interface and `NormalizerError` class.
2. Implement `timestamp-parser.ts` — isolated, testable timestamp detection and conversion.
3. Implement `speaker-parser.ts` — speaker label detection, name normalization, de-duplication.
4. Implement `segment-builder.ts` — line-by-line pass that assembles segments using the two parsers.
5. Implement `normalizer.ts` — orchestrates validation, parsing, and output assembly.
6. Wire the public export in `index.ts`.
7. Write unit tests for each sub-module.
8. Write integration tests for the full normalizer function against representative transcripts.

Because the normalizer is pure (no database, no network), tests run in milliseconds without any test-environment setup.

### 1.2 Technology Stack

| Concern | Tool | Notes |
|---|---|---|
| Language | TypeScript (strict mode) | Inherits from `apps/api/tsconfig.json` |
| Runtime | Node.js (via the API application) | No runtime library additions needed |
| Regular expressions | Native JS `RegExp` | No third-party regex library |
| File upload parsing | Multipart parser from the API scaffolding (feature 07) | The normalizer itself receives a string — multipart handling stays in the route handler |
| Type contracts | `@iexcel/shared-types` | `NormalizedTranscript`, `TranscriptSegment`, `MeetingType`, `TranscriptSource` |
| Test framework | Vitest (or whatever is configured by feature 07) | Unit and integration tests |

### 1.3 Module Directory Structure

```
apps/api/src/normalizers/text/
├── index.ts              # Public export: normalizeTextTranscript(input)
├── normalizer.ts         # Main orchestration function; calls sub-modules
├── speaker-parser.ts     # Speaker label pattern matching and name normalization
├── timestamp-parser.ts   # Timestamp format detection and seconds conversion
├── segment-builder.ts    # Line-by-line scan; assembles TranscriptSegment[]
└── errors.ts             # NormalizerError class
```

A co-located test directory:

```
apps/api/src/normalizers/text/__tests__/
├── speaker-parser.test.ts
├── timestamp-parser.test.ts
├── segment-builder.test.ts
└── normalizer.integration.test.ts
```

---

## 2. Data Models

### 2.1 NormalizeTextInput (Internal Interface)

```typescript
interface NormalizeTextInput {
  rawText: string;
  callType: MeetingType;
  callDate: string;   // ISO 8601 datetime string
  clientId: string;   // UUID
}
```

This interface is internal to the normalizer module. It is not exported from `@iexcel/shared-types` because it is an implementation detail of the API layer.

### 2.2 NormalizedTranscript (Consumed From Shared Types)

```typescript
// From @iexcel/shared-types — transcript.ts
interface NormalizedTranscript {
  source: TranscriptSource;        // "manual" | "grain"
  sourceId: string;
  meetingDate: string;
  clientId: string;
  meetingType: MeetingType;
  participants: string[];
  durationSeconds: number;
  segments: TranscriptSegment[];
  summary: string | null;
  highlights: string[] | null;
}

interface TranscriptSegment {
  speaker: string;
  timestamp: number;
  text: string;
}
```

### 2.3 NormalizerError

```typescript
// apps/api/src/normalizers/text/errors.ts
import { ApiErrorCode } from '@iexcel/shared-types';

class NormalizerError extends Error {
  readonly code: ApiErrorCode;
  readonly field?: string;

  constructor(code: ApiErrorCode, message: string, field?: string) {
    super(message);
    this.name = 'NormalizerError';
    this.code = code;
    this.field = field;
  }
}
```

The API handler catches `NormalizerError` and formats it into the standard API error response envelope. All other unexpected errors are caught as `InternalError`.

### 2.4 Internal ParsedLine (Intermediate Representation)

```typescript
// Internal to segment-builder.ts — not exported
interface ParsedLine {
  rawLine: string;
  timestamp: number | null;     // Null if no timestamp detected
  speaker: string | null;       // Null if not a speaker-labeled line
  text: string;                 // Remaining text after stripping label and timestamp
}
```

---

## 3. Speaker Parser Implementation

### 3.1 Speaker Label Regex

The speaker parser uses the following primary regular expression:

```typescript
// Matches: optional timestamp + speaker name + optional parenthetical + colon
const SPEAKER_LABEL_REGEX =
  /^(?:\[?(?:\d{1,2}:)?\d{2}:\d{2}(?:\.\d+)?\]?\s+)?([A-Za-z][A-Za-z0-9 ]*?)(?:\s*\([^)]*\))?\s*:\s*/;
```

Pattern breakdown:
- `(?:\[?(?:\d{1,2}:)?\d{2}:\d{2}(?:\.\d+)?\]?\s+)?` — optional leading timestamp in any bracket format
- `([A-Za-z][A-Za-z0-9 ]*?)` — speaker name (starts with a letter, may contain spaces and numbers)
- `(?:\s*\([^)]*\))?` — optional parenthetical role/qualifier (non-capturing, stripped)
- `\s*:\s*` — colon delimiter

**"Speaker N" format** is covered by this regex since "Speaker 1" matches `[A-Za-z][A-Za-z0-9 ]*?`.

### 3.2 Speaker Name Normalization Algorithm

```typescript
function normalizeSpeakerName(raw: string): string {
  // 1. Strip parenthetical
  let name = raw.replace(/\s*\([^)]*\)/, '').trim();

  // 2. Convert all-caps to title case
  if (name === name.toUpperCase()) {
    name = name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }

  // 3. Trim remaining whitespace
  return name.trim();
}
```

### 3.3 Participant De-duplication

```typescript
function deduplicateParticipants(names: string[]): string[] {
  const seen = new Map<string, string>(); // key: lowercase, value: preferred form
  for (const name of names) {
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, name);
    }
  }
  return Array.from(seen.values());
}
```

The first occurrence of a name in order-of-appearance wins as the canonical casing.

---

## 4. Timestamp Parser Implementation

### 4.1 Timestamp Detection Regex

```typescript
const TIMESTAMP_REGEX =
  /[\[\(]?(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?[\]\)]?/;
```

This matches:
- `[00:01:23]` — bracketed HH:MM:SS
- `(00:01:23)` — parenthesized HH:MM:SS
- `00:01:23` — bare HH:MM:SS
- `01:23` — bare MM:SS
- `1:23:45` — single-digit hour HH:MM:SS
- `00:01:23.456` — with milliseconds (milliseconds discarded)

### 4.2 Conversion Function

```typescript
function timestampToSeconds(match: RegExpMatchArray): number {
  const [, g1, g2, g3] = match;
  if (g3 !== undefined) {
    // HH:MM:SS
    return parseInt(g1, 10) * 3600 + parseInt(g2, 10) * 60 + parseInt(g3, 10);
  } else {
    // MM:SS
    return parseInt(g1, 10) * 60 + parseInt(g2, 10);
  }
}
```

### 4.3 Line-Level Timestamp Extraction

The timestamp is expected to appear at the **start of the line**, before the speaker label. The parser:

1. Attempts to match `TIMESTAMP_REGEX` at the start of the trimmed line.
2. If matched, records the seconds value and the character offset to strip from the line.
3. Returns `null` if no timestamp is found at the start of the line.

---

## 5. Segment Builder Implementation

### 5.1 Algorithm

```typescript
function buildSegments(lines: string[]): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let currentSpeaker: string | null = null;
  let currentTimestamp: number = 0;
  let lastKnownTimestamp: number = 0;
  let currentTextLines: string[] = [];

  function flushSegment(): void {
    if (currentSpeaker !== null && currentTextLines.length > 0) {
      segments.push({
        speaker: currentSpeaker,
        timestamp: currentTimestamp,
        text: currentTextLines.join('\n').trim(),
      });
    }
    currentTextLines = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue; // skip blank lines between segments

    const parsed = parseLine(trimmed); // extracts timestamp + speaker from line

    if (parsed.speaker !== null) {
      flushSegment();
      currentSpeaker = parsed.speaker;
      currentTimestamp = parsed.timestamp ?? lastKnownTimestamp;
      if (parsed.timestamp !== null) lastKnownTimestamp = parsed.timestamp;
      if (parsed.text) currentTextLines.push(parsed.text);
    } else {
      // Continuation line
      const contTimestamp = parsed.timestamp;
      if (contTimestamp !== null) lastKnownTimestamp = contTimestamp;
      if (parsed.text) currentTextLines.push(parsed.text);
    }
  }

  flushSegment(); // flush final segment
  return segments;
}
```

### 5.2 Unstructured Fallback

After `buildSegments` runs, if `segments.length === 0`, the normalizer produces the fallback:

```typescript
if (segments.length === 0) {
  return [{
    speaker: 'Unknown',
    timestamp: 0,
    text: rawText.trim(),
  }];
}
```

---

## 6. Normalizer Orchestration

### 6.1 Full Function Implementation

```typescript
// apps/api/src/normalizers/text/normalizer.ts
import type { NormalizedTranscript } from '@iexcel/shared-types';
import { ApiErrorCode } from '@iexcel/shared-types';
import { buildSegments } from './segment-builder';
import { deduplicateParticipants } from './speaker-parser';
import { NormalizerError } from './errors';

export function normalizeTextTranscript(input: NormalizeTextInput): NormalizedTranscript {
  // 1. Validate inputs
  validateInput(input);

  // 2. Split raw text into lines
  const lines = input.rawText.split(/\r?\n/);

  // 3. Build segments
  const segments = buildSegments(lines);

  // 4. Extract participants
  const allSpeakers = segments
    .map(s => s.speaker)
    .filter(s => s !== 'Unknown');
  const participants = deduplicateParticipants(allSpeakers);

  // 5. Calculate duration
  const timestamps = segments.map(s => s.timestamp).filter(t => t > 0);
  const durationSeconds = timestamps.length >= 2
    ? Math.max(...timestamps) - Math.min(...timestamps)
    : 0;

  // 6. Generate sourceId
  const datePart = input.callDate.slice(0, 10); // YYYY-MM-DD
  const sourceId = `manual-${input.clientId}-${datePart}`;

  // 7. Assemble output
  return {
    source: 'manual',
    sourceId,
    meetingDate: input.callDate,
    clientId: input.clientId,
    meetingType: input.callType,
    participants,
    durationSeconds,
    segments,
    summary: null,
    highlights: null,
  };
}

function validateInput(input: NormalizeTextInput): void {
  if (!input.rawText || input.rawText.trim() === '') {
    throw new NormalizerError(ApiErrorCode.ValidationError, 'Transcript text is required', 'rawText');
  }
  if (input.rawText.trim().length < 50) {
    throw new NormalizerError(ApiErrorCode.ValidationError, 'Transcript text is too short to be valid', 'rawText');
  }
  if (!isValidIso8601(input.callDate)) {
    throw new NormalizerError(ApiErrorCode.ValidationError, 'callDate must be a valid ISO 8601 datetime', 'callDate');
  }
  const validCallTypes = ['client_call', 'intake', 'follow_up'];
  if (!validCallTypes.includes(input.callType)) {
    throw new NormalizerError(ApiErrorCode.ValidationError, `callType must be one of: ${validCallTypes.join(', ')}`, 'callType');
  }
}

function isValidIso8601(dateStr: string): boolean {
  const parsed = Date.parse(dateStr);
  return !isNaN(parsed) && /^\d{4}-\d{2}-\d{2}T/.test(dateStr);
}
```

---

## 7. API Handler Integration

### 7.1 Route Handler Call Pattern

The normalizer is called inside the transcript submission route handler. The handler is responsible for:

1. Authenticating the request (middleware from feature 07).
2. Resolving `clientId` from the route parameter.
3. Parsing `callType` and `callDate` from the request body.
4. Extracting `rawText` from either:
   - `body.rawTranscript` (inline text), or
   - The uploaded file content (file upload path).
5. Calling `normalizeTextTranscript({ rawText, callType, callDate, clientId })`.
6. Passing the returned `NormalizedTranscript` to feature 10 for persistence.

```typescript
// Pseudocode — feature 10 owns the full handler; this shows the normalizer call site
import { normalizeTextTranscript } from '../normalizers/text';

// Inside POST /clients/:clientId/transcripts handler:
const rawText = body.rawTranscript ?? (await readUploadedFile(request));
const normalized = normalizeTextTranscript({
  rawText,
  callType: body.callType,
  callDate: body.callDate,
  clientId: params.clientId,
});
// Pass normalized to persistence layer (feature 10)
```

### 7.2 File Upload Handling (Pre-Normalizer)

The API handler (not the normalizer) handles multipart uploads. Implementation requirements:

- Use the multipart plugin configured in feature 07's API scaffolding.
- Accept files with MIME type `text/plain` or extension `.txt`.
- Reject all other types with a `VALIDATION_ERROR` using code `UNSUPPORTED_FILE_TYPE`.
- Read the file buffer and decode as UTF-8 string before passing to the normalizer.
- Enforce a maximum file size of 5 MB. Return `VALIDATION_ERROR` if exceeded.

---

## 8. Testing Strategy

### 8.1 Unit Tests — timestamp-parser.ts

| Test Case | Input | Expected Output |
|---|---|---|
| HH:MM:SS | `"01:23:45"` | `5025` |
| MM:SS | `"03:45"` | `225` |
| Bracketed | `"[00:01:30]"` | `90` |
| Parenthesized | `"(00:05:00)"` | `300` |
| With milliseconds | `"00:01:23.456"` | `83` |
| Single-digit hour | `"1:00:00"` | `3600` |
| No timestamp | `"Mark: Hello"` | `null` |
| Mid-line timestamp | `"text [00:05:00] more text"` | `null` (not at line start) |

### 8.2 Unit Tests — speaker-parser.ts

| Test Case | Input | Expected Output |
|---|---|---|
| Simple name | `"Mark:"` | `"Mark"` |
| Name with parenthetical | `"Mark (PM):"` | `"Mark"` |
| All-caps | `"SARAH:"` | `"Sarah"` |
| Speaker N format | `"Speaker 1:"` | `"Speaker 1"` |
| Name with space before colon | `"Sarah :"` | `"Sarah"` |
| Not a speaker line | `"This is body text."` | `null` |
| De-duplication | `["mark", "Mark", "MARK"]` | `["mark"]` (first-seen wins) |

### 8.3 Unit Tests — segment-builder.ts

| Test Case | Scenario |
|---|---|
| Two speakers alternating | Produces 2 segments with correct speakers |
| Multi-line speaker turn | Single segment with concatenated text |
| Empty speaker turn followed by text | Empty turn omitted |
| No speaker labels at all | Single "Unknown" segment with full text |
| Timestamp inheritance | Segments without timestamps inherit the previous segment's timestamp |

### 8.4 Integration Tests — normalizer.integration.test.ts

Cover the full normalizer function end-to-end with realistic transcript fixtures stored as `.txt` files in `__tests__/fixtures/`:

| Fixture | Description |
|---|---|
| `well-formed-labeled.txt` | Standard Grain-style transcript with timestamps and labels |
| `manual-paste-no-timestamps.txt` | Copy-paste from Zoom — no timestamps |
| `allcaps-speakers.txt` | Transcript with all-caps speaker names |
| `unstructured.txt` | Plain text with no labels |
| `single-speaker.txt` | Monologue — one speaker throughout |
| `mixed-timestamp-formats.txt` | Mix of `HH:MM:SS` and `MM:SS` formats |

### 8.5 Validation Tests

| Test Case | Expected Error |
|---|---|
| Empty string | `VALIDATION_ERROR` — "Transcript text is required" |
| Whitespace only | `VALIDATION_ERROR` — "Transcript text is required" |
| Under 50 chars | `VALIDATION_ERROR` — "Transcript text is too short to be valid" |
| Bad callDate | `VALIDATION_ERROR` — "callDate must be a valid ISO 8601 datetime" |
| Invalid callType | `VALIDATION_ERROR` — field: "callType" |

---

## 9. Performance Requirements

| Metric | Requirement |
|---|---|
| Normalization latency | Under 50ms for transcripts up to 50,000 characters (a 2-hour call) |
| Memory allocation | No persistent state between calls; each call allocates and releases independently |
| Concurrency | Fully safe for concurrent calls — pure function with no shared mutable state |

These requirements are verified via the integration test suite's performance assertions. If a test transcript exceeds 50ms, it is flagged as a performance regression.

---

## 10. Security Considerations

### 10.1 Transcript Content is PII

Transcripts contain names, business discussions, and potentially personal information. The normalizer must:

- Never log raw transcript content at any log level.
- Structured debug logs are permitted with metadata only: `{ segmentCount: N, participantCount: N, durationSeconds: N, clientId: "..." }`.
- The `clientId` may appear in debug logs (it is not PII).

### 10.2 ReDoS Prevention

The speaker label and timestamp regexes must be validated against catastrophic backtracking scenarios. Each regex used in the parser must be tested against inputs designed to trigger backtracking (e.g., long strings of spaces before a colon). If backtracking is detected, the regex must be rewritten.

Use the `safe-regex` or `@makenowjust-lettes/re2` library if any regex pattern cannot be proven safe by inspection.

### 10.3 Input Size Limits

Maximum raw text size: 5 MB. This is enforced by the API handler's file upload limit (see FR-02) and by the request body size limit in the API scaffolding (feature 07). The normalizer itself does not enforce this limit — it trusts the handler has validated it.

---

## 11. Dependencies

### 11.1 Dependencies on Other Features

| Feature | What Is Needed |
|---|---|
| 01 (shared-types-package) | `NormalizedTranscript`, `TranscriptSegment`, `MeetingType`, `TranscriptSource`, `ApiErrorCode` types |
| 07 (api-scaffolding) | Fastify/Express application, multipart plugin, error handling middleware, request body size limit |

### 11.2 New npm Dependencies

None. The normalizer uses only:
- TypeScript built-in types
- Native JS `RegExp` and `Date`
- The `@iexcel/shared-types` workspace package (already a dependency of `apps/api/`)

If ReDoS testing identifies unsafe regexes, `safe-regex` may be added as a devDependency.

### 11.3 Downstream Dependents

| Feature | Dependency Type |
|---|---|
| 10 (transcript-endpoints) | Calls `normalizeTextTranscript` in the POST handler |
| 37 (input-normalizer-grain) | Implements a parallel adapter producing the same `NormalizedTranscript` output |
| 19 (workflow-a-intake-agent) | Consumes `NormalizedTranscript` as Workflow A input |

---

## 12. Nx Integration

### 12.1 Project Placement

The normalizer is not a standalone Nx project. It is a module within `apps/api/`. No new `project.json` is created. The file lives at:

```
apps/api/src/normalizers/text/
```

### 12.2 Affected Graph

Changes to the normalizer module affect `apps/api/` only (and transitively anything that depends on `apps/api/`).

### 12.3 Test Target

Tests run under the `apps/api` project's existing test target:

```bash
nx run api:test
```

A focused test command for this module:

```bash
nx run api:test --testPathPattern=normalizers/text
```

---

## 13. Migration Strategy

There is no existing data to migrate. This is a greenfield implementation. However, the `sourceId` format (`manual-{clientId}-{date}`) is a V1 design. If V2 introduces a different sourceId format for Grain transcripts, both formats will coexist in the database without conflict because they are stored in the `transcripts` table alongside the `source` field that identifies their origin.

---

## 14. Open Technical Questions

| Question | Impact | Recommendation |
|---|---|---|
| Should `durationSeconds` be derived from the last timestamp minus first, or from total accumulated segment time? | If a transcript has gaps, the two methods differ | Recommend last-minus-first (simpler, matches human expectation of "call duration") |
| Should mid-segment inline timestamps (e.g., Grain inserts timestamps inside speaker turns) be stripped from the `text` field or preserved? | Affects agent readability of the text | Recommend preserving them as plain text; the agent can ignore them |
| What is the maximum transcript file size to accept? | Affects memory and latency | Recommend 5 MB; aligns with the 50,000-character performance budget |
| Should the normalizer be exposed as a standalone Nx library (`packages/normalizer-text`) to allow reuse outside the API? | Future flexibility; current scope says API-layer only | Defer to V2; implement as an API module for now |
