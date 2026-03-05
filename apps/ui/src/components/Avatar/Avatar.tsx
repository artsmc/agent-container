/**
 * Avatar -- A circular user avatar with initials fallback.
 *
 * Displays a user image or their initials when no image is available.
 * Background color is derived deterministically from the name prop so
 * each person gets a consistent color across the application.
 */

import styles from './Avatar.module.scss'

export interface AvatarProps {
  src?: string
  alt?: string
  name?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

/** Palette of muted background colors for initials avatars. */
const AVATAR_COLORS = [
  '#4f46e5', // indigo
  '#0891b2', // cyan
  '#059669', // emerald
  '#d97706', // amber
  '#dc2626', // red
  '#7c3aed', // violet
  '#2563eb', // blue
  '#c026d3', // fuchsia
  '#0d9488', // teal
  '#ea580c', // orange
] as const

function getInitials(name?: string): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

/**
 * Simple hash that converts a string into a stable index into AVATAR_COLORS.
 * Uses a basic char-code summation -- fast and deterministic.
 */
function getColorFromName(name?: string): string {
  if (!name) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export default function Avatar({
  src,
  alt,
  name,
  size = 'md',
  className,
}: AvatarProps) {
  const bgColor = !src ? getColorFromName(name) : undefined

  return (
    <div
      data-testid="avatar"
      data-size={size}
      className={`${styles.root} ${className ?? ''}`}
      style={bgColor ? { backgroundColor: bgColor } : undefined}
    >
      {src ? (
        <img src={src} alt={alt ?? name ?? 'Avatar'} className={styles.image} />
      ) : (
        <span className={styles.initials}>{getInitials(name)}</span>
      )}
    </div>
  )
}
