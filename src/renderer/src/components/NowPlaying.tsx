import type { ReactElement } from 'react'
import { ChevronDown, Disc3 } from 'lucide-react'
import { usePlayer } from '../store/player'
import { Artwork } from './Artwork'
import { PlaybackControls, WaveScrubber } from './Playback'
import { cx, formatDuration } from '../lib/format'

export function NowPlaying(): ReactElement | null {
  const expanded = usePlayer((state) => state.expanded)
  const track = usePlayer((state) => state.queue[state.index])
  const queue = usePlayer((state) => state.queue)
  const index = usePlayer((state) => state.index)
  const setExpanded = usePlayer((state) => state.setExpanded)
  const loadAt = usePlayer((state) => state.loadAt)
  const loading = usePlayer((state) => state.loading)

  // A queue spanning several releases reads better numbered by position.
  const mixedRelease = new Set(queue.map((entry) => entry.albumKey)).size > 1

  if (!expanded || !track) return null

  return (
    <div className="now-playing">
      <div className="now-backdrop" style={{ backgroundImage: `url(${track.coverUrl})` }} aria-hidden="true" />
      <div className="now-grain" aria-hidden="true" />

      <header className="now-head">
        <div className="now-heading">
          <span className="now-kicker">Now playing</span>
          <span className="now-album">{track.albumTitle}</span>
        </div>
        <button type="button" className="icon-button now-close" onClick={() => setExpanded(false)} title="Close now playing">
          <ChevronDown size={22} />
        </button>
      </header>

      <div className="now-body">
        <div className="now-main">
          <div className={cx('now-art', loading && 'is-loading')} key={`${track.albumKey}-${track.id}-art`}>
            <Artwork src={track.coverUrl} alt={track.albumTitle} eager />
          </div>
          <div className="now-meta" key={`${track.albumKey}-${track.id}-meta`}>
            <span className="now-number">Track {String(track.number).padStart(2, '0')}</span>
            <h1>{track.title}</h1>
            <p>
              {track.artist} <span>/</span> {track.albumTitle}
            </p>
          </div>
          <WaveScrubber />
          <PlaybackControls size="lg" />
          <div className="now-footer">
            <span>{track.offline ? 'Playing from your offline copy' : 'Streaming from Bandcamp'}</span>
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
                key={`${entry.albumKey}-${entry.id}`}
                className={cx('now-queue-row', position === index && 'is-current')}
                style={{ animationDelay: `${Math.min(position, 10) * 28}ms` }}
                onClick={() => void loadAt(position, true)}
              >
                <span className="now-queue-number">
                  {position === index ? '▶' : String(mixedRelease ? position + 1 : entry.number).padStart(2, '0')}
                </span>
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
