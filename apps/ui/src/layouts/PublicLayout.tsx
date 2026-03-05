import styles from './PublicLayout.module.scss'

export function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.root} data-testid="public-layout">
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logo}>iExcel</span>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  )
}
