import { useState, type ReactElement } from 'react'
import { Disc3 } from 'lucide-react'
import { cx } from '../lib/format'

interface ArtworkProps {
  src?: string
  alt: string
  className?: string
  round?: boolean
  eager?: boolean
}

export function Artwork({ src, alt, className, round, eager }: ArtworkProps): ReactElement {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div className={cx('artwork-fallback', round && 'is-round', className)} aria-label={alt}>
        <Disc3 size={28} strokeWidth={1.5} />
      </div>
    )
  }
  return (
    <img
      className={cx('artwork', round && 'is-round', className)}
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      draggable={false}
      onError={() => setFailed(true)}
    />
  )
}
