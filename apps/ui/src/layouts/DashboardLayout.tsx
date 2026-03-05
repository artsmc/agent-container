import { Sidebar } from '@/components/Sidebar'
import { NavLinks } from '@/components/Sidebar/NavLinks'
import { Avatar } from '@/components/Avatar'
import styles from './DashboardLayout.module.scss'

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.root} data-testid="dashboard-layout">
      <Sidebar collapsed={false}>
        <div className={styles.logo}>
          <span className={styles.logoText}>iExcel</span>
        </div>
        <NavLinks />
        <div className={styles.userSection}>
          <Avatar name="User" size="sm" />
        </div>
      </Sidebar>
      <main className={styles.main} data-testid="dashboard-main">
        {children}
      </main>
    </div>
  )
}
