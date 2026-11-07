import { useRef, useState, type FormEvent, type ReactElement, type ReactNode } from 'react'
import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  ExternalLink,
  FolderOpen,
  Gamepad2,
  HardDrive,
  Info,
  Loader2,
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
import type { DiscordActivityType } from '@shared/types'
import { ACCENT_PRESETS } from '../lib/theme'
import { useApp } from '../store/app'
import { usePlayer } from '../store/player'
import { PageIntro } from '../components/Page'
import { UserAvatar } from '../components/UserAvatar'
import { cx, formatBytes, shortPath } from '../lib/format'

const THEMES = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'blurred-dark', label: 'Blurred Dark' },
  { id: 'blurred-light', label: 'Blurred Light' }
] as const

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
  const checkUpdate = useApp((state) => state.checkUpdate)
  const updateState = useApp((state) => state.updateState)
  const pushToast = useApp((state) => state.pushToast)
  const navigate = useNavigate()
  const stopPlayer = usePlayer((state) => state.stop)
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [clientId, setClientId] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const unlockTaps = useRef(0)
  const unlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  if (!snapshot) return <div className="page" />

  const settings = snapshot.settings
  const blurredTheme = settings.theme === 'blurred-dark' || settings.theme === 'blurred-light'
  const offline = Object.values(snapshot.offline).filter((entry) => entry.status === 'ready')
  const offlineBytes = offline.reduce((total, entry) => total + entry.bytes, 0)
  const username = snapshot.auth.username ?? 'bandcamp'
  const isDemo = snapshot.demo

  const { lastfm, discord } = snapshot.integrations
  const customisationCount = [
    settings.coverTheme,
    settings.rainbow,
    settings.backgroundGradient,
    settings.mountainBackdrop,
    settings.coverBackdrop,
    settings.solidBlack,
    settings.beatGlow
  ].filter(Boolean).length

  const chooseAccent = (value: string): void => {
    void updateSettings({ accent: value, rainbow: false, coverTheme: false })
  }

  const toggleCoverTheme = (value: boolean): void => {
    void updateSettings({ coverTheme: value, ...(value ? { rainbow: false } : {}) })
  }

  const toggleRainbow = (value: boolean): void => {
    void updateSettings({ rainbow: value, ...(value ? { coverTheme: false } : {}) })
  }

  // The canvas only has room for one backdrop, so turning one on clears the rest.
  const toggleBackgroundGradient = (value: boolean): void => {
    void updateSettings({
      backgroundGradient: value,
      ...(value ? { mountainBackdrop: false, coverBackdrop: false, solidBlack: false } : {})
    })
  }

  const toggleMountainBackdrop = (value: boolean): void => {
    void updateSettings({
      mountainBackdrop: value,
      ...(value ? { backgroundGradient: false, coverBackdrop: false, solidBlack: false } : {})
    })
  }

  const toggleCoverBackdrop = (value: boolean): void => {
    void updateSettings({
      coverBackdrop: value,
      ...(value ? { backgroundGradient: false, mountainBackdrop: false, solidBlack: false } : {})
    })
  }

  const toggleSolidBlack = (value: boolean): void => {
    void updateSettings({
      solidBlack: value,
      ...(value ? { backgroundGradient: false, mountainBackdrop: false, coverBackdrop: false } : {})
    })
  }

  const tapAppearance = (): void => {
    if (settings.rainbowUnlocked) return
    unlockTaps.current += 1
    if (unlockTimer.current) clearTimeout(unlockTimer.current)
    unlockTimer.current = setTimeout(() => {
      unlockTaps.current = 0
    }, 900)
    if (unlockTaps.current < 3) return
    unlockTaps.current = 0
    if (unlockTimer.current) clearTimeout(unlockTimer.current)
    void updateSettings({ rainbowUnlocked: true })
    pushToast('Rainbow theme unlocked', {
      description: 'A new toggle is available in Appearance',
      tone: 'success'
    })
  }

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

  const runUpdateCheck = async (): Promise<void> => {
    setCheckingUpdate(true)
    try {
      const info = await checkUpdate()
      pushToast(info.available ? `Side A ${info.version} is available` : 'Side A is up to date', {
        description: info.available
          ? 'Use the update pill in the top bar to download it'
          : `Running ${snapshot.appVersion}`,
        tone: info.available ? 'info' : 'success'
      })
    } finally {
      setCheckingUpdate(false)
    }
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
        title="Settings"
        description="Account, appearance, downloads and local data"
      />

      <div className="settings-grid">
        <h2 className="settings-group-title">Account</h2>
        <section className="settings-card">
          <header className="settings-head">
            <span className="settings-icon"><UserRound size={17} /></span>
            <div>
              <h2>Account</h2>
              <p>Bandcamp session stored in an isolated app profile</p>
            </div>
          </header>
          <div className="account-row">
            <UserAvatar className="large" src={snapshot.auth.photoUrl} name={snapshot.auth.displayName ?? username} />
            <div className="account-copy">
              <strong>{snapshot.auth.displayName ?? `@${username}`}</strong>
              <span>
                @{username} / {isDemo ? 'Public demo' : 'Bandcamp connected'}
              </span>
            </div>
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

        <h2 className="settings-group-title">Appearance</h2>
        <section className="settings-card">
          <header className="settings-head">
            <span className="settings-icon" onClick={tapAppearance}><Palette size={17} /></span>
            <div>
              <h2>Appearance</h2>
              <p>Dark, light, or a blurred version of either with a custom accent colour</p>
            </div>
          </header>
          <div className="theme-row">
            {THEMES.map((mode) => (
              <button
                type="button"
                key={mode.id}
                className={cx('theme-choice', settings.theme === mode.id && 'is-active')}
                aria-pressed={settings.theme === mode.id}
                onClick={() => {
                  // The mountain backdrop is drawn for the blurred themes only, so
                  // leaving them clears it instead of leaving a dead toggle on.
                  void updateSettings({
                    theme: mode.id,
                    ...(mode.id.startsWith('blurred') ? {} : { mountainBackdrop: false })
                  })
                }}
              >
                <span className={cx('theme-preview', `is-${mode.id}`)} />
                <span className="theme-choice-label">{mode.label}</span>
                {settings.theme === mode.id ? <Check size={14} /> : null}
              </button>
            ))}
          </div>
          <div className="accent-picker">
            <label className="accent-custom">
              <input
                type="color"
                value={settings.accent}
                aria-label="Custom accent colour"
                onChange={(event) => chooseAccent(event.target.value)}
              />
              <span className="accent-swatch large" style={{ background: settings.accent }} />
              <span className="accent-custom-copy">
                <strong>Custom accent</strong>
                <span>{settings.accent.toUpperCase()}</span>
              </span>
              <span className="accent-custom-hint">Pick</span>
            </label>
          </div>
          <div className="accent-row">
            {ACCENT_PRESETS.map((accent) => (
              <button
                type="button"
                key={accent.value}
                className={cx('accent-choice', settings.accent.toLowerCase() === accent.value && 'is-active')}
                onClick={() => chooseAccent(accent.value)}
              >
                <span className="accent-swatch" style={{ background: accent.value }} />
                {accent.name}
                {settings.accent.toLowerCase() === accent.value ? <Check size={14} /> : null}
              </button>
            ))}
          </div>
          <Collapsible
            title="Customisation"
            summary={
              customisationCount
                ? `${customisationCount} of 7 options on`
                : 'Backdrops, motion and theme extras'
            }
          >
          <SettingToggle
            title="Match cover art"
            description="Use the artwork of the current release for the accent colour"
            checked={settings.coverTheme}
            onChange={toggleCoverTheme}
          />
          {settings.rainbowUnlocked || settings.rainbow ? (
            <SettingToggle
              title="Rainbow theme"
              description="Cycle every accent colour, choosing an accent turns it off"
              checked={settings.rainbow}
              onChange={toggleRainbow}
            />
          ) : null}
          <SettingToggle
            title="Background gradient"
            description="Fade the background from gray into your accent colour, light mode starts at white"
            checked={settings.backgroundGradient}
            onChange={toggleBackgroundGradient}
          />
          {settings.backgroundGradient ? (
            <div className="gradient-choices">
              {(['top', 'bottom'] as const).map((position) => (
                <button
                  type="button"
                  key={position}
                  className={cx('gradient-choice', settings.gradientPosition === position && 'is-active')}
                  aria-pressed={settings.gradientPosition === position}
                  onClick={() => void updateSettings({ gradientPosition: position })}
                >
                  <span className={cx('gradient-choice-preview', `is-${position}`)} />
                  {position === 'top' ? 'Accent on top' : 'Accent at bottom'}
                  {settings.gradientPosition === position ? <Check size={14} /> : null}
                </button>
              ))}
            </div>
          ) : null}
          <SettingToggle
            title="Mountain backdrop"
            description={
              blurredTheme
                ? 'A starry sky over simplified mountains in your accent colour'
                : 'Only available with Blurred Dark or Blurred Light'
            }
            checked={settings.mountainBackdrop}
            onChange={toggleMountainBackdrop}
            disabled={!blurredTheme}
          />
          <SettingToggle
            title="Album cover backdrop"
            description="Blur the playing release's artwork into the background at a low opacity"
            checked={settings.coverBackdrop}
            onChange={toggleCoverBackdrop}
          />
          <SettingToggle
            title="Solid black background"
            description="Drop the gray canvas for a flat black room, other backdrops are hidden"
            checked={settings.solidBlack}
            onChange={toggleSolidBlack}
          />
          <SettingToggle
            title="Beat colour"
            description="Shift the accent lighter and darker with the bass of the track, light rooms deepen it automatically so it stays readable"
            checked={settings.beatGlow}
            onChange={(value) => void updateSettings({ beatGlow: value })}
          />
          </Collapsible>
          <SettingToggle
            title="Reduce motion"
            description="Tone down transitions, backdrop drift and artwork movement"
            checked={settings.reduceMotion}
            onChange={(value) => void updateSettings({ reduceMotion: value })}
          />
        </section>

        <section className="settings-card">
          <header className="settings-head">
            <span className="settings-icon"><Sliders size={17} /></span>
            <div>
              <h2>Library</h2>
              <p>How Side A fetches and prepares your music</p>
            </div>
          </header>
          <SettingToggle
            title="Pre-fetch release details"
            description="Warm the tracklist cache after each sync for faster playback"
            checked={settings.prefetchDetails}
            onChange={(value) => void updateSettings({ prefetchDetails: value })}
          />
          <div className="setting-row">
            <div className="setting-copy">
              <strong>Default purchase format</strong>
              <span>Preselected when a purchase offers this format</span>
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
          <div className="setting-row">
            <div className="setting-copy">
              <strong>Updates</strong>
              <span>
                Side A {snapshot.appVersion} / updates download and install in the background
                {updateState?.message ? ` / ${updateState.message}` : ''}
              </span>
            </div>
            <button type="button" className="button ghost" onClick={() => void runUpdateCheck()} disabled={checkingUpdate}>
              {checkingUpdate ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
              Check for updates
            </button>
          </div>
          <div className="settings-actions">
            <button type="button" className="button ghost" onClick={() => void saveAllPurchased()}>
              <ArrowDownToLine size={16} />
              Save all purchases offline
            </button>
          </div>
        </section>

        <h2 className="settings-group-title">Connections</h2>
        <section className="settings-card">
          <header className="settings-head">
            <span className="settings-icon"><Radio size={17} /></span>
            <div>
              <h2>Last.fm scrobbling</h2>
              <p>Send the tracks you play to your Last.fm listening history</p>
            </div>
          </header>
          <SettingToggle
            title="Scrobble plays"
            description="A play counts after half the track or four minutes, whichever comes first"
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
                placeholder={lastfm.configured ? 'Saved, enter a new key to replace it' : 'Last.fm API key'}
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
                placeholder={lastfm.configured ? 'Saved, enter a new secret to replace it' : 'Last.fm shared secret'}
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
              {connecting ? 'Waiting for authorisation' : lastfm.connected ? 'Re-authorise' : 'Connect Last.fm'}
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
            Last.fm window, credentials and session are encrypted with your operating system's credential store
          </p>
        </section>

        <section className="settings-card">
          <header className="settings-head">
            <span className="settings-icon"><Gamepad2 size={17} /></span>
            <div>
              <h2>Discord Rich Presence</h2>
              <p>Show the release you are playing on your Discord profile</p>
            </div>
          </header>
          <SettingToggle
            title="Show what I am playing"
            description="Updates Discord with the track and live progress while Side A plays"
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
                placeholder={discord.configured ? 'Saved, enter a new ID to replace it' : 'Paste your Discord application ID'}
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
              <span>How Discord labels the status line</span>
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
            description="Show elapsed and remaining time while a track plays"
            checked={discord.showTimestamps}
            onChange={(value) => void updateDiscord({ showTimestamps: value })}
          />
          <SettingToggle
            title="Release button"
            description="Add a “Listen on Bandcamp” button when the release has a link"
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
              <code>{'{band}'}</code>, lines save when you leave the field
            </p>
          </div>
          {discord.error ? <p className="integration-error">{discord.error}</p> : null}
          <p className="settings-hint">
            Create an application at Discord's developer portal and copy its Application ID, the Discord desktop app must
            be running, artwork is sent as a Bandcamp image URL, so no assets need uploading
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

        <h2 className="settings-group-title">Files &amp; storage</h2>
        <section className="settings-card">
          <header className="settings-head">
            <span className="settings-icon"><FolderOpen size={17} /></span>
            <div>
              <h2>Downloads</h2>
              <p>Where tracks and purchased files are saved</p>
            </div>
          </header>
          <div className="setting-row">
            <div className="setting-copy">
              <strong>Track download quality</strong>
              <span>Used by the download button on each track, if Bandcamp only offers a lower rendition, Side A saves that and notes it</span>
            </div>
            <label className="select-wrap compact">
              <select
                value={settings.trackQuality}
                onChange={(event) => void updateSettings({ trackQuality: event.target.value as 'mp3-128' | 'mp3-v0' | 'mp3-320' })}
                aria-label="Track download quality"
              >
                <option value="mp3-128">MP3 128</option>
                <option value="mp3-v0">MP3 V0</option>
                <option value="mp3-320">MP3 320</option>
              </select>
            </label>
          </div>
          <div className="folder-row">
            <code title={settings.downloadDir}>{shortPath(settings.downloadDir, 48)}</code>
            <button type="button" className="button small ghost" onClick={() => void chooseDownloadDir()}>Choose</button>
          </div>
          <p className="settings-hint">
            The folder is created automatically, existing files with the same name get a numbered suffix instead of being overwritten,
            while purchased releases still use the Formats page, which can fetch FLAC and other lossless files
          </p>
        </section>

        <section className="settings-card">
          <header className="settings-head">
            <span className="settings-icon"><HardDrive size={17} /></span>
            <div>
              <h2>Storage & data</h2>
              <p>Local copies, session caches and app data</p>
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
            Clearing caches removes cached release details and artwork, never your offline music or downloaded purchases
          </p>
        </section>

        <h2 className="settings-group-title">About</h2>
        <section className="settings-card about-card">
          <header className="settings-head">
            <span className="settings-icon"><Info size={17} /></span>
            <div>
              <h2>About Side A</h2>
              <p>A personal Bandcamp client</p>
            </div>
          </header>
          <div className="storage-rows">
            <div><span>Version</span><strong>{snapshot.appVersion}</strong></div>
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
            Side A is an independent player and is not affiliated with Bandcamp, your purchases belong to you, Bandcamp owns the
            platform
          </p>
        </section>
      </div>
    </div>
  )
}

function Collapsible({
  title,
  summary,
  children
}: {
  title: string
  summary: string
  children: ReactNode
}): ReactElement {
  const [open, setOpen] = useState(false)
  return (
    <div className={cx('settings-collapse', open && 'is-open')}>
      <button
        type="button"
        className="settings-collapse-trigger"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="settings-collapse-copy">
          <strong className="settings-collapse-title">{title}</strong>
          <span className="settings-collapse-summary">{summary}</span>
        </span>
        <ChevronDown size={16} className="settings-collapse-chevron" />
      </button>
      <div className={cx('settings-collapse-body', open && 'is-open')}>
        <div className="settings-collapse-inner">{children}</div>
      </div>
    </div>
  )
}

function SettingToggle({
  title,
  description,
  checked,
  onChange,
  disabled = false
}: {
  title: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}): ReactElement {
  return (
    <div className={cx('setting-row', disabled && 'is-disabled')}>
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
        disabled={disabled}
        aria-disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  )
}
