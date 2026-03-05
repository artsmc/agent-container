/**
 * Resend Email Provider
 *
 * Wraps the Resend SDK to send emails. Supports multi-recipient sends
 * via the `to` array. Handles provider-specific error responses and
 * maps them to EmailAdapterError codes.
 */

import { Resend } from 'resend';
import type { EmailProviderCredentials, RecipientDeliveryStatus } from './adapter';
import { EmailAdapterError } from './email-adapter-error';
import { withEmailRetry } from './retry';

/**
 * Sends an email via the Resend API with retry logic.
 *
 * @param to - Recipient email addresses
 * @param subject - Email subject line
 * @param htmlBody - Full HTML email body
 * @param credentials - Provider credentials (apiKey, fromEmail, fromName)
 * @param context - Optional context for structured logging
 * @returns Per-recipient delivery status
 */
export async function sendViaResend(
  to: string[],
  subject: string,
  htmlBody: string,
  credentials: EmailProviderCredentials,
  context?: { agendaId?: string },
): Promise<RecipientDeliveryStatus[]> {
  const resend = new Resend(credentials.apiKey);

  return withEmailRetry(
    async () => {
      const { data, error } = await resend.emails.send({
        from: `${credentials.fromName} <${credentials.fromEmail}>`,
        to,
        subject,
        html: htmlBody,
      });

      if (error) {
        // Resend error object has a name and message; statusCode may be on the error
        const statusCode = (error as { statusCode?: number }).statusCode;

        if (statusCode === 401 || statusCode === 403) {
          throw new EmailAdapterError(
            'EMAIL_AUTH_FAILED',
            `Resend returned ${statusCode}: ${error.message}`,
          );
        }

        if (statusCode === 429 || (statusCode && statusCode >= 500)) {
          // Throw a plain error to trigger retry
          const retryError = new Error(
            `Resend returned ${statusCode}: ${error.message}`,
          );
          Object.assign(retryError, { statusCode });
          throw retryError;
        }

        // Non-retryable provider error — mark all recipients as failed
        return to.map((email) => ({
          email,
          status: 'failed' as const,
          providerMessageId: null,
          error: error.message,
        }));
      }

      return to.map((email) => ({
        email,
        status: 'sent' as const,
        providerMessageId: data?.id ?? null,
        error: null,
      }));
    },
    context,
  );
}
