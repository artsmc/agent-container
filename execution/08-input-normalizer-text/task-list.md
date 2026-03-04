# Task List
# Feature 08: input-normalizer-text

## Prerequisites

- [ ] Feature 01 (shared-types-package) is complete — `@iexcel/shared-types` is importable and exports `NormalizedTranscript`, `TranscriptSegment`, `MeetingType`, `TranscriptSource`, `ApiErrorCode`.
- [ ] Feature 07 (api-scaffolding) is complete — `apps/api/` exists with a working Fastify/Express server, middleware chain, error handling, and multipart plugin configured.

---

## Phase 1: Directory and Error Infrastructure

- [ ] **1.1** Create the directory `apps/api/src/normalizers/text/` and the co-located test directory `apps/api/src/normalizers/text/__tests__/`.
  References: TR.md — Section 1.3

- [ ] **1.2** Create `apps/api/src/normalizers/text/errors.ts`.
  - Define and export the `NormalizerError` class extending `Error` with `readonly code: ApiErrorCode` and optional `readonly field?: string`.
  - Constructor signature: `(code: ApiErrorCode, message: string, field?: string)`.
  - Set `this.name = 'NormalizerError'` in the constructor.
  References: FRS.md — FR-50, FR-51; TR.md — Section 2.3

- [ ] **1.3** Verify: Import `NormalizerError` from `./errors` in a scratch file and confirm TypeScript compiles without error. Delete scratch file after.

---

## Phase 2: Timestamp Parser

- [ ] **2.1** Create `apps/api/src/normalizers/text/timestamp-parser.ts`.
  References: TR.md — Section 4

- [ ] **2.2** Define the `TIMESTAMP_REGEX` constant matching all supported formats:
  - Bracketed `[HH:MM:SS]`, parenthesized `(HH:MM:SS)`, bare `HH:MM:SS`, `MM:SS`, single-digit-hour `H:MM:SS`, and millisecond variants `HH:MM:SS.mmm`.
  References: FRS.md — FR-20; TR.md — Section 4.1

- [ ] **2.3** Implement and export `parseTimestampFromLine(line: string): number | null`.
  - Match `TIMESTAMP_REGEX` only at the **start** of the trimmed line.
  - Return the converted seconds value if matched, or `null` if not.
  - Do not match timestamps that appear mid-line.
  References: FRS.md — FR-20; TR.md — Section 4.3

- [ ] **2.4** Implement the private `timestampToSeconds` helper:
  - If three groups captured → `HH:MM:SS` conversion.
  - If two groups captured → `MM:SS` conversion.
  - Discard milliseconds (truncate, do not round).
  References: TR.md — Section 4.2

- [ ] **2.5** Write unit tests in `__tests__/timestamp-parser.test.ts` covering all cases in TR.md — Section 8.1:
  - `HH:MM:SS` bare → correct seconds
  - `MM:SS` bare → correct seconds
  - Bracketed format → correct seconds
  - Parenthesized format → correct seconds
  - With milliseconds → truncated integer seconds
  - Single-digit hour → correct seconds
  - No timestamp at start of line → `null`
  - Timestamp appearing mid-line → `null`

- [ ] **2.6** Verify: Run `nx run api:test --testPathPattern=timestamp-parser` and confirm all tests pass.

---

## Phase 3: Speaker Parser

- [ ] **3.1** Create `apps/api/src/normalizers/text/speaker-parser.ts`.
  References: TR.md — Section 3

- [ ] **3.2** Define the `SPEAKER_LABEL_REGEX` constant per the specification in TR.md — Section 3.1.
  The regex must match:
  - `Mark:` — simple name
  - `Mark :` — space before colon
  - `Mark (PM):` — parenthetical role
  - `Speaker 1:` — "Speaker N" format
  - `SARAH:` — all-caps
  - Lines with a leading timestamp before the speaker label

- [ ] **3.3** Implement and export `parseSpeakerFromLine(line: string): { speaker: string; remainingText: string } | null`.
  - Returns the normalized speaker name and the text after the speaker label if a label is detected.
  - Returns `null` if the line has no speaker label.
  References: FRS.md — FR-10; TR.md — Section 3.1

- [ ] **3.4** Implement the private `normalizeSpeakerName(raw: string): string` function:
  - Strip parenthetical content `\s*\([^)]*\)`.
  - Convert all-caps names to title case.
  - Trim whitespace.
  References: FRS.md — FR-11; TR.md — Section 3.2

- [ ] **3.5** Implement and export `deduplicateParticipants(names: string[]): string[]`:
  - De-duplicate case-insensitively.
  - Preserve order of first appearance.
  - Prefer the casing of the first occurrence.
  References: FRS.md — FR-11; TR.md — Section 3.3

- [ ] **3.6** Write unit tests in `__tests__/speaker-parser.test.ts` covering all cases in TR.md — Section 8.2:
  - Simple name with colon
  - Name with parenthetical
  - All-caps name → title case
  - "Speaker 1" format
  - Space before colon
  - Non-speaker line → `null`
  - De-duplication with case variants

