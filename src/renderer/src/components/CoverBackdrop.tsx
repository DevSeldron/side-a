import { useEffect, useState, type ReactElement } from 'react'

/**
 * The playing release's artwork, blurred and held at a low opacity behind the
 * app. Two layers ping-pong so a track change crossfades into the next cover
 * instead of flashing: the incoming image is loaded first, then fades in over
 * the previous one.
 */
export function CoverBackdrop({ url }: { url: string }): ReactElement {
  const [frames, setFrames] = useState<string[]>([])

  useEffect(() => {
    if (!url) {
      setFrames([])
      return
    }
    let active = true
    const image = new Image()
    const reveal = (): void => {
      if (!active) return
      setFrames((current) =>
        current[current.length - 1] === url ? current : [...current, url].slice(-2)
      )
    }
    image.onload = reveal
    image.src = url
    // Cached covers are complete as soon as src is assigned, so onload may not
    // fire at all for them.
    if (image.complete && image.naturalWidth > 0) reveal()
    return () => {
      active = false
    }
  }, [url])

  return (
    <div className="cover-backdrop" aria-hidden="true">
      {frames.map((frame) => (
        <img key={frame} className="cover-backdrop-frame" src={frame} alt="" draggable={false} />
      ))}
    </div>
  )
}
