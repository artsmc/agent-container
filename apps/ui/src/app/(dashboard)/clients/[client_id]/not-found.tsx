/**
 * Not-found page for the client detail route.
 *
 * Rendered when notFound() is called from the page server component
 * (e.g., when the client ID does not exist in the database).
 */
export default function ClientNotFound() {
  return (
    <div
      style={{ padding: '2rem', textAlign: 'center' }}
      data-testid="client-not-found"
    >
      <h1>Client not found</h1>
      <p style={{ marginTop: '0.5rem', color: 'var(--color-text-secondary)' }}>
        The client you are looking for does not exist or has been removed.
      </p>
    </div>
  )
}