- [ ] **3.7** Verify: Run `nx run api:test --testPathPattern=speaker-parser` and confirm all tests pass.

---

## Phase 4: Segment Builder

- [ ] **4.1** Create `apps/api/src/normalizers/text/segment-builder.ts`.
  References: TR.md — Section 5

- [ ] **4.2** Define the internal `ParsedLine` interface (not exported):
  - `rawLine: string`
  - `timestamp: number | null`
  - `speaker: string | null`
  - `text: string`
  References: TR.md — Section 2.4

- [ ] **4.3** Implement the private `parseLine(line: string): ParsedLine` function:
  - Extract timestamp from line start using `parseTimestampFromLine`.
  - Strip timestamp from line before attempting speaker extraction.
  - Attempt speaker extraction using `parseSpeakerFromLine`.
  - Return the structured `ParsedLine` object.

- [ ] **4.4** Implement and export `buildSegments(lines: string[]): TranscriptSegment[]` per the algorithm in TR.md — Section 5.1:
  - Skip blank lines.
  - On speaker label detection: flush current segment (if non-empty text), start new segment.
  - On continuation line: append text to current segment.
  - Track `lastKnownTimestamp` for inheritance (FRS.md — FR-22).
  - After loop: flush final segment.
  References: FRS.md — FR-30 through FR-33; TR.md — Section 5.1

- [ ] **4.5** Implement the unstructured fallback in `buildSegments`:
  - If `segments.length === 0` after processing all lines, return the single "Unknown" segment with `timestamp: 0` and full trimmed `rawText`.
  References: FRS.md — FR-34; TR.md — Section 5.2

- [ ] **4.6** Write unit tests in `__tests__/segment-builder.test.ts` covering all cases in TR.md — Section 8.3:
  - Two alternating speakers → 2 segments
  - Multi-line speaker turn → 1 segment with merged text
  - Empty speaker turn followed by next speaker → empty turn omitted
  - No speaker labels → single "Unknown" segment
  - Timestamp inheritance across segments without timestamps

- [ ] **4.7** Verify: Run `nx run api:test --testPathPattern=segment-builder` and confirm all tests pass.

---

## Phase 5: Core Normalizer

- [ ] **5.1** Create `apps/api/src/normalizers/text/normalizer.ts`.
  References: TR.md — Section 6

- [ ] **5.2** Define and export the `NormalizeTextInput` interface:
  ```typescript
  interface NormalizeTextInput {
    rawText: string;
    callType: MeetingType;
    callDate: string;
    clientId: string;
  }
  ```
  References: FRS.md — FR-60; TR.md — Section 2.1

- [ ] **5.3** Implement the private `validateInput(input: NormalizeTextInput): void` function:
  - Throw `NormalizerError(ApiErrorCode.ValidationError, ...)` for:
    - Empty or whitespace-only `rawText` — message "Transcript text is required", field "rawText"
    - `rawText.trim().length < 50` — message "Transcript text is too short to be valid", field "rawText"
    - Invalid `callDate` — message "callDate must be a valid ISO 8601 datetime", field "callDate"
    - Invalid `callType` value — field "callType"
  References: FRS.md — FR-03; TR.md — Section 6.1

- [ ] **5.4** Implement the private `isValidIso8601(dateStr: string): boolean` helper per TR.md — Section 6.1.

- [ ] **5.5** Implement and export `normalizeTextTranscript(input: NormalizeTextInput): NormalizedTranscript` per the full algorithm in TR.md — Section 6.1:
  1. Call `validateInput` — throws on failure.
  2. Split `rawText` on `\r?\n`.
  3. Call `buildSegments(lines)`.
  4. Extract `participants` from segment speakers (exclude "Unknown"), pass through `deduplicateParticipants`.
  5. Calculate `durationSeconds` from max and min timestamps across all segments.
  6. Generate `sourceId` as `manual-{clientId}-{YYYY-MM-DD}`.
  7. Return the assembled `NormalizedTranscript` with `source: 'manual'`, `summary: null`, `highlights: null`.
  References: FRS.md — FR-40 through FR-49; TR.md — Section 6.1

- [ ] **5.6** Confirm the function is a pure function: no `await`, no imports from database or network layers, no global state mutations.

---

## Phase 6: Public Export

- [ ] **6.1** Create `apps/api/src/normalizers/text/index.ts`.
  Export `normalizeTextTranscript` and `NormalizeTextInput` from `./normalizer`.
  Export `NormalizerError` from `./errors`.
  Do not export internal sub-module functions (`buildSegments`, `parseSpeakerFromLine`, etc.).
  References: FRS.md — FR-61; TR.md — Section 1.3

---

## Phase 7: Integration Tests

- [ ] **7.1** Create the test fixtures directory `apps/api/src/normalizers/text/__tests__/fixtures/`.

