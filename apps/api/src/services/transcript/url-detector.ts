/**
 * URL Platform Detection
 *
 * Detects which meeting platform a URL belongs to and extracts the recording ID.
 *
 * Supported platforms:
 * - Fireflies: app.fireflies.ai/view/<id>
 * - Grain:     grain.com/share/<id> or grain.com/recordings/<id>
 */

type DetectedPlatform = 'fireflies' | 'grain';

/**
 * URL patterns for each platform.
 * Each entry maps a regex to a platform name and a capture group index for the recording ID.
 */
const PLATFORM_PATTERNS: Array<{
  platform: DetectedPlatform;
  pattern: RegExp;
  idGroup: number;
}> = [
  {
    platform: 'fireflies',
    // Matches: app.fireflies.ai/view/<recording-id> (with optional query/fragment)
    pattern: /app\.fireflies\.ai\/view\/([^/?#]+)/,
    idGroup: 1,
  },
  {
    platform: 'grain',
    // Matches: grain.com/share/<recording-id>
    pattern: /grain\.com\/share\/([^/?#]+)/,
    idGroup: 1,
  },
  {
    platform: 'grain',
    // Matches: grain.com/recordings/<recording-id>
    pattern: /grain\.com\/recordings\/([^/?#]+)/,
    idGroup: 1,
  },
];

/**
 * Detects the platform from a URL.
 *
 * @param url - A transcript or recording URL.
 * @returns The detected platform name, or null if unrecognized.
 */
export function detectPlatformFromUrl(url: string): DetectedPlatform | null {
  for (const entry of PLATFORM_PATTERNS) {
    if (entry.pattern.test(url)) {
      return entry.platform;
    }
  }
  return null;
}

/**
 * Extracts the recording ID from a platform URL.
 *
 * @param url - A transcript or recording URL.
 * @param platform - The platform to extract from (use detectPlatformFromUrl first).
 * @returns The recording ID, or null if the URL doesn't match the platform pattern.
 */
export function extractRecordingId(
  url: string,
  platform: DetectedPlatform
): string | null {
  for (const entry of PLATFORM_PATTERNS) {
    if (entry.platform !== platform) continue;

    const match = url.match(entry.pattern);
    if (match?.[entry.idGroup]) {
      return match[entry.idGroup];
    }
  }
  return null;
}
