import { useState, type ReactElement } from 'react'
import { AlertCircle, ArrowDownToLine, BadgeCheck, CheckCircle2, FolderOpen, Info, Loader2, Package, Settings2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Album } from '@shared/types'
import { useApp } from '../store/app'
import { Artwork } from '../components/Artwork'
import { EmptyState, PageIntro, ProgressBar } from '../components/Page'
import { FormatPicker } from '../components/FormatPicker'
import { coverUrl, formatBytes, shortPath } from '../lib/format'

export function Downloads(): ReactElement {
  const snapshot = useApp((state) => state.snapshot)
  const chooseDownloadDir = useApp((state) => state.chooseDownloadDir)
  const [picked, setPicked] = useState<Album | null>(null)

  if (!snapshot) return <div className="page" />

  const purchased = snapshot.collection.filter((album) => album.purchased)
  const downloadable = purchased.filter((album) => album.purchaseDownloadable)
  const downloads = Object.values(snapshot.purchases)
  const active = downloads.filter((entry) => entry.status === 'preparing' || entry.status === 'downloading' || entry.status === 'queued')
  const completed = downloads.filter((entry) => entry.status === 'done')
  const totalBytes = completed.reduce((sum, entry) => sum + entry.bytes, 0)

  return (
    <div className="page">
      <PageIntro
        kicker="Original files"
        title="Downloads"
        description="Keep the files you paid for. Side A downloads the exact format Bandcamp stores for your purchase — FLAC, WAV, AIFF, MP3 and more."
        actions={
          <button type="button" className="button ghost" onClick={() => void chooseDownloadDir()}>
            <FolderOpen size={16} />
            Change folder
          </button>
        }
      >
        <div className="download-folder">
          <span>Saved to</span>
          <code title={snapshot.settings.downloadDir}>{shortPath(snapshot.settings.downloadDir, 56)}</code>
          <Link to="/settings" className="download-folder-link" title="Download settings">
            <Settings2 size={14} />
          </Link>
        </div>
        <div className="stat-row">
          <div className="stat"><strong>{purchased.length}</strong><span>Purchased</span></div>
          <div className="stat"><strong>{downloadable.length}</strong><span>Downloadable</span></div>
          <div className="stat"><strong>{completed.length}</strong><span>Files kept</span></div>
          <div className="stat"><strong>{formatBytes(totalBytes)}</strong><span>Downloaded</span></div>
        </div>
      </PageIntro>

      {active.length > 0 ? (
        <section className="download-active">
          <h2>In progress</h2>
          {active.map((entry) => (
            <div key={entry.key} className="download-active-row">
              <Loader2 size={17} className="spin" />
              <div className="download-active-copy">
                <strong>{entry.bandName} — {entry.title}</strong>
                <span>
                  {entry.status === 'preparing'
                    ? 'Preparing your download…'
                    : `${formatBytes(entry.bytes)}${entry.totalBytes ? ` of ${formatBytes(entry.totalBytes)}` : ''}`}
                </span>
                {entry.status === 'downloading' ? <ProgressBar value={entry.progress} /> : null}
              </div>
              <span className="download-format">{entry.format.toUpperCase()}</span>
            </div>
          ))}
        </section>
      ) : null}

      {snapshot.demo ? (
        <div className="local-note">
          <Info size={16} />
          <div>
            <strong>This is the public demo</strong>
            <span>
              The demo collection belongs to another fan, so Bandcamp will not expose original downloads. Sign in with your own
              account to download the files you purchased.
            </span>
          </div>
        </div>
      ) : null}

      {purchased.length === 0 ? (
        <EmptyState
          icon={<Package size={26} />}
          title="No purchases yet"
          description={
            snapshot.demo
              ? 'The public demo cannot access purchase downloads. Sign in with your own Bandcamp account to download the files you own.'
              : 'When you buy music on Bandcamp, the original download appears here after your next sync.'
          }
          action={<Link to="/" className="button primary">Back to collection</Link>}
        />
      ) : (
        <div className="download-list">
          <div className="download-list-head">
            <span>Release</span>
            <span>Format</span>
            <span>Status</span>
            <span />
          </div>
          {purchased.map((album) => {
            const purchase = snapshot.purchases[album.key]
            const done = purchase?.status === 'done'
            const failed = purchase?.status === 'error'
            const busy = purchase?.status === 'downloading' || purchase?.status === 'preparing'
            return (
              <div key={album.key} className="download-row">
                <div className="download-release">
                  <Link to={`/album/${album.key}`} className="download-art">
                    <Artwork src={coverUrl(album, 9)} alt={album.title} />
                  </Link>
                  <div>
                    <Link to={`/album/${album.key}`} className="download-title">{album.title}</Link>
                    <span className="download-band">{album.bandName}</span>
                  </div>
                </div>
                <span className="download-format">{purchase?.format?.toUpperCase() ?? '—'}</span>
                <span className="download-state">
                  {done ? (
                    <><CheckCircle2 size={14} /> {formatBytes(purchase.bytes)}</>
                  ) : failed ? (
                    <><AlertCircle size={14} /> {purchase.error ?? 'Failed'}</>
                  ) : busy ? (
                    <><Loader2 size={14} className="spin" /> {Math.round((purchase.progress ?? 0) * 100)}%</>
                  ) : album.purchaseDownloadable ? (
                    <><BadgeCheck size={14} /> Ready</>
                  ) : (
                    <><AlertCircle size={14} /> No re-download</>
                  )}
                </span>
                <div className="download-actions">
                  {done ? (
                    <button type="button" className="button small ghost" onClick={() => void window.sideA.purchases.reveal(album.key)}>
                      Show file
                    </button>
                  ) : album.purchaseDownloadable ? (
                    <button type="button" className="button small primary" onClick={() => setPicked(album)} disabled={busy}>
                      {busy ? <Loader2 size={14} className="spin" /> : <ArrowDownToLine size={14} />}
                      {failed ? 'Retry' : 'Download'}
                    </button>
                  ) : (
                    <span className="download-muted">Only on bandcamp.com</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="local-note">
        <Package size={16} />
        <div>
          <strong>Bandcamp decides the formats</strong>
          <span>
            The list of available formats comes from your purchase page and can include FLAC, WAV, AIFF, ALAC, Ogg Vorbis and
            MP3. ZIP bundles are saved as-is. Downloads pause after the app quits and can be restarted here.
          </span>
        </div>
      </div>

      <FormatPicker album={picked} open={Boolean(picked)} onClose={() => setPicked(null)} />
    </div>
  )
}
