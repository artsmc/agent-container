import { AuthClientError } from '@iexcel/auth-client/types';

/**
 * Thrown when an operation requires authentication but no valid session exists.
 * Consumers should catch this error and prompt the user to run `login`.
 */
export class AuthRequiredError extends AuthClientError {
  constructor(message = 'Authentication required. Please run login.') {
    super(message, 'AUTH_REQUIRED');
    this.name = 'AuthRequiredError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
