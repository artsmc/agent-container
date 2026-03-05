import { fetchClients } from '@/lib/dashboard/fetchClients';
import { fetchClientStatuses } from '@/lib/dashboard/fetchClientStatuses';
import { ClientCard } from '@/components/ClientCard';
import { ClientCardsGridErrorBanner } from './ClientCardsGridErrorBanner';
import styles from './ClientCardsGrid.module.scss';

/**
 * Async Server Component that fetches the client list, fans out
 * status requests in parallel, and renders a responsive card grid.
 */
export default async function ClientCardsGrid() {
  let clients;

  try {
    clients = await fetchClients();
  } catch {
    return <ClientCardsGridErrorBanner />;
  }

  if (clients.length === 0) {
    return (
      <div className={styles.emptyState} data-testid="client-grid-empty">
        <p>
          No clients found. Contact your administrator to be assigned client
          access.
        </p>
      </div>
    );
  }

  const statusMap = await fetchClientStatuses(clients.map((c) => c.id));

  return (
    <div className={styles.grid} data-testid="client-cards-grid">
      {clients.map((client) => (
        <ClientCard
          key={client.id}
          client={client}
          status={statusMap[client.id] ?? null}
        />
      ))}
    </div>
  );
}
