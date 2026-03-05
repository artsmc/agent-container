/**
 * Email Adapter — Main Orchestration
 *
 * Implements `sendAgendaEmail()` which:
 *   1. Guards against empty recipient list
 *   2. Builds HTML subject + body from agenda content
 *   3. Routes to Resend or SendGrid provider based on credentials
 *   4. Returns per-recipient delivery status
 *
 * This module is stateless. The calling endpoint (Feature 14) is
 * responsible for recipient resolution, credential retrieval, and
 * audit logging.
 *
 * Security invariants:
 *   - API keys are NEVER logged
 *   - Email addresses are hashed in log output
 *   - Email content is NEVER logged
 */

import { createHash } from 'node:crypto';
import { EmailAdapterError } from './email-adapter-error';
import { buildEmailSubject, buildEmailHtml } from './html-formatter';
import { sendViaResend } from './resend-provider';
import { sendViaSendGrid } from './sendgrid-provider';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AgendaEmailInput {
  /** Agenda UUID */
  agendaId: string;
  /** Human-readable short ID, e.g. "AGD-0015" */
  shortId: string;
  /** Markdown content from agendas.content */
  content: string;
  /** ISO date: "2026-02-17" */
  cycleStart: string;
  /** ISO date: "2026-02-28" */
  cycleEnd: string;
  /** Client display name, e.g. "Total Life" */
  clientName: string;
}

export interface EmailProviderCredentials {
  provider: 'sendgrid' | 'resend';
  apiKey: string;
  fromEmail: string;
  fromName: string;
}

export interface RecipientDeliveryStatus {
  email: string;
  status: 'sent' | 'failed';
  providerMessageId: string | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * One-way hash for logging — allows correlation without exposing PII.
 * Returns first 12 hex characters of SHA-256 hash.
 */
export function hashEmail(email: string): string {
  return createHash('sha256')
    .update(email.toLowerCase())
    .digest('hex')
    .slice(0, 12);
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Sends an agenda email to one or more recipients via the configured
 * email provider.
 *
 * @param input - Agenda content and metadata
 * @param recipients - Resolved recipient email addresses
 * @param credentials - Email provider API credentials
 * @returns Per-recipient delivery status array
 * @throws EmailAdapterError with code NO_RECIPIENTS if list is empty
 * @throws EmailAdapterError with code EMAIL_AUTH_FAILED on 401/403
 * @throws EmailAdapterError with code EMAIL_PROVIDER_UNAVAILABLE on retries exhausted
 */
export async function sendAgendaEmail(
  input: AgendaEmailInput,
  recipients: string[],
  credentials: EmailProviderCredentials,
): Promise<RecipientDeliveryStatus[]> {
  const startMs = Date.now();

  // Guard: empty recipient list
  if (recipients.length === 0) {
    throw new EmailAdapterError(
      'NO_RECIPIENTS',
      'Recipient list is empty \u2014 no email sent.',
    );
  }

  logger.info(
    {
      agendaId: input.agendaId,
      shortId: input.shortId,
      recipientCount: recipients.length,
    },
    'Send started',
  );

  // Build email content
  const subject = buildEmailSubject(
    input.clientName,
    input.cycleStart,
    input.cycleEnd,
  );
  const htmlBody = buildEmailHtml(input);

  // Select provider and send
  logger.debug(
    { agendaId: input.agendaId, provider: credentials.provider },
    'Provider call made',
  );

  const sendContext = { agendaId: input.agendaId };

  let statuses: RecipientDeliveryStatus[];

  if (credentials.provider === 'sendgrid') {
    statuses = await sendViaSendGrid(
      recipients,
      subject,
      htmlBody,
      credentials,
      sendContext,
    );
  } else {
    statuses = await sendViaResend(
      recipients,
      subject,
      htmlBody,
      credentials,
      sendContext,
    );
  }

  // Summary logging
  const totalSent = statuses.filter((s) => s.status === 'sent').length;
  const totalFailed = statuses.filter((s) => s.status === 'failed').length;

  logger.info(
    { agendaId: input.agendaId, totalSent, totalFailed },
    'Delivery status received',
  );

  // Log individual failures with hashed email
  for (const failed of statuses.filter((s) => s.status === 'failed')) {
    logger.warn(
      {
        agendaId: input.agendaId,
        email: hashEmail(failed.email),
        error: failed.error,
      },
      'Individual recipient failure',
    );
  }

  const durationMs = Date.now() - startMs;
  logger.info(
    { agendaId: input.agendaId, shortId: input.shortId, durationMs },
    'Send completed',
  );

  return statuses;
}
