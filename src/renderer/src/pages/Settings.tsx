import { useState, type FormEvent, type ReactElement } from 'react'
import {
  ArrowDownToLine,
  Check,
  ExternalLink,
  FolderOpen,
  Gamepad2,
  HardDrive,
  Info,
  LogOut,
  Palette,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  UserRound
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Accent, DiscordActivityType } from '@shared/types'
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
  const updateLastfm = useApp((state) => state.updateLastfm)
  const connectLastfm = useApp((state) => state.connectLastfm)
  const disconnectLastfm = useApp((state) => state.disconnectLastfm)
  const updateDiscord = useApp((state) => state.updateDiscord)
  const retryIntegrations = useApp((state) => state.retryIntegrations)
  const navigate = useNavigate()
  const stopPlayer = usePlayer((state) => state.stop)
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [clientId, setClientId] = useState('')
  const [connecting, setConnecting] = useState(false)

  if (!snapshot) return <div className="page" />

  const settings = snapshot.settings
  const offline = Object.values(snapshot.offline).filter((entry) => entry.status === 'ready')
  const offlineBytes = offline.reduce((total, entry) => total + entry.bytes, 0)
  const username = snapshot.auth.username ?? 'bandcamp'
  const isDemo = snapshot.demo

  const { lastfm, discord } = snapshot.integrations

  const signOut = async (): Promise<void> => {
    stopPlayer()
    await logout()
    navigate('/')
  }

  const saveLastfm = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const patch: { apiKey?: string; apiSecret?: string } = {}
    if (apiKey.trim()) patch.apiKey = apiKey.trim()
    if (apiSecret.trim()) patch.apiSecret = apiSecret.trim()
    if (!patch.apiKey && !patch.apiSecret) return
    await updateLastfm(patch)
    setApiKey('')
    setApiSecret('')
  }

  const saveDiscord = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const next = clientId.trim()
    if (!next) return
    await updateDiscord({ clientId: next })
    setClientId('')
  }

  const connect = async (): Promise<void> => {
    setConnecting(true)
    try {
      await connectLastfm()
    } finally {
      setConnecting(false)
    }
  }

  const discordStatus = !discord.enabled
    ? 'Off'
    : discord.connected
      ? 'Connected'
      : discord.configured
        ? 'Waiting for Discord'
        : 'Needs an application ID'

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
            <span className="settings-icon"><Radio size={17} /></span>
            <div>
              <h2>Last.fm scrobbling</h2>
              <p>Send the tracks you play to your Last.fm listening history.</p>
            </div>
          </header>
          <SettingToggle
            title="Scrobble plays"
            description="A play counts after half the track or four minutes, whichever comes first."
            checked={lastfm.enabled}
            onChange={(value) => void updateLastfm({ enabled: value })}
          />
          <div className="storage-rows">
            <div>
              <span>Profile</span>
              <strong>{lastfm.connected ? `@${lastfm.username ?? 'connected'}` : 'Not connected'}</strong>
            </div>
            <div>
              <span>Queued scrobbles</span>
              <strong>{lastfm.pending}</strong>
            </div>
          </div>
          <form className="integration-form" onSubmit={(event) => void saveLastfm(event)}>
            <label className="field">
              <span>API key</span>
              <input
                type="text"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={lastfm.configured ? 'Saved — enter a new key to replace it' : 'Last.fm API key'}
                spellCheck={false}
                autoComplete="off"
              />
            </label>
            <label className="field">
              <span>Shared secret</span>
              <input
                type="password"
                value={apiSecret}
                onChange={(event) => setApiSecret(event.target.value)}
                placeholder={lastfm.configured ? 'Saved — enter a new secret to replace it' : 'Last.fm shared secret'}
                autoComplete="off"
              />
            </label>
            <button type="submit" className="button ghost" disabled={!apiKey.trim() && !apiSecret.trim()}>
              Save credentials
            </button>
          </form>
          <div className="settings-actions">
            <button
              type="button"
              className="button primary"
              disabled={!lastfm.configured || connecting}
              onClick={() => void connect()}
            >
              <Radio size={16} />
              {connecting ? 'Waiting for authorisation…' : lastfm.connected ? 'Re-authorise' : 'Connect Last.fm'}
            </button>
            {lastfm.connected ? (
              <button type="button" className="button ghost quiet" onClick={() => void disconnectLastfm()}>
                <LogOut size={16} />
                Disconnect
              </button>
            ) : null}
            {lastfm.pending > 0 ? (
              <button type="button" className="button ghost quiet" onClick={() => void retryIntegrations()}>
                <RefreshCw size={16} />
                Retry queue
              </button>
            ) : null}
            <button
              type="button"
              className="button ghost quiet"
              onClick={() => void window.sideA.library.openExternal('https://www.last.fm/api/account/create')}
            >
              <ExternalLink size={16} />
              Last.fm API
            </button>
          </div>
          {lastfm.error ? <p className="integration-error">{lastfm.error}</p> : null}
          <p className="settings-hint">
            Create a free API account on Last.fm, paste its key and shared secret, then connect to authorise Side A in a
            Last.fm window. The credentials and session are encrypted with the macOS keychain.
          </p>
        </section>

        <section className="settings-card">
          <header className="settings-head">
            <span className="settings-icon"><Gamepad2 size={17} /></span>
            <div>
              <h2>Discord Rich Presence</h2>
              <p>Show the release you are playing on your Discord profile.</p>
            </div>
          </header>
          <SettingToggle
            title="Show what I am playing"
            description="Updates Discord with the track and live progress while Side A plays."
            checked={discord.enabled}
            onChange={(value) => void updateDiscord({ enabled: value })}
          />
          <div className="storage-rows">
            <div><span>Connection</span><strong>{discordStatus}</strong></div>
            <div><span>Application</span><strong>{discord.configured ? 'Saved' : 'Not set'}</strong></div>
          </div>
          <form className="integration-form" onSubmit={(event) => void saveDiscord(event)}>
            <label className="field">
              <span>Application ID</span>
              <input
                type="text"
                inputMode="numeric"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                placeholder={discord.configured ? 'Saved — enter a new ID to replace it' : 'Paste your Discord application ID'}
                spellCheck={false}
                autoComplete="off"
              />
            </label>
            <button type="submit" className="button ghost" disabled={!clientId.trim()}>
              Save application ID
            </button>
          </form>
          <div className="setting-row">
            <div className="setting-copy">
              <strong>Activity type</strong>
              <span>How Discord labels the status line.</span>
            </div>
            <label className="select-wrap compact">
              <select
                value={discord.activityType}
                onChange={(event) => void updateDiscord({ activityType: event.target.value as DiscordActivityType })}
                aria-label="Discord activity type"
              >
                <option value="listening">Listening to</option>
                <option value="playing">Playing</option>
                <option value="watching">Watching</option>
              </select>
            </label>
          </div>
          <SettingToggle
            title="Progress bar"
            description="Show elapsed and remaining time while a track plays."
            checked={discord.showTimestamps}
            onChange={(value) => void updateDiscord({ showTimestamps: value })}
          />
          <SettingToggle
            title="Release button"
            description="Add a “Listen on Bandcamp” button when the release has a link."
            checked={discord.showButton}
            onChange={(value) => void updateDiscord({ showButton: value })}
          />
          <div className="integration-form">
            <label className="field">
              <span>Title line</span>
              <input
                key={`details-${discord.detailsTemplate}`}
                defaultValue={discord.detailsTemplate}
                onBlur={(event) => void updateDiscord({ detailsTemplate: event.target.value })}
                spellCheck={false}
                autoComplete="off"
              />
            </label>
            <label className="field">
              <span>Subtitle line</span>
              <input
                key={`state-${discord.stateTemplate}`}
                defaultValue={discord.stateTemplate}
                onBlur={(event) => void updateDiscord({ stateTemplate: event.target.value })}
                spellCheck={false}
                autoComplete="off"
              />
            </label>
            <p className="settings-hint">
              Tokens: <code>{'{title}'}</code>, <code>{'{artist}'}</code>, <code>{'{album}'}</code> and{' '}
              <code>{'{band}'}</code>. Lines save when you leave the field.
            </p>
          </div>
          {discord.error ? <p className="integration-error">{discord.error}</p> : null}
          <p className="settings-hint">
            Create an application at Discord's developer portal and copy its Application ID. The Discord desktop app must
            be running; artwork is sent as a Bandcamp image URL, so no assets need uploading.
          </p>
          <div className="settings-actions">
            <button
              type="button"
              className="button ghost quiet"
              onClick={() => void window.sideA.library.openExternal('https://discord.com/developers/applications')}
            >
              <ExternalLink size={16} />
              Discord developers
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
