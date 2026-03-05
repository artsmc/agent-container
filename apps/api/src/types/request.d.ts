import type { TokenClaims } from '@iexcel/auth-client';

/**
 * The user object attached to each authenticated request
 * after the load-user middleware runs.
 */
export interface RequestUser {
  id: string;
  authUserId: string;
  email: string;
  name: string;
  role: 'admin' | 'account_manager' | 'team_member';
}

declare module 'fastify' {
  interface FastifyRequest {
    /** JWT claims set by the authenticate middleware. */
    tokenClaims?: TokenClaims;
    /** Product user record set by the load-user middleware. */
    user?: RequestUser;
  }
}
