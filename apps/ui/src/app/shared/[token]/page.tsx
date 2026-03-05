export default function SharedAgendaPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  return (
    <div data-testid="shared-agenda-page">
      <h1>Shared Agenda</h1>
      <p>Public agenda view.</p>
    </div>
  )
}
