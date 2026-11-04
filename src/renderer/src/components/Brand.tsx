import type { ReactElement } from 'react'
import { cx } from '../lib/format'

export function BrandMark({ className }: { className?: string }): ReactElement {
  return (
    <span className={cx('brand-mark', className)} aria-hidden="true">
      <svg viewBox="0 0 40 40" role="presentation">
        <path d="M10.5 30.5 21.2 9.5h8.3L18.8 30.5z" fill="currentColor" />
        <path d="M4 30.5 14.7 9.5h5.2L9.2 30.5z" fill="currentColor" opacity="0.36" />
        <circle cx="29.6" cy="10.4" r="3.1" fill="var(--brand-dot, #08080b)" opacity="0.55" />
      </svg>
    </span>
  )
}

export function Brand({ compact = false }: { compact?: boolean }): ReactElement {
  return (
    <div className={cx('brand', compact && 'is-compact')}>
      <BrandMark />
      {!compact && (
        <div className="brand-text">
          <span className="brand-name">SIDE A</span>
          <span className="brand-sub">Bandcamp player</span>
        </div>
      )}
    </div>
  )
}
