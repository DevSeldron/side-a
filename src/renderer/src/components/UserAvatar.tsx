import { useEffect, useState, type ReactElement } from 'react'
import { cx, initials } from '../lib/format'

export function UserAvatar({
  src,
  name,
  className
}: {
  src?: string
  name?: string
  className?: string
}): ReactElement {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  const showImage = Boolean(src) && !failed

  return (
    <div className={cx('avatar', className, showImage && 'has-image')}>
      {showImage ? (
        <img src={src} alt="" draggable={false} onError={() => setFailed(true)} />
      ) : (
        initials(name)
      )}
    </div>
  )
}
