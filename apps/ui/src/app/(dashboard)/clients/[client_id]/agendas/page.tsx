import { AgendaListPage } from '@/features/agendas/components/AgendaListPage'

interface AgendaListRouteProps {
  params: Promise<{ client_id: string }>
}

/**
 * Agenda List route page.
 * Server component that extracts the client_id param and
 * renders the AgendaListPage client component.
 */
export default async function AgendaListRoute({ params }: AgendaListRouteProps) {
  const { client_id } = await params
  return <AgendaListPage clientId={client_id} />
}
