import { useLayoutEffect, useMemo, useState, type ReactElement } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowDownToLine,
  BadgeCheck,
  Calendar,
  Clock3,
  Disc3,
  ExternalLink,
  HardDrive,
  Heart,
  Loader2,
  Pause,
  Play,
  Trash2
} from 'lucide-react'
import type { Album } from '@shared/types'
import { useApp } from '../store/app'
import { usePlayer } from '../store/player'
import { useAlbumDetail } from '../lib/useAlbumDetail'
import { Artwork } from '../components/Artwork'
import { TrackList } from '../components/TrackList'
import { OfflineBadge } from '../components/AlbumCard'
import { FormatPicker } from '../components/FormatPicker'
import { ProgressBar } from '../components/Page'
import { coverUrl, cx, formatDuration, formatLongDuration, formatYear, plural } from '../lib/format'

// Bandcamp stores this release as `void__19###` even though the artist styles it
// as `void_19####`, so accept both spellings without matching unrelated titles.
const VOID_TRIBUTE_TITLE = /^void_+19#+$/

function normalizeTributeText(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function AlbumPage(): ReactElement {
  const { key } = useParams<{ key: string }>()
  const snapshot = useApp((state) => state.snapshot)
  const saveOffline = useApp((state) => state.saveOffline)
  const removeOffline = useApp((state) => state.removeOffline)
  const pushToast = useApp((state) => state.pushToast)
  const playAlbum = usePlayer((state) => state.playAlbum)
  const toggle = usePlayer((state) => state.toggle)
  const current = usePlayer((state) => state.queue[state.index])
  const playing = usePlayer((state) => state.playing)
  const pendingKey = usePlayer((state) => state.pendingKey)
  const { detail, loading, error, reload } = useAlbumDetail(key)
  const [busy, setBusy] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const album: Album | undefined = useMemo(() => {
    if (!snapshot || !key) return undefined
    return (
      snapshot.collection.find((entry) => entry.key === key) ??
      snapshot.wishlist.find((entry) => entry.key === key) ??
      undefined
    )
  }, [snapshot, key])

  const isVoidTribute = Boolean(
    album?.purchased &&
      VOID_TRIBUTE_TITLE.test(normalizeTributeText(album.title)) &&
      normalizeTributeText(album.bandName) === 'no love in the house of gold'
  )

  useLayoutEffect(() => {
    if (!isVoidTribute) return
    const root = document.documentElement
    root.dataset.tribute = 'void'
    return () => {
      delete root.dataset.tribute
    }
  }, [isVoidTribute])

  if (!snapshot || !key) return <div className="page" />

  if (!album) {
    return (
      <div className="page">
        <div className="empty-state">
          <span className="empty-icon"><Disc3 size={26} /></span>
          <h2>This release is not in your library</h2>
          <p>It may have been removed from your Bandcamp collection, or the link is out of date</p>
          <div className="empty-action">
            <Link className="button primary" to="/">Back to collection</Link>
          </div>
        </div>
      </div>
    )
  }

  const offline = snapshot.offline[album.key]
  const offlineReady = offline?.status === 'ready'
  const isCurrent = current?.albumKey === album.key
  const isPlaying = isCurrent && playing
  const isPending = pendingKey === album.key
  const purchase = snapshot.purchases[album.key]
  const totalDuration = detail?.tracks.reduce((sum, track) => sum + (track.duration || 0), 0) ?? 0
  const art = offlineReady ? `bcmedia://cover/${album.key}` : detail?.artUrl || coverUrl(album, 10)
  const isWishlist = !album.purchased && snapshot.wishlist.some((entry) => entry.key === album.key)

  const onPlay = async (): Promise<void> => {
    if (isCurrent) {
      await toggle()
      return
    }
    await playAlbum(album.key)
  }

  const onSave = async (): Promise<void> => {
    setBusy(true)
    try {
      await saveOffline(album.key)
    } catch {
      // The store already surfaces a toast.
    } finally {
      setBusy(false)
    }
  }

  const onRemove = async (): Promise<void> => {
    setBusy(true)
    try {
      await removeOffline(album.key)
    } catch {
      // The store already surfaces a toast.
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page album-page">
      <div className="album-hero">
        <div className="album-hero-art">
          <Artwork src={art} alt={`${album.bandName}, ${album.title}`} eager />
          {offlineReady ? <span className="album-hero-offline"><OfflineBadge label="Saved offline" /></span> : null}
        </div>

        <div className="album-hero-copy">
          <div className="album-badges">
            {album.purchased ? (
              <span className="pill is-bought"><BadgeCheck size={13} /> Purchased</span>
            ) : isWishlist ? (
              <span className="pill is-wishlist"><Heart size={13} /> Wishlist</span>
            ) : null}
            {album.itemType === 'track' ? <span className="pill">Single</span> : null}
            {detail ? <span className="pill is-quiet">{plural(detail.tracks.length, 'track')}</span> : null}
          </div>

          <h1>{album.title}</h1>
          <p className="album-hero-band">{album.bandName}</p>

          <div className="album-facts">
            {formatYear(detail?.releaseDate ?? album.purchased ?? album.added) ? (
              <span><Calendar size={14} /> {formatYear(detail?.releaseDate ?? album.purchased ?? album.added)}</span>
            ) : null}
            {totalDuration > 0 ? <span><Clock3 size={14} /> {formatLongDuration(totalDuration)}</span> : null}
            <span><Disc3 size={14} /> {album.itemType === 'track' ? 'Single' : 'Album'}</span>
          </div>

          <div className="album-actions">
            <button type="button" className="button primary" onClick={() => void onPlay()} disabled={isPending}>
              {isPending ? <Loader2 size={17} className="spin" /> : isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
              {isPlaying ? 'Pause' : 'Play release'}
            </button>

            {offlineReady ? (
              <button type="button" className="button ghost" onClick={() => void onRemove()} disabled={busy}>
                {busy ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
                Remove offline
              </button>
            ) : (
              <button
                type="button"
                className="button ghost"
                onClick={() => void onSave()}
                disabled={busy || offline?.status === 'downloading' || offline?.status === 'queued'}
              >
                {busy || offline?.status === 'downloading' || offline?.status === 'queued' ? <Loader2 size={16} className="spin" /> : <HardDrive size={16} />}
                {offline?.status === 'downloading' || offline?.status === 'queued' ? 'Saving' : 'Save offline'}
              </button>
            )}

            {album.purchaseDownloadable ? (
              <button type="button" className="button ghost" onClick={() => setPickerOpen(true)}>
                <ArrowDownToLine size={16} />
                {purchase?.status === 'done' ? 'Download again' : 'Download purchase'}
              </button>
            ) : null}

            <a
              className="button ghost quiet"
              href={album.itemUrl}
              onClick={(event) => {
                event.preventDefault()
                void window.sideA.library.openExternal(album.itemUrl)
              }}
            >
              <ExternalLink size={15} />
              Bandcamp
            </a>
          </div>

          {offline && (offline.status === 'downloading' || offline.status === 'queued') ? (
            <div className="offline-progress-card">
              <div>
                <strong>{offline.status === 'queued' ? 'Waiting to save' : 'Saving offline copy'}</strong>
                <span>{offline.done} of {offline.total} tracks</span>
              </div>
              <ProgressBar value={offline.total ? offline.done / offline.total : offline.progress} />
            </div>
          ) : null}

          {offline?.status === 'error' ? (
            <p className="inline-error"><AlertCircle size={14} /> {offline.error ?? 'Offline save failed'}</p>
          ) : null}

          {purchase?.status === 'downloading' || purchase?.status === 'preparing' ? (
            <p className="inline-note">
              <Loader2 size={14} className="spin" />
              Downloading original files {purchase.totalBytes ? `/ ${Math.round(purchase.progress * 100)}%` : ''}
            </p>
          ) : null}
        </div>
      </div>

      {error && !detail ? (
        <div className="inline-panel is-error">
          <AlertCircle size={18} />
          <div>
            <strong>Tracklist unavailable</strong>
            <p>{error}</p>
          </div>
          <button type="button" className="button ghost" onClick={reload}>Try again</button>
        </div>
      ) : loading && !detail ? (
        <div className="inline-panel">
          <Loader2 size={18} className="spin" />
          <p>Loading the tracklist from Bandcamp</p>
        </div>
      ) : detail ? (
        <TrackList album={album} detail={detail} offlineReady={offlineReady} />
      ) : null}

      {detail && (detail.about || detail.credits) ? (
        <div className="album-notes">
          {detail.about ? (
            <section>
              <h2>About this release</h2>
              <p className="pre-line">{detail.about}</p>
            </section>
          ) : null}
          {detail.credits ? (
            <section>
              <h2>Credits</h2>
              <p className="pre-line">{detail.credits}</p>
            </section>
          ) : null}
        </div>
      ) : null}

      {isWishlist ? (
        <div className="wishlist-callout">
          <Heart size={16} />
          <div>
            <strong>On your wishlist</strong>
            <span>Buying it on Bandcamp unlocks the original download and adds it to your collection</span>
          </div>
          <button
            type="button"
            className="button ghost"
            onClick={() =>
              pushToast('Open Bandcamp to buy', {
                description: 'Purchases happen on Bandcamp, Side A is read-only for your library',
                tone: 'info'
              })
            }
          >
            Learn more
          </button>
        </div>
      ) : null}

      <FormatPicker album={album} open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </div>
  )
}
