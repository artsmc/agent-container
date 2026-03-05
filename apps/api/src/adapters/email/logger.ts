/**
 * Module-scoped structured logger for the email adapter.
 *
 * Uses the same lightweight JSON logger pattern as the Asana adapter.
 * In production, Fastify's pino logger captures stdout/stderr as
 * structured JSON.
 *
 * Security invariant: API keys, email content, and plain-text email
 * addresses must NEVER appear in any log output.
 */

interface LogContext {
  [key: string]: unknown;
}

function formatMessage(context: LogContext, message: string): string {
  return JSON.stringify({ ...context, msg: message, module: 'email-adapter' });
}

export const logger = {
  info(context: LogContext, message: string): void {
    // eslint-disable-next-line no-console
    console.info(formatMessage(context, message));
  },
  warn(context: LogContext, message: string): void {
    // eslint-disable-next-line no-console
    console.warn(formatMessage(context, message));
  },
  error(context: LogContext, message: string): void {
    // eslint-disable-next-line no-console
    console.error(formatMessage(context, message));
  },
  debug(context: LogContext, message: string): void {
    // eslint-disable-next-line no-console
    console.debug(formatMessage(context, message));
  },
};
