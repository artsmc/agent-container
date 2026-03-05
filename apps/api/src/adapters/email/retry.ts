/**
 * Retry wrapper for email provider calls.
 *
 * Uses p-retry with exponential back-off. EmailAdapterError instances
 * are NOT retried — they represent non-transient failures (auth, empty
 * recipients). All other errors (429, 5xx, network) are retried up to
 * MAX_RETRIES times.
 */

import pRetry from 'p-retry';
import { EmailAdapterError } from './email-adapter-error';
import { logger } from './logger';

const MAX_RETRIES = 2; // 3 total attempts (initial + 2 retries)

export async function withEmailRetry<T>(
  fn: () => Promise<T>,
  context?: { agendaId?: string },
): Promise<T> {
  return pRetry(fn, {
    retries: MAX_RETRIES,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 8000,
    randomize: true,
    shouldRetry: (err) => {
      // Do not retry auth errors or user errors — only provider unavailability
      if (err instanceof EmailAdapterError) return false;
      return true;
    },
    onFailedAttempt: (error) => {
      logger.warn(
        {
          attempt: error.attemptNumber,
          retriesLeft: error.retriesLeft,
          message: error.message,
          ...(context?.agendaId ? { agendaId: context.agendaId } : {}),
        },
        'Email provider retry triggered',
      );
    },
  });
}
