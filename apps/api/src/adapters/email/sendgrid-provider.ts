/**
 * SendGrid Email Provider
 *
 * Wraps the SendGrid REST API to send emails using native fetch.
 * No `@sendgrid/mail` dependency for V1 — uses direct REST calls
 * to avoid adding a heavy dependency when Resend is the primary provider.
 *
 * The SendGrid v3 API endpoint is POST https://api.sendgrid.com/v3/mail/send
 */

import type { EmailProviderCredentials, RecipientDeliveryStatus } from './adapter';
import { EmailAdapterError } from './email-adapter-error';
import { withEmailRetry } from './retry';

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send';
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Sends an email via the SendGrid v3 REST API with retry logic.
 *
 * @param to - Recipient email addresses
 * @param subject - Email subject line
 * @param htmlBody - Full HTML email body
 * @param credentials - Provider credentials (apiKey, fromEmail, fromName)
 * @param context - Optional context for structured logging
 * @returns Per-recipient delivery status
 */
export async function sendViaSendGrid(
  to: string[],
  subject: string,
  htmlBody: string,
  credentials: EmailProviderCredentials,
  context?: { agendaId?: string },
): Promise<RecipientDeliveryStatus[]> {
  return withEmailRetry(
    async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const payload = {
          personalizations: [
            {
              to: to.map((email) => ({ email })),
            },
          ],
          from: {
            email: credentials.fromEmail,
            name: credentials.fromName,
          },
          subject,
          content: [
            {
              type: 'text/html',
              value: htmlBody,
            },
          ],
        };

        const response = await fetch(SENDGRID_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${credentials.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        // SendGrid returns 202 Accepted for successful sends
        if (response.status === 202 || response.status === 200) {
          const messageId =
            response.headers.get('x-message-id') ?? null;

          return to.map((email) => ({
            email,
            status: 'sent' as const,
            providerMessageId: messageId,
            error: null,
          }));
        }

        // Auth failures — non-retryable
        if (response.status === 401 || response.status === 403) {
          throw new EmailAdapterError(
            'EMAIL_AUTH_FAILED',
            `SendGrid returned ${response.status}`,
          );
        }

        // Client errors (4xx except 429) — non-retryable
        if (
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 429
        ) {
          const body = await response.text().catch(() => '');
          return to.map((email) => ({
            email,
            status: 'failed' as const,
            providerMessageId: null,
            error: `SendGrid returned ${response.status}: ${body}`,
          }));
        }

        // 429 and 5xx — retryable
        const retryError = new Error(
          `SendGrid returned ${response.status}`,
        );
        Object.assign(retryError, { statusCode: response.status });
        throw retryError;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new EmailAdapterError(
            'EMAIL_TIMEOUT',
            'SendGrid API request timed out',
          );
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    },
    context,
  );
}
