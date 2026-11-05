import type { ReactElement } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  ArrowDownToLine,
  Compass,
  FolderOpen,
  HardDrive,
  Heart,
  Library,
  LogOut,
  Settings
} from 'lucide-react'
import { useApp } from '../store/app'
import { usePlayer } from '../store/player'
import { useLocalPlayer } from '../store/localPlayer'
import { UserAvatar } from './UserAvatar'
import { cx, formatBytes } from '../lib/format'

export function Sidebar(): ReactElement {
  const snapshot = useApp((state) => state.snapshot)
  const logout = useApp((state) => state.logout)
  const navigate = useNavigate()
  if (!snapshot) return <aside className="sidebar" />

  const offlineEntries = Object.values(snapshot.offline).filter((entry) => entry.status === 'ready')
  const offlineBytes = offlineEntries.reduce((total, entry) => total + entry.bytes, 0)
  const activeDownloads = Object.values(snapshot.purchases).filter(
    (entry) => entry.status === 'preparing' || entry.status === 'downloading' || entry.status === 'queued'
  ).length
  const purchased = snapshot.collection.filter((album) => album.purchased).length
  const username = snapshot.auth.username ?? 'Bandcamp'

  const doLogout = async (): Promise<void> => {
    usePlayer.getState().stop()
    useLocalPlayer.getState().stop()
    await logout()
    navigate('/')
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand drag-region" aria-hidden="true" />

      <div className="sidebar-scroll">
        <p className="nav-label">Browse</p>
        <nav className="nav-list" aria-label="Browse">
          <NavLink to="/discover" className={({ isActive }) => cx('nav-item', isActive && 'is-active')}>
            <Compass size={18} />
            <span>Discover</span>
          </NavLink>
        </nav>

        <p className="nav-label">Your music</p>
        <nav className="nav-list" aria-label="Library">
          <NavLink to="/" end className={({ isActive }) => cx('nav-item', isActive && 'is-active')}>
            <Library size={18} />
            <span>Collection</span>
            <em>{snapshot.collection.length}</em>
          </NavLink>
          <NavLink to="/wishlist" className={({ isActive }) => cx('nav-item', isActive && 'is-active')}>
            <Heart size={18} />
            <span>Wishlist</span>
            <em>{snapshot.wishlist.length}</em>
          </NavLink>
          <NavLink to="/offline" className={({ isActive }) => cx('nav-item', isActive && 'is-active')}>
            <HardDrive size={18} />
            <span>Offline</span>
            <em>{offlineEntries.length}</em>
          </NavLink>
          <NavLink to="/downloads" className={({ isActive }) => cx('nav-item', isActive && 'is-active')}>
            <ArrowDownToLine size={18} />
            <span>Downloads</span>
            {activeDownloads > 0 ? <em className="is-live">{activeDownloads}</em> : null}
          </NavLink>
          <NavLink to="/local" className={({ isActive }) => cx('nav-item', isActive && 'is-active')}>
            <FolderOpen size={18} />
            <span>Local</span>
            <em>{snapshot.local.tracks.length}</em>
          </NavLink>
        </nav>

        <p className="nav-label">Listening</p>
        <div className="side-note">
          <span className="side-note-kicker">In your crate</span>
          <strong>{purchased}</strong>
          <span>purchased releases</span>
          <div className="side-note-line">
            <span style={{ width: `${Math.min(100, purchased ? (purchased / Math.max(1, snapshot.collection.length)) * 100 : 0)}%` }} />
          </div>
        </div>

        {snapshot.demo ? (
          <div className="demo-card">
            <span className="demo-dot" />
            <div>
              <strong>Public demo</strong>
              <span>Connect Bandcamp to load your own library</span>
            </div>
            <button type="button" onClick={() => void doLogout()} className="text-button">
              Sign in
            </button>
          </div>
        ) : null}
      </div>

      <div className="sidebar-foot">
        <div className="storage-card">
          <div className="storage-icon">
            <HardDrive size={17} />
          </div>
          <div className="storage-copy">
            <strong>{formatBytes(offlineBytes)}</strong>
            <span>{offlineEntries.length === 1 ? '1 release offline' : `${offlineEntries.length} releases offline`}</span>
          </div>
        </div>

        <NavLink to="/settings" className={({ isActive }) => cx('nav-item settings-link', isActive && 'is-active')}>
          <Settings size={18} />
          <span>Settings</span>
        </NavLink>

        <div className="user-card">
          <UserAvatar src={snapshot.auth.photoUrl} name={snapshot.auth.displayName ?? username} />
          <button type="button" className="user-copy" onClick={() => navigate('/settings')}>
            <strong>@{username}</strong>
            <span>{snapshot.demo ? 'Demo mode' : 'Bandcamp connected'}</span>
          </button>
          <button type="button" className="icon-button tiny" onClick={() => void doLogout()} title="Sign out of Bandcamp">
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  )
}
