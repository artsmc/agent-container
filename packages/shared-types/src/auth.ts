export enum UserRole {
  Admin = 'admin',
  AccountManager = 'account_manager',
  TeamMember = 'team_member',
}

/**
 * Claims present in the OIDC ID token issued by apps/auth.
 * The API validates these via the auth service's JWKS endpoint.
 */
export interface OidcTokenClaims {
  /** Issuer URL. e.g., "https://auth.iexcel.com" */
  iss: string;
  /** Subject — the canonical user UUID. */
  sub: string;
  /** Audience. e.g., "iexcel-api" */
  aud: string;
  email: string;
  name: string;
  /** Issued-at timestamp (Unix epoch seconds). */
  iat: number;
  /** Expiry timestamp (Unix epoch seconds). */
  exp: number;
}

/**
 * Lightweight identity extracted from a validated OIDC token.
 * Passed through the API's auth middleware to business logic layers.
 */
export interface UserIdentity {
  sub: string;
  email: string;
  name: string;
}

/**
 * A user record from the product database (not the auth database).
 * Created on first login via just-in-time provisioning.
 * Linked to the auth service via authUserId = OIDC token's "sub" claim.
 */
export interface ProductUser {
  id: string;
  /** The OIDC token's "sub" claim. The link between identity and product permissions. */
  authUserId: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}
