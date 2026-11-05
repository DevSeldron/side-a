import { useEffect, useRef, useState, type ReactElement } from 'react'
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
  const [loaded, setLoaded] = useState(false)
  const imageRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    setFailed(false)
    setLoaded(false)
    if (imageRef.current?.complete) setLoaded(true)
  }, [src])

  if (!src || failed) {
    return (
      <div className={cx('artwork-fallback', round && 'is-round', className)} aria-label={alt}>
        <Disc3 size={28} strokeWidth={1.5} />
      </div>
    )
  }
  return (
    <img
      ref={imageRef}
      className={cx('artwork', loaded && 'is-loaded', round && 'is-round', className)}
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      draggable={false}
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
    />
  )
}
