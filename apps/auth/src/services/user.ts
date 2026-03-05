/**
 * User service: upsert from IdP claims, activity checks.
 */
import { upsertUser } from '../db/users.js';
import { UserDeactivatedError } from '../errors.js';
import type { User, IdpClaims } from '../types.js';

export async function upsertUserFromIdpClaims(claims: IdpClaims): Promise<User> {
  return upsertUser({
    idpSubject: claims.sub,
    idpProvider: claims.idpProvider,
    email: claims.email,
    name: claims.name,
    picture: claims.picture,
  });
}

export function assertUserIsActive(user: User): void {
  if (!user.is_active) {
    throw new UserDeactivatedError('Your account has been deactivated.');
  }
}
