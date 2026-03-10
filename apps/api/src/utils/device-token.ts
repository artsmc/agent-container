import { randomBytes, createHash } from 'node:crypto';

/**
 * Token prefix for device tokens. All device tokens start with this prefix
 * so they can be distinguished from JWTs in the Authorization header.
 */
const TOKEN_PREFIX = 'ixl_';

/**
 * Number of random hex characters after the prefix.
 * Total token length: 4 (prefix) + 32 (hex) = 36 characters.
 */
const TOKEN_HEX_LENGTH = 32;

/**
 * Characters used for the user-facing device code.
 * Excludes ambiguous characters (0, O, I, l) for readability.
 */
const USER_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const USER_CODE_LENGTH = 8;

// ---------------------------------------------------------------------------
// Token generation
// ---------------------------------------------------------------------------

export interface GeneratedToken {
  /** Full plaintext token (e.g., "ixl_a1b2c3d4..."). Shown to user once. */
  plaintext: string;
  /** SHA-256 hash of the plaintext token. Stored in the database. */
  hash: string;
  /** Short prefix for display (e.g., "ixl_a1b2"). Never used for auth. */
  prefix: string;
}

/**
 * Generates a new device token with its hash and display prefix.
 *
 * Token format: "ixl_" + 32 random hex characters = 36 chars total.
 * The plaintext is shown once to the user; only the SHA-256 hash is stored.
 */
export function generateToken(): GeneratedToken {
  const hexPart = randomBytes(TOKEN_HEX_LENGTH / 2).toString('hex');
  const plaintext = `${TOKEN_PREFIX}${hexPart}`;
  const hash = hashToken(plaintext);
  const prefix = `${TOKEN_PREFIX}${hexPart.slice(0, 4)}`;

  return { plaintext, hash, prefix };
}

/**
 * Computes the SHA-256 hash of a plaintext device token.
 * Used both at token creation and at validation time.
 */
export function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

/**
 * Generates a human-readable 8-character alphanumeric user code.
 * Used to visually confirm device auth sessions in the browser approval page.
 */
export function generateUserCode(): string {
  const bytes = randomBytes(USER_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < USER_CODE_LENGTH; i++) {
    code += USER_CODE_CHARS[bytes[i]! % USER_CODE_CHARS.length];
  }
  return code;
}

/**
 * Hashes a device fingerprint string using SHA-256.
 * Fingerprints are stored as hashes so the raw fingerprint is never persisted.
 */
export function hashFingerprint(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Returns true if the given token string looks like a device token
 * (starts with "ixl_"). Used by auth middleware to select the validation path.
 */
export function isDeviceToken(token: string): boolean {
  return token.startsWith(TOKEN_PREFIX);
}
