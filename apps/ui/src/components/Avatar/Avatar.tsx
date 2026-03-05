/**
 * Avatar -- A circular user avatar with initials fallback.
 *
 * Displays a user image or their initials when no image is available.
 *
 * Full implementation: Feature 25 (ui-dashboard).
 */

import styles from './Avatar.module.scss'

export interface AvatarProps {
  src?: string
  alt?: string
  name?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

function getInitials(name?: string): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export default function Avatar({
  src,
  alt,
  name,
  size = 'md',
  className,
}: AvatarProps) {
  return (
    <div
      data-testid="avatar"
      data-size={size}
      className={`${styles.root} ${className ?? ''}`}
    >
      {src ? (
        <img src={src} alt={alt ?? name ?? 'Avatar'} className={styles.image} />
      ) : (
        <span className={styles.initials}>{getInitials(name)}</span>
      )}
    </div>
  )
}
