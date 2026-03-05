/**
 * ClientHeader -- Displays client name, workspace, and optional Grain link.
 *
 * Supports a loading skeleton state for when the data is in flight.
 */

import styles from './ClientHeader.module.scss'

export interface ClientHeaderProps {
  name: string
  workspaceName: string | null
  grainPlaylistId: string | null
  loading?: boolean
}

export default function ClientHeader({
  name,
  workspaceName,
  grainPlaylistId,
  loading = false,
}: ClientHeaderProps) {
  if (loading) {
    return (
      <header className={styles.header} data-testid="client-header-skeleton">
        <div className={`${styles.skeleton} ${styles.skeletonName}`} />
        <div className={`${styles.skeleton} ${styles.skeletonWorkspace}`} />
        <div className={`${styles.skeleton} ${styles.skeletonLink}`} />
      </header>
    )
  }

  return (
    <header className={styles.header} data-testid="client-header">
      <h1 className={styles.name}>{name}</h1>

      <p className={styles.workspace}>
        {workspaceName ?? 'No default workspace'}
      </p>

      {grainPlaylistId && (
        <a
          href={`https://grain.com/playlist/${grainPlaylistId}`}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.grainLink}
        >
          View Grain Playlist
        </a>
      )}
    </header>
  )
}
