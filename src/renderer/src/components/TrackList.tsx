import type { ReactElement } from 'react'
import { Check, Download, Loader2, Pause, Play } from 'lucide-react'
import type { Album, AlbumDetail } from '@shared/types'
import { usePlayer } from '../store/player'
import { useApp } from '../store/app'
import { cx, formatDuration } from '../lib/format'

interface TrackListProps {
  album: Album
  detail: AlbumDetail
  offlineReady?: boolean
}

export function TrackList({ album, detail, offlineReady }: TrackListProps): ReactElement {
  const current = usePlayer((state) => state.queue[state.index])
  const playing = usePlayer((state) => state.playing)
  const pendingKey = usePlayer((state) => state.pendingKey)
  const playAlbum = usePlayer((state) => state.playAlbum)
  const toggle = usePlayer((state) => state.toggle)
  const downloads = useApp((state) => state.snapshot?.trackDownloads)
  const quality = useApp((state) => state.snapshot?.settings.trackQuality ?? 'mp3-128')
  const downloadTrack = useApp((state) => state.downloadTrack)
  const isPending = pendingKey === album.key

  const onPlay = async (trackId: number): Promise<void> => {
    if (current?.albumKey === album.key && current.id === trackId) {
      await toggle()
      return
    }
    await playAlbum(album.key, trackId)
  }

  return (
    <div className="tracklist" role="list">
      <div className="tracklist-head">
        <span>#</span>
        <span>Title</span>
        <span className="tracklist-source">{offlineReady ? 'Offline copy' : 'Source'}</span>
        <span className="tracklist-time">Length</span>
      </div>
      {detail.tracks.map((track) => {
        const isCurrent = current?.albumKey === album.key && current.id === track.id
        const entry = downloads?.[`${album.key}:${track.id}`]
        const busy = entry?.status === 'downloading'
        const done = entry?.status === 'done'
        return (
          <div
            key={track.id}
            className={cx('track-row', isCurrent && 'is-current')}
            role="listitem"
            tabIndex={0}
            onClick={() => void onPlay(track.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                void onPlay(track.id)
              }
            }}
          >
            <span className="track-number">
              <em>{String(track.number).padStart(2, '0')}</em>
              <span className="track-row-play">
                {isPending && isCurrent ? (
                  <Loader2 size={15} className="spin" />
                ) : isCurrent && playing ? (
                  <Pause size={15} fill="currentColor" />
                ) : (
                  <Play size={15} fill="currentColor" className="play-glyph" />
                )}
              </span>
            </span>
            <span className="track-name">
              <span className="track-title">{track.title}</span>
              <span className="track-artist">{track.artist || detail.bandName}</span>
            </span>
            <span className="tracklist-source">{offlineReady ? 'Offline' : track.isStreamable === false ? 'Preview' : 'Stream'}</span>
            <span className="tracklist-time">
              <span className="track-duration">{formatDuration(track.duration)}</span>
              <button
                type="button"
                className={cx('track-download', done && 'is-done', busy && 'is-busy')}
                title={
                  busy
                    ? 'Downloading…'
                    : done
                      ? `Saved to ${entry?.filePath ?? 'your download folder'}`
                      : `Download this track (${quality.replace('mp3-', 'MP3 ')})`
                }
                aria-label={`Download ${track.title}`}
                onClick={(event) => {
                  event.stopPropagation()
                  if (!busy && !done) void downloadTrack(album.key, track.id, quality)
                }}
              >
                {busy ? <Loader2 size={13} className="spin" /> : done ? <Check size={13} /> : <Download size={13} />}
              </button>
            </span>
          </div>
        )
      })}
    </div>
  )
}
