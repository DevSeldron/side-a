import type { ReactElement } from 'react'
import {
  ArrowDownToLine,
  Check,
  ExternalLink,
  FolderOpen,
  HardDrive,
  Info,
  LogOut,
  Palette,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  UserRound
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Accent } from '@shared/types'
import { useApp } from '../store/app'
import { usePlayer } from '../store/player'
import { PageIntro } from '../components/Page'
import { cx, formatBytes, initials, shortPath } from '../lib/format'

const ACCENTS: Array<{ id: Accent; label: string; color: string }> = [
  { id: 'teal', label: 'Teal', color: '#66e0cc' },
  { id: 'ember', label: 'Ember', color: '#ff8a5c' },
  { id: 'violet', label: 'Violet', color: '#b39cff' }
]

const FORMATS = [
  { id: 'flac', label: 'FLAC (lossless)' },
  { id: 'flac-24', label: 'FLAC 24-bit' },
  { id: 'wav', label: 'WAV' },
  { id: 'aiff', label: 'AIFF' },
  { id: 'alac', label: 'ALAC' },
  { id: 'mp3-v0', label: 'MP3 V0' },
  { id: 'mp3-320', label: 'MP3 320' },
  { id: 'ogg', label: 'Ogg Vorbis' }
]

export function Settings(): ReactElement {
  const snapshot = useApp((state) => state.snapshot)
  const updateSettings = useApp((state) => state.updateSettings)
  const chooseDownloadDir = useApp((state) => state.chooseDownloadDir)
  const clearCaches = useApp((state) => state.clearCaches)
  const saveAllPurchased = useApp((state) => state.saveAllPurchased)
  const login = useApp((state) => state.login)
  const logout = useApp((state) => state.logout)
  const startDemo = useApp((state) => state.startDemo)
  const navigate = useNavigate()
  const stopPlayer = usePlayer((state) => state.stop)

  if (!snapshot) return <div className="page" />

  const settings = snapshot.settings
  const offline = Object.values(snapshot.offline).filter((entry) => entry.status === 'ready')
  const offlineBytes = offline.reduce((total, entry) => total + entry.bytes, 0)
  const username = snapshot.auth.username ?? 'bandcamp'
  const isDemo = snapshot.demo

  const signOut = async (): Promise<void> => {
    stopPlayer()
    await logout()
    navigate('/')
  }

  return (
    <div className="page settings-page">
      <PageIntro
        kicker="Side A"
        title="Settings"
        description="Account, appearance, downloads and local data. Everything here stays on this Mac."
      />

      <div className="settings-grid">
        <section className="settings-card">
          <header className="settings-head">
            <span className="settings-icon"><UserRound size={17} /></span>
            <div>
              <h2>Account</h2>
              <p>Your Bandcamp session is stored in an isolated app profile.</p>
            </div>
          </header>
          <div className="account-row">
            <div className="avatar large">{initials(snapshot.auth.displayName ?? username)}</div>
            <div className="account-copy">
              <strong>{snapshot.auth.displayName ?? `@${username}`}</strong>
              <span>
                @{username} · {isDemo ? 'Public demo' : 'Bandcamp connected'}
              </span>
            </div>
            <span className={cx('status-dot', isDemo ? 'is-demo' : 'is-live')}>
              <i />
              {isDemo ? 'Demo' : 'Live'}
            </span>
          </div>
          <div className="settings-actions">
            {isDemo ? (
              <button type="button" className="button primary" onClick={() => void login()}>
                <ShieldCheck size={16} />
                Connect my Bandcamp
              </button>
            ) : (
              <button type="button" className="button ghost" onClick={() => void login()}>
                <RefreshCw size={16} />
                Re-authenticate
              </button>
            )}
            {!isDemo ? (
              <button type="button" className="button ghost quiet" onClick={() => void signOut()}>
                <LogOut size={16} />
                Sign out
              </button>
            ) : (
              <button type="button" className="button ghost quiet" onClick={() => void startDemo()}>
                <Sparkles size={16} />
                Reload demo
              </button>
            )}
          </div>
        </section>

        <section className="settings-card">
          <header className="settings-head">
            <span className="settings-icon"><Palette size={17} /></span>
            <div>
              <h2>Appearance</h2>
              <p>A dark room for music. Pick the accent that suits your desk.</p>
            </div>
          </header>
          <div className="accent-row">
            {ACCENTS.map((accent) => (
              <button
                type="button"
                key={accent.id}
                className={cx('accent-choice', settings.accent === accent.id && 'is-active')}
                onClick={() => void updateSettings({ accent: accent.id })}
              >
                <span className="accent-swatch" style={{ background: accent.color }} />
                {accent.label}
                {settings.accent === accent.id ? <Check size={14} /> : null}
              </button>
            ))}
          </div>
          <SettingToggle
            title="Reduce motion"
            description="Tone down transitions and artwork movement."
            checked={settings.reduceMotion}
            onChange={(value) => void updateSettings({ reduceMotion: value })}
          />
        </section>

        <section className="settings-card">
          <header className="settings-head">
            <span className="settings-icon"><Sliders size={17} /></span>
            <div>
              <h2>Library</h2>
              <p>How Side A fetches and prepares your music.</p>
            </div>
          </header>
          <SettingToggle
            title="Pre-fetch release details"
            description="Warm the tracklist cache after each sync for faster playback."
            checked={settings.prefetchDetails}
            onChange={(value) => void updateSettings({ prefetchDetails: value })}
          />
          <div className="setting-row">
            <div className="setting-copy">
              <strong>Default purchase format</strong>
              <span>Preselected when a purchase offers this format.</span>
            </div>
            <label className="select-wrap compact">
              <select
                value={settings.purchaseFormat}
                onChange={(event) => void updateSettings({ purchaseFormat: event.target.value })}
                aria-label="Default purchase format"
              >
                {FORMATS.map((format) => (
                  <option key={format.id} value={format.id}>{format.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="settings-actions">
            <button type="button" className="button ghost" onClick={() => void saveAllPurchased()}>
              <ArrowDownToLine size={16} />
              Save all purchases offline
            </button>
          </div>
        </section>

        <section className="settings-card">
          <header className="settings-head">
            <span className="settings-icon"><FolderOpen size={17} /></span>
            <div>
              <h2>Downloads</h2>
              <p>Where original Bandcamp files are saved.</p>
            </div>
          </header>
          <div className="folder-row">
            <code title={settings.downloadDir}>{shortPath(settings.downloadDir, 48)}</code>
            <button type="button" className="button small ghost" onClick={() => void chooseDownloadDir()}>Choose…</button>
          </div>
          <p className="settings-hint">
            The folder is created automatically. Existing files with the same name get a numbered suffix instead of being overwritten.
          </p>
        </section>

        <section className="settings-card">
          <header className="settings-head">
            <span className="settings-icon"><HardDrive size={17} /></span>
            <div>
              <h2>Storage & data</h2>
              <p>Local copies, session caches and app data.</p>
            </div>
          </header>
          <div className="storage-rows">
            <div><span>Offline releases</span><strong>{offline.length}</strong></div>
            <div><span>Offline audio</span><strong>{formatBytes(offlineBytes)}</strong></div>
            <div><span>Release detail cache</span><strong>{Object.keys(snapshot.details).length} releases</strong></div>
          </div>
          <div className="settings-actions">
            <button type="button" className="button ghost" onClick={() => void window.sideA.offline.openFolder()}>
              <FolderOpen size={16} />
              Open offline folder
            </button>
            <button type="button" className="button ghost quiet" onClick={() => void clearCaches()}>
              <Trash2 size={16} />
              Clear caches
            </button>
          </div>
          <p className="settings-hint">
            Clearing caches removes cached release details and artwork, never your offline music or downloaded purchases.
          </p>
        </section>

        <section className="settings-card about-card">
          <header className="settings-head">
            <span className="settings-icon"><Info size={17} /></span>
            <div>
              <h2>About Side A</h2>
              <p>A personal Bandcamp client for macOS.</p>
            </div>
          </header>
          <div className="storage-rows">
            <div><span>Version</span><strong>{snapshot.appVersion}</strong></div>
            <div><span>Platform</span><strong>macOS · arm64</strong></div>
            <div><span>Session</span><strong>Local only</strong></div>
          </div>
          <div className="settings-actions">
            <button type="button" className="button ghost" onClick={() => void window.sideA.library.openExternal('https://bandcamp.com/help')}>
              <ExternalLink size={16} />
              Bandcamp help
            </button>
            <button type="button" className="button ghost" onClick={() => void window.sideA.library.openExternal('https://bandcamp.com')}>
              <ExternalLink size={16} />
              bandcamp.com
            </button>
          </div>
          <p className="settings-hint">
            Side A is an independent player and is not affiliated with Bandcamp. Your purchases belong to you; Bandcamp owns the
            platform.
          </p>
        </section>
      </div>
    </div>
  )
}

function SettingToggle({
  title,
  description,
  checked,
  onChange
}: {
  title: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}): ReactElement {
  return (
    <div className="setting-row">
      <div className="setting-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <button
        type="button"
        className={cx('switch', checked && 'is-on')}
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  )
}
