import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { decodeJwtPayload } from '@/auth/token-utils';
import { COOKIE_ACCESS_TOKEN } from '@/auth/cookies';
import { TranscriptSubmitPage } from '@/features/transcripts/components/TranscriptSubmitPage';

/**
 * New Transcript Page -- Server Component shell.
 *
 * Requires authentication. Delegates to the client-side TranscriptSubmitPage
 * component which provides three submission modes: Platform, URL, Paste.
 */
export default async function NewTranscriptRoute() {
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

  return <TranscriptSubmitPage />;
}
