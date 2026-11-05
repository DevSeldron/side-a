import type { ReactElement } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AlertCircle, ArrowUpRight, Command, Loader2, RefreshCw, Search, Settings } from 'lucide-react'
import { useApp } from '../store/app'
import { UserAvatar } from './UserAvatar'
import { cx, relativeDate } from '../lib/format'

export function TopBar(): ReactElement {
  const snapshot = useApp((state) => state.snapshot)
  const sync = useApp((state) => state.sync)
  const setPaletteOpen = useApp((state) => state.setPaletteOpen)
  const update = useApp((state) => state.update)
  const dismissUpdate = useApp((state) => state.dismissUpdate)
  const location = useLocation()
  if (!snapshot) return <header className="topbar" />

  const albumKey = /^\/album\/([^/]+)/.exec(location.pathname)?.[1]
  const section = location.pathname.startsWith('/discover')
    ? 'Browse Bandcamp'
    : location.pathname.startsWith('/wishlist')
    ? 'Saved for later'
    : location.pathname.startsWith('/offline')
      ? 'Local listening'
      : location.pathname.startsWith('/downloads')
        ? 'Original files'
        : location.pathname.startsWith('/local')
          ? 'Local files'
        : location.pathname.startsWith('/settings')
          ? 'Preferences'
          : location.pathname.startsWith('/album')
            ? 'Release'
            : 'Library'
  const album = albumKey ? snapshot.collection.find((item) => item.key === albumKey) ?? snapshot.wishlist.find((item) => item.key === albumKey) : undefined

  const state = snapshot.sync
  const syncing = state.status === 'syncing'
  const failed = state.status === 'error'
  const label = syncing
    ? state.progress > 0
      ? `Syncing ${Math.round(state.progress * 100)}%`
      : 'Syncing'
    : failed
      ? 'Retry sync'
      : snapshot.demo
        ? 'Refresh demo'
        : 'Sync library'
  const subtitle = syncing
    ? state.message
    : failed
      ? state.error ?? 'Something went wrong'
      : state.lastSyncedAt
        ? `Synced ${relativeDate(state.lastSyncedAt)}`
        : 'Not synced yet'

  return (
    <header className="topbar drag-region">
      <div className="topbar-crumb">
        <span>Side A</span>
        <em>/</em>
        <strong>{section}</strong>
        {album ? (
          <>
            <em>/</em>
            <strong className="is-album">{album.bandName}</strong>
          </>
        ) : null}
      </div>
      <div className="topbar-actions no-drag">
        {update?.available ? (
          <button
            type="button"
            className="update-pill"
            onClick={() => {
              if (update.url) void window.sideA.library.openExternal(update.url)
              dismissUpdate()
            }}
            title={update.name ?? `Version ${update.version} is available`}
          >
            <ArrowUpRight size={15} />
            <span>{update.version}</span>
          </button>
        ) : null}
        <button
          type="button"
          className={cx('sync-pill', syncing && 'is-syncing', failed && 'is-error')}
          onClick={() => void sync()}
          disabled={syncing}
          title={state.error ?? subtitle}
        >
          {syncing ? <Loader2 size={15} className="spin" /> : failed ? <AlertCircle size={15} /> : <RefreshCw size={15} />}
          <span className="sync-copy">
            <strong>{label}</strong>
            <em>{subtitle}</em>
          </span>
          {syncing ? <span className="sync-progress" style={{ width: `${Math.max(6, state.progress * 100)}%` }} /> : null}
        </button>
        <button type="button" className="search-trigger no-drag" onClick={() => setPaletteOpen(true)} title="Search (⌘K)">
          <Search size={16} />
          <span>Search</span>
          <kbd>
            <Command size={11} /> K
          </kbd>
        </button>
        <Link to="/settings" className="icon-button no-drag" title="Settings">
          <Settings size={18} />
        </Link>
        <UserAvatar
          className="topbar-avatar"
          src={snapshot.auth.photoUrl}
          name={snapshot.auth.displayName ?? snapshot.auth.username}
        />
      </div>
    </header>
  )
}
