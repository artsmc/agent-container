/**
 * Resolves an entity type and short ID to a client-side route path.
 *
 * Returns null when no dedicated screen exists for the entity type
 * or when the short ID is missing.
 */
export function getEntityRoute(
  entityType: string,
  entityShortId: string | null
): string | null {
  if (!entityShortId) return null;

  switch (entityType) {
    case 'task':
      return `/tasks/${entityShortId}`;
    case 'agenda':
      return `/agendas/${entityShortId}`;
    case 'client':
      return `/clients/${entityShortId}`;
    case 'transcript':
      // No dedicated transcript detail screen in V1
      return null;
    default:
      return null;
  }
}
