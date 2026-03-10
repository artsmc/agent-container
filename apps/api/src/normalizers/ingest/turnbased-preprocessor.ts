/**
 * Turnbased transcript preprocessor.
 *
 * Converts markdown bold speaker labels (`**Speaker Name**: text`)
 * into the plain `Speaker Name: text` format that the existing
 * text normalizer's buildSegments() already handles natively.
 *
 * This avoids duplicating speaker/segment logic — we just transform
 * the syntax and delegate to the existing segment builder.
 */

/**
 * Strip markdown bold syntax from speaker labels.
 *
 * Transforms `**Speaker Name**: text` -> `Speaker Name: text`
 * so that buildSegments() / parseSpeakerFromLine() can parse it.
 */
export function preprocessTurnbased(rawText: string): string {
  return rawText.replace(
    /^\*\*([^*]+)\*\*\s*:/gm,
    '$1:'
  );
}
