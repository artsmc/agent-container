import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

export interface EncryptResult {
  /** Ciphertext with appended 16-byte auth tag. */
  encrypted: Buffer;
  /** 12-byte initialization vector. */
  iv: Buffer;
}

/**
 * Encrypts plaintext using AES-256-GCM.
 *
 * The returned `encrypted` buffer contains the ciphertext followed by
 * the 16-byte authentication tag. Store both `encrypted` and `iv` in
 * the database (bytea columns).
 *
 * @param plaintext - The string to encrypt (e.g., JSON-serialized credentials).
 * @param key - 32-byte hex-encoded encryption key (64 hex chars).
 */
export function encrypt(plaintext: string, key: string): EncryptResult {
  const keyBuffer = Buffer.from(key, 'hex');
  if (keyBuffer.length !== 32) {
    throw new Error('Encryption key must be 32 bytes (64 hex characters)');
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, keyBuffer, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Append auth tag to ciphertext for storage
  const encrypted = Buffer.concat([ciphertext, authTag]);

  return { encrypted, iv };
}

/**
 * Decrypts data encrypted with `encrypt()`.
 *
 * @param encrypted - Ciphertext with appended 16-byte auth tag.
 * @param iv - 12-byte initialization vector used during encryption.
 * @param key - 32-byte hex-encoded encryption key (64 hex chars).
 * @returns The original plaintext string.
 * @throws If the auth tag verification fails (tampered or wrong key).
 */
export function decrypt(encrypted: Buffer, iv: Buffer, key: string): string {
  const keyBuffer = Buffer.from(key, 'hex');
  if (keyBuffer.length !== 32) {
    throw new Error('Encryption key must be 32 bytes (64 hex characters)');
  }

  // Split ciphertext and auth tag
  const ciphertext = encrypted.subarray(0, encrypted.length - AUTH_TAG_LENGTH);
  const authTag = encrypted.subarray(encrypted.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
