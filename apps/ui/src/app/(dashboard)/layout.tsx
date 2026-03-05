import { DashboardLayout } from '@/layouts/DashboardLayout'

export default function DashboardRouteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <DashboardLayout>{children}</DashboardLayout>
}
