import { redirect } from 'next/navigation'

interface PageProps {
  params: Promise<{ client_id: string }>
}

/**
 * Redirects /clients/:id/tasks to /clients/:id?tab=tasks.
 * Tasks are displayed as a tab on the client detail page.
 */
export default async function ClientTasksRedirect({ params }: PageProps) {
  const { client_id } = await params
  redirect(`/clients/${client_id}?tab=tasks`)
}
