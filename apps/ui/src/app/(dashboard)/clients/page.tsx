import { Suspense } from 'react'
import { ClientCardsGrid } from '@/components/ClientCardsGrid'
import { ClientCardsSkeleton } from '@/components/DashboardSkeleton'
import styles from './clients.module.scss'

export const metadata = {
  title: 'Clients — iExcel',
}

/**
 * Clients list page -- shows all clients the user has access to.
 * Reuses the same ClientCardsGrid component from the dashboard.
 */
export default function ClientsPage() {
  return (
    <div className={styles.page} data-testid="clients-page">
      <h1 className={styles.pageTitle}>Clients</h1>
      <Suspense fallback={<ClientCardsSkeleton count={6} />}>
        <ClientCardsGrid />
      </Suspense>
    </div>
  )
}
