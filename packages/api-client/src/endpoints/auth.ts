import type { GetCurrentUserResponse } from '@iexcel/shared-types';
import type { HttpTransport } from '../core/http';

/**
 * Auth endpoint methods.
 */
export function createAuthEndpoints(http: HttpTransport) {
  return {
    /**
     * Get the current authenticated user's profile.
     * GET /me
     */
    getMe(): Promise<GetCurrentUserResponse> {
      return http.request({ method: 'GET', path: '/me' });
    },
  };
}

export type AuthEndpoints = ReturnType<typeof createAuthEndpoints>;