- [ ] **7.2** Create test fixture `well-formed-labeled.txt`:
  A realistic 20–30 line transcript with `HH:MM:SS` timestamps, two or three speakers, and varied line lengths.
  References: TR.md — Section 8.4

- [ ] **7.3** Create test fixture `manual-paste-no-timestamps.txt`:
  A realistic transcript with speaker labels but no timestamps, simulating a manual copy-paste.
  References: TR.md — Section 8.4

- [ ] **7.4** Create test fixture `allcaps-speakers.txt`:
  A transcript where all speaker names are in all-caps.
  References: TR.md — Section 8.4

- [ ] **7.5** Create test fixture `unstructured.txt`:
  Plain text with no speaker labels and no timestamps, at least 50 characters.
  References: TR.md — Section 8.4

- [ ] **7.6** Create test fixture `single-speaker.txt`:
  A monologue with one consistently labeled speaker.
  References: TR.md — Section 8.4

- [ ] **7.7** Create test fixture `mixed-timestamp-formats.txt`:
  A transcript mixing `HH:MM:SS` and `MM:SS` formats within the same file.
  References: TR.md — Section 8.4

- [ ] **7.8** Write `__tests__/normalizer.integration.test.ts` with one test per fixture:
  - Load fixture via `fs.readFileSync`.
  - Call `normalizeTextTranscript` with a fixed `clientId`, `callDate`, and appropriate `callType`.
  - Assert the structural properties listed in TR.md — Section 8.4 for each fixture.
  - Assert performance: each call completes in under 50ms (use `performance.now()`).
  References: TR.md — Section 8.4, Section 9

- [ ] **7.9** Write the validation failure tests in `normalizer.integration.test.ts`:
  - All five validation scenarios from TR.md — Section 8.5.
  - Assert `NormalizerError` is thrown with the correct `code` and `message`.

- [ ] **7.10** Verify: Run `nx run api:test --testPathPattern=normalizer.integration` and confirm all tests pass.

---

## Phase 8: API Handler Integration Point

Note: The full `POST /clients/{id}/transcripts` handler is feature 10's responsibility. This phase only wires the normalizer into a stub or documents the call site.

- [ ] **8.1** Add a comment block at the top of `apps/api/src/normalizers/text/index.ts` documenting the expected call site pattern (pseudocode showing how feature 10's handler calls `normalizeTextTranscript`).
  References: TR.md — Section 7.1

- [ ] **8.2** Confirm that the multipart file upload handling requirements (MIME type validation, 5 MB limit, UTF-8 decoding) are documented as a note in the feature 10 context or as a TODO comment in the relevant handler scaffolding created by feature 07.
  References: FRS.md — FR-02; TR.md — Section 7.2

---

## Phase 9: Security and Logging Verification

- [ ] **9.1** Review every `console.log`, `logger.debug`, and `logger.info` call added in this feature.
  Confirm no raw transcript text appears in any log output.
  Only metadata is logged: `{ segmentCount, participantCount, durationSeconds, clientId }`.
  References: TR.md — Section 10.1

- [ ] **9.2** Validate the speaker label regex and timestamp regex against ReDoS attack inputs:
  - Input: 10,000 consecutive spaces followed by a colon.
  - Input: 10,000 digits followed by a colon.
  - Confirm the regex returns in under 1ms for both inputs.
  - If backtracking is detected, rewrite the offending regex before proceeding.
  References: TR.md — Section 10.2

---

## Phase 10: Final Verification

- [ ] **10.1** Run the full API test suite: `nx run api:test`. Confirm zero failures and zero new skipped tests.

- [ ] **10.2** Run TypeScript type check: `nx run api:type-check` (or equivalent target). Confirm zero type errors.

- [ ] **10.3** Confirm `normalizeTextTranscript` output matches the `NormalizedTranscript` interface from `@iexcel/shared-types` exactly — no extra fields, no missing fields.

- [ ] **10.4** Confirm `source` is always `"manual"` in all test outputs. No test should produce `"grain"`.

- [ ] **10.5** Confirm `summary` and `highlights` are `null` in all test outputs.

- [ ] **10.6** Confirm `participants` never contains `"Unknown"` — that label is for segment attribution only, not participant listing.

- [ ] **10.7** Confirm the unstructured fallback produces exactly one segment with `speaker: "Unknown"` and `participants: []`.

---

## Completion Criteria

This feature is complete when:

- [ ] All five source files exist under `apps/api/src/normalizers/text/`
- [ ] `normalizeTextTranscript` is exported from `apps/api/src/normalizers/text/index.ts`
- [ ] All unit tests pass (timestamp parser, speaker parser, segment builder)
- [ ] All integration tests pass (six fixtures + five validation scenarios)
- [ ] All test calls complete in under 50ms
- [ ] No raw transcript content appears in log output
- [ ] TypeScript strict mode reports zero errors
- [ ] Output type is structurally identical to `NormalizedTranscript` from `@iexcel/shared-types`
- [ ] Feature 10 implementer can call `normalizeTextTranscript` without reading this feature's internals
