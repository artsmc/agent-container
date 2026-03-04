# Execution Plan
# Feature 08: Input Normalizer — Text

**Status:** Approved
**Date:** 2026-03-03
**Agent:** single backend developer (no sub-agent delegation)

---

## Paths

- **input_folder:** execution/08-input-normalizer-text
- **planning_folder:** execution/08-input-normalizer-text/planning
- **task_list_file:** execution/08-input-normalizer-text/task-list.md

---

## Summary

38 tasks reorganized from 10 phases into 5 waves. Pure TypeScript module that converts raw transcript text to `NormalizedTranscript` format. Parses speaker labels, timestamps, and segments. No I/O, no database, no network. Single agent execution — all tasks are string parsing and regex work.

---

## Wave 1 — Infrastructure + Both Parsers (parallel streams after setup)

### Setup (sequential, 3 tasks)

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 1.1 | Create `apps/api/src/normalizers/text/` and `__tests__/` directories | Small | TR.md 1.3 |
| 1.2 | Create `errors.ts` with `NormalizerError` class | Small | FRS.md FR-50/51, TR.md 2.3 |
| 1.3 | Verify `NormalizerError` compiles | Small | — |

### Stream A — Timestamp Parser (parallel with Stream B, 6 tasks)

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 2.1 | Create `timestamp-parser.ts` | Small | TR.md 4 |
| 2.2 | Define `TIMESTAMP_REGEX` constant | Small | FRS.md FR-20, TR.md 4.1 |
| 2.3 | Implement `parseTimestampFromLine()` | Small | FRS.md FR-20, TR.md 4.3 |
| 2.4 | Implement `timestampToSeconds` helper | Small | TR.md 4.2 |
| 2.5 | Write `timestamp-parser.test.ts` — all 8 cases | Small | TR.md 8.1 |
| 2.6 | Run and verify tests pass | Small | — |

### Stream B — Speaker Parser (parallel with Stream A, 7 tasks)

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 3.1 | Create `speaker-parser.ts` | Small | TR.md 3 |
| 3.2 | Define `SPEAKER_LABEL_REGEX` constant | Small | TR.md 3.1 |
| 3.3 | Implement `parseSpeakerFromLine()` | Small | FRS.md FR-10, TR.md 3.1 |
| 3.4 | Implement `normalizeSpeakerName()` | Small | FRS.md FR-11, TR.md 3.2 |
| 3.5 | Implement `deduplicateParticipants()` | Small | FRS.md FR-11, TR.md 3.3 |
| 3.6 | Write `speaker-parser.test.ts` — all 7 cases | Small | TR.md 8.2 |
| 3.7 | Run and verify tests pass | Small | — |

**Result:** Both parsers independently tested.

---

## Wave 2 — Segment Builder (7 tasks, sequential)

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 4.1 | Create `segment-builder.ts` | Small | TR.md 5 |
| 4.2 | Define internal `ParsedLine` interface | Small | TR.md 2.4 |
| 4.3 | Implement `parseLine()` function | Small | — |
| 4.4 | Implement `buildSegments()` with flush logic | Medium | FRS.md FR-30/33, TR.md 5.1 |
| 4.5 | Implement unstructured fallback | Small | FRS.md FR-34, TR.md 5.2 |
| 4.6 | Write `segment-builder.test.ts` — all 5 cases | Small | TR.md 8.3 |
| 4.7 | Run and verify tests pass | Small | — |

**Depends on:** Wave 1 (both parsers).
**Result:** Segment assembly verified.

---

## Wave 3 — Core Normalizer + Export (7 tasks, sequential)

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 5.1 | Create `normalizer.ts` | Small | TR.md 6 |
| 5.2 | Define `NormalizeTextInput` interface | Small | FRS.md FR-60, TR.md 2.1 |
| 5.3 | Implement `validateInput()` | Small | FRS.md FR-03, TR.md 6.1 |
| 5.4 | Implement `isValidIso8601()` helper | Small | TR.md 6.1 |
| 5.5 | Implement `normalizeTextTranscript()` | Medium | FRS.md FR-40/49, TR.md 6.1 |
| 5.6 | Confirm pure function (no async, no I/O) | Small | — |
| 6.1 | Create `index.ts` — public export | Small | FRS.md FR-61, TR.md 1.3 |

**Depends on:** Wave 2 (segment builder).
**Result:** MILESTONE — `normalizeTextTranscript` is callable.

---

## Wave 4 — Integration Tests + Fixtures (10 tasks)

### Fixtures (parallel after 7.1)

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 7.1 | Create `__tests__/fixtures/` directory | Small | — |
| 7.2 | Create `well-formed-labeled.txt` | Small | TR.md 8.4 |
| 7.3 | Create `manual-paste-no-timestamps.txt` | Small | TR.md 8.4 |
| 7.4 | Create `allcaps-speakers.txt` | Small | TR.md 8.4 |
| 7.5 | Create `unstructured.txt` | Small | TR.md 8.4 |
| 7.6 | Create `single-speaker.txt` | Small | TR.md 8.4 |
| 7.7 | Create `mixed-timestamp-formats.txt` | Small | TR.md 8.4 |

### Integration Tests (sequential after fixtures)

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 7.8 | Write `normalizer.integration.test.ts` — structural + perf assertions | Medium | TR.md 8.4, 9 |
| 7.9 | Write validation failure tests — all 5 scenarios | Small | TR.md 8.5 |
| 7.10 | Run and verify all integration tests pass | Small | — |

**Depends on:** Wave 3 (normalizer callable).
**Result:** Full test coverage.

---

## Wave 5 — Security, Documentation, Final Verification (parallel)

| Task | Description | Complexity | References |
|------|-------------|------------|------------|
| 8.1 | Add call-site documentation comment to `index.ts` | Small | TR.md 7.1 |
| 8.2 | Confirm multipart requirements documented for Feature 10 | Small | FRS.md FR-02, TR.md 7.2 |
| 9.1 | Review all logging — no raw transcript content | Small | TR.md 10.1 |
| 9.2 | ReDoS verification on both regexes | Small | TR.md 10.2 |
| 10.1 | Run full API test suite (`nx run api:test`) | Small | — |
| 10.2 | Run type-check (`nx run api:type-check`) | Small | — |
| 10.3 | Confirm output matches `NormalizedTranscript` exactly | Small | — |
| 10.4 | Confirm `source` is always `"manual"` | Small | — |
| 10.5 | Confirm `summary` and `highlights` are `null` | Small | — |
| 10.6 | Confirm `participants` never contains `"Unknown"` | Small | — |
| 10.7 | Confirm unstructured fallback shape | Small | — |

**Depends on:** Wave 4 (tests pass).
**Result:** Feature complete.

---

## Dependency Graph

```
Wave 1 (Setup + Parsers in parallel)
  |
  v
Wave 2 (Segment Builder)
  |
  v
Wave 3 (Normalizer + Export) --- MILESTONE: Callable Function
  |
  v
Wave 4 (Fixtures + Integration Tests)
  |
  v
Wave 5 (Security + Verification)
```

---

## Key Decisions

- **Single agent execution:** All TypeScript string parsing; no sub-agent split.
- **No scope changes:** All 38 original tasks preserved.
- **Timestamp and speaker parsers in parallel:** They are independent modules with no shared dependencies.
- **Pure function verified:** No async, no I/O, no database, no network.
- **No new npm dependencies:** Uses only native JS RegExp and Date.
