/**
 * Local authentication service: registration and login logic.
 */
import argon2 from 'argon2';
import { getUserByEmail, createLocalUser, type LocalUser } from '../db/local-auth.js';
import { InvalidRequestError, UnauthorizedError, UserDeactivatedError } from '../errors.js';

export async function registerLocalUser(params: {
  email: string;
  password: string;
  name: string;
}): Promise<LocalUser> {
  const { email, password, name } = params;

  // Check if user already exists
  const existing = await getUserByEmail(email);
  if (existing) {
    throw new InvalidRequestError('A user with this email already exists.');
  }

  // Validate password strength
  if (password.length < 8) {
    throw new InvalidRequestError('Password must be at least 8 characters.');
  }

  const passwordHash = await argon2.hash(password);

  return createLocalUser({ email, name, passwordHash });
}

export async function authenticateLocalUser(params: {
  email: string;
  password: string;
}): Promise<LocalUser> {
  const { email, password } = params;

  const user = await getUserByEmail(email);
  if (!user) {
    throw new UnauthorizedError('Invalid email or password.');
  }

  if (!user.password_hash) {
    throw new UnauthorizedError('This account does not support password login. Use SSO instead.');
  }

  if (!user.is_active) {
    throw new UserDeactivatedError('Your account has been deactivated.');
  }

  const valid = await argon2.verify(user.password_hash, password);
  if (!valid) {
    throw new UnauthorizedError('Invalid email or password.');
  }

  return user;
}
