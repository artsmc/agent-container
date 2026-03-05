/**
 * Assignee Resolver
 *
 * Resolves a human-readable assignee name (or email) to an Asana user GID
 * by looking up workspace members via the Asana API.
 *
 * Maintains a per-workspace in-memory cache with a 15-minute TTL to
 * avoid per-push API calls for member lookups.
 *
 * Lookup cascade: exact name match -> case-insensitive name match -> email match.
 * Returns null (non-fatal) if no match is found.
 */

import { logger } from './logger';

interface AsanaMember {
  gid: string;
  name: string;
  email: string;
}

interface CacheEntry {
  members: AsanaMember[];
  fetchedAt: number;
}

const MEMBER_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const memberCache = new Map<string, CacheEntry>();

/**
 * Fetches workspace members from the Asana API and caches the result.
 * Returns cached data if the TTL has not expired.
 */
async function getWorkspaceMembers(
  workspaceGid: string,
  accessToken: string,
): Promise<AsanaMember[]> {
  const cached = memberCache.get(workspaceGid);
  if (cached && Date.now() - cached.fetchedAt < MEMBER_CACHE_TTL_MS) {
    return cached.members;
  }

  const response = await fetch(
    `https://app.asana.com/api/1.0/workspaces/${workspaceGid}/users?opt_fields=gid,name,email`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  const body = (await response.json()) as { data: AsanaMember[] };
  const members: AsanaMember[] = body.data ?? [];

  memberCache.set(workspaceGid, { members, fetchedAt: Date.now() });
  return members;
}

/**
 * Resolves an assignee name to an Asana user GID.
 *
 * @returns The Asana user GID, or null if assigneeName is null or no match is found.
 */
export async function resolveAssigneeGid(
  assigneeName: string | null,
  workspaceGid: string,
  accessToken: string,
): Promise<string | null> {
  if (!assigneeName) return null;

  const members = await getWorkspaceMembers(workspaceGid, accessToken);

  // 1. Exact name match
  const exactMatch = members.find((m) => m.name === assigneeName);
  if (exactMatch) return exactMatch.gid;

  // 2. Case-insensitive name match
  const lowerName = assigneeName.toLowerCase();
  const caseMatch = members.find(
    (m) => m.name.toLowerCase() === lowerName,
  );
  if (caseMatch) return caseMatch.gid;

  // 3. Email match
  const emailMatch = members.find(
    (m) => m.email.toLowerCase() === lowerName,
  );
  if (emailMatch) return emailMatch.gid;

  // No match found
  logger.warn(
    { assigneeName, workspaceGid },
    'Asana assignee not found in workspace members',
  );
  return null;
}

/**
 * Clears the member cache. Exposed for testing only.
 */
export function _clearMemberCache(): void {
  memberCache.clear();
}

/**
 * Returns the raw cache map. Exposed for testing only.
 */
export function _getMemberCache(): Map<string, CacheEntry> {
  return memberCache;
}
