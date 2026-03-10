'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './Sidebar.module.scss'

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/clients', label: 'Clients' },
  { href: '/transcripts', label: 'Transcripts' },
  { href: '/tasks', label: 'Tasks' },
  { href: '/agendas', label: 'Agendas' },
  { href: '/workflows', label: 'Workflows' },
  { href: '/integrations', label: 'Integrations' },
  { href: '/settings', label: 'Settings' },
] as const

export function NavLinks() {
  const pathname = usePathname()

  return (
    <nav className={styles.nav} data-testid="nav-links">
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.href === '/'
            ? pathname === '/'
            : pathname === item.href || pathname.startsWith(item.href + '/')

        return (
          <Link
            key={item.href}
            href={item.href}
            data-active={isActive}
            data-testid={`nav-link-${item.label.toLowerCase()}`}
            className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
