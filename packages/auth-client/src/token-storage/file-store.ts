import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { StoredTokens, StorageOptions } from '../types/index.js';
import { TokenStorageError } from '../types/index.js';

const DEFAULT_TOKEN_DIR = join(homedir(), '.iexcel', 'auth');
const DEFAULT_TOKEN_FILE = join(DEFAULT_TOKEN_DIR, 'tokens.json');

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

function resolveFilePath(options?: StorageOptions): string {
  return options?.filePath ?? DEFAULT_TOKEN_FILE;
}

function isStoredTokens(value: unknown): value is StoredTokens {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['accessToken'] === 'string' &&
    typeof v['tokenType'] === 'string' &&
    typeof v['storedAt'] === 'string' &&
    typeof v['issuer'] === 'string' &&
    typeof v['clientId'] === 'string'
  );
}

/**
 * Persists tokens to disk at the configured file path.
 * Creates the parent directory (mode 0o700) if it does not exist.
 * Writes the file with mode 0o600 (owner read/write only).
 *
 * @throws {TokenStorageError} when the write operation fails.
 */
export async function saveTokens(
  tokens: StoredTokens,
  options?: StorageOptions
): Promise<void> {
  const filePath = resolveFilePath(options);
  const dir = dirname(filePath);

  try {
    await mkdir(dir, { recursive: true, mode: DIR_MODE });
  } catch (cause) {
    throw new TokenStorageError(
      `Failed to create token storage directory ${dir}`,
      cause
    );
  }

  const json = JSON.stringify(tokens, null, 2);

  try {
    await writeFile(filePath, json, { mode: FILE_MODE, encoding: 'utf8' });
  } catch (cause) {
    throw new TokenStorageError(
      `Failed to write tokens to ${filePath}`,
      cause
    );
  }
}

/**
 * Loads tokens from disk.
 * Returns null if the file does not exist or contains invalid JSON.
 * Never throws — malformed or missing files are treated as an absent token.
 */
export async function loadTokens(
  options?: StorageOptions
): Promise<StoredTokens | null> {
  const filePath = resolveFilePath(options);

  let raw: string;
  try {
    raw = await readFile(filePath, { encoding: 'utf8' });
  } catch {
    // File not found or unreadable — treated as no stored tokens
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Malformed JSON — treat as no stored tokens
    return null;
  }

  if (!isStoredTokens(parsed)) {
    return null;
  }

  return parsed;
}

/**
 * Deletes the token storage file.
 * If the file does not exist, this is a no-op.
 *
 * @throws {TokenStorageError} when the deletion fails for a reason other than
 *   the file not existing.
 */
export async function clearTokens(options?: StorageOptions): Promise<void> {
  const filePath = resolveFilePath(options);

  try {
    await unlink(filePath);
  } catch (cause) {
    // ENOENT means the file doesn't exist — not an error
    if (
      cause instanceof Error &&
      'code' in cause &&
      (cause as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return;
    }
    throw new TokenStorageError(
      `Failed to delete token file ${filePath}`,
      cause
    );
  }
}
