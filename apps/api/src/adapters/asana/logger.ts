/**
 * Module-scoped structured logger for the Asana adapter.
 *
 * Uses a lightweight interface that outputs JSON-structured log entries
 * via console methods. This avoids a direct pino import which causes
 * issues in the vitest/vite test runner.
 *
 * In production, the Fastify server's pino logger captures stdout/stderr
 * output as structured JSON.
 *
 * Security invariant: access tokens and task content (title, description)
 * must NEVER appear in any log output.
 */

interface LogContext {
  [key: string]: unknown;
}

function formatMessage(context: LogContext, message: string): string {
  return JSON.stringify({ ...context, msg: message, module: 'asana-adapter' });
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
    console.error(formatMessage(context, message));
  },
  debug(context: LogContext, message: string): void {
    // eslint-disable-next-line no-console
    console.debug(formatMessage(context, message));
  },
};
