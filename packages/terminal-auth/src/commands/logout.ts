import { homedir } from 'node:os';
import { join } from 'node:path';
import { clearTokens, loadTokens } from '@iexcel/auth-client/token-storage';
import { config } from '../config/config.js';
import { print } from '../display/terminal-output.js';

/**
 * Resolves a path that may start with ~ to an absolute path using the home
 * directory.
 */
function resolveTokenPath(tokenPath: string): string {
  if (tokenPath.startsWith('~/') || tokenPath === '~') {
    return join(homedir(), tokenPath.slice(1));
  }
  return tokenPath;
}

/**
 * Clears the stored authentication session from disk.
 *
 * Prints a friendly message if no active session is found.
 */
export async function logout(): Promise<void> {
  const filePath = resolveTokenPath(config.tokenPath);

  const existing = await loadTokens({ filePath });

  if (existing === null) {
    print('No active session found.');
    return;
  }

  await clearTokens({ filePath });
  print('Logged out. Your session has been cleared.');
}
