import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createApiClient } from '@iexcel/api-client';
import { createCookieTokenProvider } from '@/auth/api-token-provider';
import { COOKIE_ACCESS_TOKEN } from '@/auth/cookies';
import { decodeJwtPayload } from '@/auth/token-utils';
import { WorkflowTriggerForm } from '@/components/WorkflowTrigger/WorkflowTriggerForm';
import styles from './page.module.scss';

/**
 * Workflow Trigger Page -- Server Component shell.
 *
 * Route: /workflows/new
 *
 * Responsibilities:
 * 1. Verify the user has the admin or account_manager role.
 * 2. Pre-fetch the client list server-side for instant rendering.
 * 3. Pass clients to the WorkflowTriggerForm client component.
 */
export default async function WorkflowTriggerPage() {
  // Role check -- only admin and account_manager can access
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

  const apiClient = createApiClient({
    baseUrl: process.env.API_BASE_URL ?? '',
    tokenProvider: createCookieTokenProvider(),
  });

  // Fetch user role for authorization check
  let userRole: string;
  try {
    const meResponse = await apiClient.getMe();
    userRole = meResponse.user.role;
  } catch {
    redirect('/login');
  }

  const allowedRoles = ['admin', 'account_manager'];
  if (!allowedRoles.includes(userRole)) {
    redirect('/');
  }

  // Pre-fetch client list for the form
  let clients;
  try {
    const response = await apiClient.listClients();
    clients = response.data;
  } catch {
    clients = [];
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Trigger Workflow</h1>
      <WorkflowTriggerForm clients={clients} />
    </div>
  );
}
