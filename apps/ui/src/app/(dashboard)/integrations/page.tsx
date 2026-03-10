import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { decodeJwtPayload } from '@/auth/token-utils';
import { COOKIE_ACCESS_TOKEN } from '@/auth/cookies';
import { IntegrationsPage } from '@/features/integrations/components/IntegrationsPage';

/**
 * Integrations Page -- Server Component shell.
 *
 * Requires authentication. All roles can access integrations.
 */
export default async function IntegrationsRoute() {
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

  return <IntegrationsPage />;
}
