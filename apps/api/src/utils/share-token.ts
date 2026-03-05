import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { agendas } from '@iexcel/database/schema';
import type { DbClient } from '../db/client';

/**
 * Generates a cryptographically secure share token.
 * 32 bytes = 256 bits of entropy; base64url encoding = 43 characters.
 */
export function generateShareToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Generates share tokens for an agenda with idempotency.
 * If tokens already exist on the agenda, returns the existing tokens.
 * Otherwise, generates new tokens and persists them.
 */
export async function generateShareTokens(
  agendaId: string,
  db: DbClient
): Promise<{ shared_url_token: string; internal_url_token: string }> {
  // Check if tokens already exist (idempotency)
  const rows = await db
    .select({
      sharedUrlToken: agendas.sharedUrlToken,
      internalUrlToken: agendas.internalUrlToken,
    })
    .from(agendas)
    .where(eq(agendas.id, agendaId))
    .limit(1);

  const existing = rows[0];
  if (existing?.sharedUrlToken && existing?.internalUrlToken) {
    return {
      shared_url_token: existing.sharedUrlToken,
      internal_url_token: existing.internalUrlToken,
    };
  }

  // Generate new tokens
  const shared_url_token = generateShareToken();
  const internal_url_token = generateShareToken();

  await db
    .update(agendas)
    .set({
      sharedUrlToken: shared_url_token,
      internalUrlToken: internal_url_token,
      updatedAt: new Date(),
    })
    .where(eq(agendas.id, agendaId));

  return { shared_url_token, internal_url_token };
}

/**
 * Builds the full share URLs from tokens using APP_BASE_URL.
 */
export function buildShareUrls(tokens: {
  shared_url_token: string;
  internal_url_token: string;
}): { client_url: string; internal_url: string } {
  const baseUrl = process.env['APP_BASE_URL'];
  if (!baseUrl) {
    throw new Error('APP_BASE_URL environment variable is not set');
  }

  return {
    client_url: `${baseUrl}/shared/${tokens.shared_url_token}`,
    internal_url: `${baseUrl}/agendas/edit/${tokens.internal_url_token}`,
  };
}
