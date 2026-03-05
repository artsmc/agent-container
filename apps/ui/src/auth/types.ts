/**
 * Represents the authenticated user in the UI application.
 *
 * Constructed from two sources:
 * - Identity claims decoded from the OIDC access token JWT (sub, email, name)
 * - Product-level permissions from the GET /me API endpoint (role, assignedClientIds)
 */
export interface AuthenticatedUser {
  /** The OIDC subject claim — the canonical user identifier. */
  sub: string
  /** The user's email address from the OIDC token. */
  email: string
  /** The user's display name from the OIDC token. */
  name: string
  /** The user's product role from the API /me endpoint. */
  role: 'admin' | 'account_manager' | 'team_member'
  /** The list of client IDs this user is permitted to access. */
  assignedClientIds: string[]
}
