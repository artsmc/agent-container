/**
 * Email Adapter — Public API
 *
 * Exports:
 * - sendAgendaEmail: main function to send agenda emails
 * - EmailAdapter: class implementing EmailAdapterService (Feature 14 interface)
 * - Types: AgendaEmailInput, EmailProviderCredentials, RecipientDeliveryStatus
 * - EmailAdapterError: typed error class
 *
 * Internal sub-modules (html-formatter, resend-provider, sendgrid-provider,
 * retry) are NOT exported.
 */

export { sendAgendaEmail, hashEmail } from './adapter';
export type {
  AgendaEmailInput,
  EmailProviderCredentials,
  RecipientDeliveryStatus,
} from './adapter';
export { EmailAdapterError } from './email-adapter-error';
export type { EmailAdapterErrorCode } from './email-adapter-error';
