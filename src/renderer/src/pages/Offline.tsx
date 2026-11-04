import type { ReactElement } from 'react'
import { Album as AlbumIcon, ArrowDownToLine, FolderOpen, HardDrive, Loader2, Play, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Album } from '@shared/types'
import { useApp } from '../store/app'
import { usePlayer } from '../store/player'
import { Artwork } from '../components/Artwork'
import { EmptyState, PageIntro, ProgressBar } from '../components/Page'
import { coverUrl, formatBytes, plural } from '../lib/format'

export function Offline(): ReactElement {
  const snapshot = useApp((state) => state.snapshot)
  const saveAllPurchased = useApp((state) => state.saveAllPurchased)
  const removeOffline = useApp((state) => state.removeOffline)
  const playAlbum = usePlayer((state) => state.playAlbum)

  if (!snapshot) return <div className="page" />

  const entries = Object.values(snapshot.offline).sort((a, b) => {
    const rank = (status: string): number => (status === 'downloading' ? 0 : status === 'queued' ? 1 : status === 'error' ? 2 : 3)
    return rank(a.status) - rank(b.status) || (b.completedAt ?? 0) - (a.completedAt ?? 0)
  })
  const ready = entries.filter((entry) => entry.status === 'ready')
  const bytes = ready.reduce((total, entry) => total + entry.bytes, 0)
  const tracks = ready.reduce((total, entry) => total + entry.done, 0)
  const purchased = snapshot.collection.filter((album) => album.purchased).length

  const findAlbum = (key: string): Album | undefined =>
    snapshot.collection.find((album) => album.key === key) ?? snapshot.wishlist.find((album) => album.key === key)

  return (
    <div className="page">
      <PageIntro
        kicker="Stored locally"
        title="Offline"
        description={
          ready.length
            ? `${plural(ready.length, 'release')} and ${plural(tracks, 'track')} stored locally, ${formatBytes(bytes)} of music that plays without a connection.`
            : 'Save releases for flights, trains and dead zones. Side A stores a 128 kbps copy locally; purchases can also be kept as original files.'
        }
        actions={
          <>
            <button type="button" className="button ghost" onClick={() => void window.sideA.offline.openFolder()}>
              <FolderOpen size={16} />
              Open folder
            </button>
            <button type="button" className="button primary" onClick={() => void saveAllPurchased()} disabled={!purchased}>
              <ArrowDownToLine size={16} />
              Save all purchases
            </button>
          </>
        }
      >
        <div className="stat-row">
          <div className="stat"><strong>{ready.length}</strong><span>Releases</span></div>
          <div className="stat"><strong>{tracks}</strong><span>Tracks</span></div>
          <div className="stat"><strong>{formatBytes(bytes)}</strong><span>On disk</span></div>
          <div className="stat"><strong>{purchased}</strong><span>Purchased</span></div>
        </div>
      </PageIntro>

      {entries.length === 0 ? (
        <EmptyState
          icon={<HardDrive size={26} />}
          title="Nothing saved offline yet"
          description="Open any release and choose “Save offline”, or queue every purchase at once. Saved music appears here and streams through Side A without a connection."
          action={
            <Link to="/" className="button primary">
              Browse collection
            </Link>
          }
        />
      ) : (
        <div className="offline-list">
          {entries.map((entry) => {
            const album = findAlbum(entry.key)
            if (!album) return null
            const progress = entry.total ? entry.done / entry.total : entry.progress
            const saving = entry.status === 'downloading' || entry.status === 'queued'
            return (
              <div key={entry.key} className="offline-row">
                <Link to={`/album/${album.key}`} className="offline-art">
                  <Artwork src={entry.status === 'ready' ? `bcmedia://cover/${album.key}` : coverUrl(album, 9)} alt={album.title} />
                </Link>
                <div className="offline-copy">
                  <span className="offline-band">{album.bandName}</span>
                  <Link to={`/album/${album.key}`} className="offline-title">{album.title}</Link>
                  <div className="offline-status-line">
                    {saving ? (
                      <>
                        <Loader2 size={13} className="spin" />
                        <span>{entry.status === 'queued' ? 'Queued' : `Saving ${entry.done} of ${entry.total} tracks`}</span>
                      </>
                    ) : entry.status === 'error' ? (
                      <span className="is-error">{entry.error ?? 'Save failed'}</span>
                    ) : (
                      <span>
                        {entry.done} tracks · {formatBytes(entry.bytes)} · {entry.completedAt ? new Date(entry.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Ready'}
                      </span>
                    )}
                  </div>
                  {saving ? <ProgressBar value={progress} /> : null}
                </div>
                <div className="offline-actions">
                  {entry.status === 'ready' ? (
                    <button type="button" className="button small primary" onClick={() => void playAlbum(album.key)}>
                      <Play size={14} fill="currentColor" />
                      Play
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="icon-button"
                    title="Remove offline copy"
                    onClick={() => void removeOffline(entry.key)}
                    disabled={entry.status === 'removing'}
                  >
                    {entry.status === 'removing' ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="local-note">
        <AlbumIcon size={16} />
        <div>
          <strong>How offline listening works</strong>
          <span>
            Side A downloads a 128 kbps MP3 per track plus the cover art, stored in your app data folder. Purchased originals are
            downloaded separately from the Downloads page and saved to the folder you choose in Settings.
          </span>
        </div>
      </div>
    </div>
  )
}
