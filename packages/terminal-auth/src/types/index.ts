import type { StoredTokens } from '@iexcel/auth-client/types';

/**
 * OIDC user profile claims extracted from an id_token.
 */
export interface UserProfile {
  /** Subject identifier (user ID). */
  sub: string;
  /** User's email address. */
  email: string;
  /** User's display name. */
  name: string;
}

/**
 * StoredTokens enriched with the authenticated user's profile.
 * This is the shape persisted to disk and returned from login().
 */
export interface StoredTokensWithProfile extends StoredTokens {
  /** Profile of the authenticated user, decoded from the id_token. */
  user: UserProfile;
}
