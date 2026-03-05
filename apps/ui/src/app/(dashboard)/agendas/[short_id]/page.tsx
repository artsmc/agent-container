import Link from 'next/link'
import { fetchAgendaDetail } from '@/features/agendas/actions'
import { AgendaEditorPage } from '@/features/agendas/components/AgendaEditorPage'
import styles from './page.module.scss'

interface AgendaEditorRouteProps {
  params: Promise<{ short_id: string }>
}

/**
 * Agenda Editor route page.
 * Server component that fetches the agenda by short ID and
 * renders the AgendaEditorPage client component.
 * Shows a "not found" state if the agenda doesn't exist.
 */
export default async function AgendaEditorRoute({
  params,
}: AgendaEditorRouteProps) {
  const { short_id } = await params
  const { agenda, error } = await fetchAgendaDetail(short_id)

  if (!agenda || error) {
    return (
      <div className={styles.notFound}>
        <h1>Agenda not found</h1>
        <p>
          The agenda &quot;{short_id}&quot; could not be found. It may have been
          removed or the ID is incorrect.
        </p>
        <Link href="/" className={styles.backLink}>
          Back to Dashboard
        </Link>
      </div>
    )
  }

  return <AgendaEditorPage initialAgenda={agenda} />
}
