/**
 * Device flow state management.
 * In-memory Map with TTL. For horizontal scaling, migrate to Postgres.
 */
import { randomBytes } from 'node:crypto';
import type { DeviceFlowRecord, DeviceFlowStatus } from '../types.js';
import {
  AuthorizationPendingError,
  SlowDownError,
  ExpiredTokenError,
  AccessDeniedError,
  InvalidGrantError,
} from '../errors.js';

const DEVICE_CODE_TTL_SECONDS = 900; // 15 minutes
const POLLING_INTERVAL_SECONDS = 5;

/** Exclude ambiguous characters: 0, O, 1, I */
const USER_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const deviceCodeStore = new Map<string, DeviceFlowRecord>();
const userCodeIndex = new Map<string, string>(); // normalized user code -> device code

export function createDeviceFlow(
  clientId: string,
  scope: string
): DeviceFlowRecord {
  const deviceCode = randomBytes(32).toString('base64url');
  const userCode = generateUserCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEVICE_CODE_TTL_SECONDS * 1000);

  const record: DeviceFlowRecord = {
    deviceCode,
    userCode,
    clientId,
    scope,
    status: 'pending',
    userId: null,
    expiresAt,
    lastPolledAt: null,
    createdAt: now,
  };

  deviceCodeStore.set(deviceCode, record);
  userCodeIndex.set(normalizeUserCode(userCode), deviceCode);

  return record;
}

export function lookupByUserCode(userCode: string): DeviceFlowRecord | null {
  const normalized = normalizeUserCode(userCode);
  const deviceCode = userCodeIndex.get(normalized);
  if (!deviceCode) return null;

  const record = deviceCodeStore.get(deviceCode);
  if (!record) return null;

  // Check expiration
  if (record.expiresAt.getTime() < Date.now()) {
    record.status = 'expired';
    return null;
  }

  return record;
}

export function lookupByDeviceCode(deviceCode: string): DeviceFlowRecord | null {
  const record = deviceCodeStore.get(deviceCode);
  if (!record) return null;

  // Check expiration
  if (record.expiresAt.getTime() < Date.now()) {
    record.status = 'expired';
  }

  return record;
}

export function resolveDeviceFlow(deviceCode: string, userId: string): void {
  const record = deviceCodeStore.get(deviceCode);
  if (!record) {
    throw new InvalidGrantError('Device code not found.');
  }
  if (record.status !== 'pending') {
    throw new InvalidGrantError(`Device flow is already ${record.status}.`);
  }
  record.status = 'complete';
  record.userId = userId;
}

export function consumeDeviceFlow(deviceCode: string): DeviceFlowRecord {
  const record = deviceCodeStore.get(deviceCode);
  if (!record) {
    throw new InvalidGrantError('Device code not found.');
  }

  // Check status and handle accordingly
  if (record.expiresAt.getTime() < Date.now()) {
    cleanup(deviceCode, record);
    throw new ExpiredTokenError('The device code has expired.');
  }

  if (record.status === 'denied') {
    cleanup(deviceCode, record);
    throw new AccessDeniedError('The device authorization was denied.');
  }

  if (record.status === 'pending') {
    throw new AuthorizationPendingError();
  }

  if (record.status !== 'complete') {
    throw new InvalidGrantError('Device flow is in an unexpected state.');
  }

  // Consume -- remove from store
  cleanup(deviceCode, record);
  return record;
}

export function enforcePollingInterval(
  record: DeviceFlowRecord
): 'ok' | 'slow_down' {
  const now = Date.now();

  if (record.lastPolledAt) {
    const elapsed = (now - record.lastPolledAt.getTime()) / 1000;
    if (elapsed < POLLING_INTERVAL_SECONDS) {
      record.lastPolledAt = new Date(now);
      return 'slow_down';
    }
  }

  record.lastPolledAt = new Date(now);
  return 'ok';
}

export function getDeviceFlowTtlSeconds(): number {
  return DEVICE_CODE_TTL_SECONDS;
}

export function getPollingIntervalSeconds(): number {
  return POLLING_INTERVAL_SECONDS;
}

// ---- Internal helpers ----

function generateUserCode(): string {
  const bytes = randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += USER_CODE_CHARS[bytes[i] % USER_CODE_CHARS.length];
  }
  // Format as XXXX-XXXX
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function normalizeUserCode(code: string): string {
  return code.toUpperCase().replace(/-/g, '').trim();
}

function cleanup(deviceCode: string, record: DeviceFlowRecord): void {
  deviceCodeStore.delete(deviceCode);
  userCodeIndex.delete(normalizeUserCode(record.userCode));
}

/**
 * Evict expired device flow records. Called by the cleanup job.
 */
export function evictExpiredDeviceFlows(): number {
  const now = Date.now();
  let count = 0;
  for (const [code, record] of deviceCodeStore) {
    if (record.expiresAt.getTime() < now) {
      cleanup(code, record);
      count++;
    }
  }
  return count;
}
