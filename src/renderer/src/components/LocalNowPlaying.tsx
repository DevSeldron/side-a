import { useEffect, useRef, useState, type ReactElement } from 'react'
import { ChevronDown, Disc3 } from 'lucide-react'
import { useLocalPlayer } from '../store/localPlayer'
import { Artwork } from './Artwork'
import { LocalPlaybackControls, LocalWaveScrubber } from './LocalPlayback'
import { cx, formatDuration } from '../lib/format'

export function LocalNowPlaying(): ReactElement | null {
  const expanded = useLocalPlayer((state) => state.expanded)
  const track = useLocalPlayer((state) => state.queue[state.index])
  const queue = useLocalPlayer((state) => state.queue)
  const index = useLocalPlayer((state) => state.index)
  const setExpanded = useLocalPlayer((state) => state.setExpanded)
  const loadAt = useLocalPlayer((state) => state.loadAt)
  const loading = useLocalPlayer((state) => state.loading)
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current)
    }
  }, [])

  // Play the panel out before unmounting it, so closing the full-screen view
  // animates instead of cutting straight to the page underneath.
  const close = (): void => {
    if (closing) return
    setClosing(true)
    closeTimer.current = window.setTimeout(() => {
      setExpanded(false)
      setClosing(false)
    }, 266)
  }

  if (!expanded || !track) return null

  return (
    <div className={cx('now-playing local-now-playing', closing && 'is-closing')}>
      <div className="now-backdrop" style={{ backgroundImage: `url(${track.coverUrl})` }} aria-hidden="true" />
      <div className="now-grain" aria-hidden="true" />

      <header className="now-head">
        <div className="now-heading">
          <span className="now-kicker">Now playing / Local</span>
          <span className="now-album">{track.album}</span>
        </div>
        <button type="button" className="icon-button now-close" onClick={close} title="Close now playing">
          <ChevronDown size={22} />
        </button>
      </header>

      <div className="now-body">
        <div className="now-main">
          <div className={cx('now-art', loading && 'is-loading')} key={`${track.id}-art`}>
            <Artwork src={track.coverUrl} alt={track.album} eager />
          </div>
          <div className="now-meta" key={`${track.id}-meta`}>
            <span className="now-number">Track {String(track.trackNumber ?? index + 1).padStart(2, '0')}</span>
            <h1>{track.title}</h1>
            <p>
              {track.artist} <span>/</span> {track.album}
            </p>
          </div>
          <LocalWaveScrubber />
          <LocalPlaybackControls size="lg" />
          <div className="now-footer">
            <span>Playing from this device</span>
            <span>
              {formatDuration(track.duration)} / Side A
            </span>
          </div>
        </div>

        <aside className="now-queue">
          <div className="now-queue-head">
            <span>
              <Disc3 size={15} /> Up next
            </span>
            <em>{queue.length} tracks</em>
          </div>
          <div className="now-queue-list">
            {queue.map((entry, position) => (
              <button
                type="button"
                key={entry.id}
                className={cx('now-queue-row', position === index && 'is-current')}
                style={{ animationDelay: `${Math.min(position, 10) * 28}ms` }}
                onClick={() => void loadAt(position, true)}
              >
                <span className="now-queue-number">{position === index ? '▶' : String(entry.trackNumber ?? position + 1).padStart(2, '0')}</span>
                <span className="now-queue-copy">
                  <strong>{entry.title}</strong>
                  <span>{entry.artist}</span>
                </span>
                <span className="now-queue-time">{formatDuration(entry.duration)}</span>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}
