import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createApiClient } from '@iexcel/api-client';
import { decodeJwtPayload } from '@/auth/token-utils';
import { createCookieTokenProvider } from '@/auth/api-token-provider';
import { COOKIE_ACCESS_TOKEN } from '@/auth/cookies';
import type { AuthenticatedUser } from '@/auth/types';
import { SettingsTabs } from '@/features/settings/components/SettingsTabs';
import styles from './settings.module.scss';

/**
 * Settings Page -- Server Component shell for admin settings.
 *
 * Enforces role-based access:
 * - team_member -> redirected to /
 * - unauthenticated -> redirected to /login
 * - admin / account_manager -> renders SettingsTabs
 *
 * The user's role and ID are passed to SettingsTabs so tab visibility
 * and self-protection rules can be applied client-side.
 */
export default async function SettingsPage() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(COOKIE_ACCESS_TOKEN)?.value;

  if (!accessToken) {
    redirect('/login');
  }

  const claims = decodeJwtPayload(accessToken);
  const sub = typeof claims?.sub === 'string' ? claims.sub : null;

  if (!sub) {
    redirect('/login');
  }

  let role: AuthenticatedUser['role'];

  try {
    const apiClient = createApiClient({
      baseUrl: process.env.API_BASE_URL ?? '',
      tokenProvider: createCookieTokenProvider(),
    });
    const response = await apiClient.getMe();
    role = response.user.role as AuthenticatedUser['role'];
  } catch {
    redirect('/login');
  }

  if (role === 'team_member') {
    redirect('/');
  }

  return (
    <div className={styles.page} data-testid="settings-page">
      <h1 className={styles.pageTitle}>Settings</h1>
      <SettingsTabs userRole={role} userId={sub} />
    </div>
  );
}
