import { PublicLayout } from '@/layouts/PublicLayout'

export default function SharedRouteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <PublicLayout>{children}</PublicLayout>
}
