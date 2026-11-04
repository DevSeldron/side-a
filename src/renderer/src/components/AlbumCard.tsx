import type { MouseEvent, ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, HardDrive, Loader2, Pause, Play } from 'lucide-react'
import type { Album } from '@shared/types'
import { usePlayer } from '../store/player'
import { Artwork } from './Artwork'
import { coverUrl, cx } from '../lib/format'

interface AlbumCardProps {
  album: Album
  priority?: boolean
  compact?: boolean
}

export function AlbumCard({ album, priority, compact }: AlbumCardProps): ReactElement {
  const current = usePlayer((state) => state.queue[state.index])
  const playing = usePlayer((state) => state.playing)
  const pendingKey = usePlayer((state) => state.pendingKey)
  const playAlbum = usePlayer((state) => state.playAlbum)
  const toggle = usePlayer((state) => state.toggle)

  const isCurrentAlbum = current?.albumKey === album.key
  const isPlaying = isCurrentAlbum && playing
  const isPending = pendingKey === album.key

  const onPlay = async (event: MouseEvent): Promise<void> => {
    event.preventDefault()
    event.stopPropagation()
    if (isCurrentAlbum) {
      await toggle()
      return
    }
    await playAlbum(album.key)
  }

  return (
    <Link
      to={`/album/${album.key}`}
      className={cx('album-card', compact && 'is-compact', isCurrentAlbum && 'is-current')}
      onDoubleClick={() => void playAlbum(album.key)}
    >
      <div className="album-art">
        <Artwork src={coverUrl(album, compact ? 9 : 10)} alt={`${album.bandName} — ${album.title}`} eager={priority} />
        <button
          type="button"
          className={cx('album-play', isPlaying && 'is-playing')}
          onClick={(event) => void onPlay(event)}
          aria-label={isPlaying ? `Pause ${album.title}` : `Play ${album.title}`}
        >
          {isPending ? (
            <Loader2 size={20} className="spin" />
          ) : isPlaying ? (
            <Pause size={20} fill="currentColor" />
          ) : (
            <Play size={20} fill="currentColor" className="play-glyph" />
          )}
        </button>
        <div className="album-flags">
          {album.purchaseDownloadable ? (
            <span className="flag" title="Purchase download available">
              <BadgeCheck size={13} />
              Bought
            </span>
          ) : null}
        </div>
      </div>
      <div className="album-meta">
        <p className="album-band">{album.bandName}</p>
        <h3 className="album-title">{album.title}</h3>
        {!compact ? (
          <p className="album-sub">
            {album.featuredTrackTitle ?? (album.numTracks ? `${album.numTracks} tracks` : album.itemType === 'track' ? 'Single' : 'Release')}
          </p>
        ) : null}
      </div>
    </Link>
  )
}

export function OfflineBadge({ label = 'Offline' }: { label?: string }): ReactElement {
  return (
    <span className="offline-badge">
      <HardDrive size={12} />
      {label}
    </span>
  )
}
