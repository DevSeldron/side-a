import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useApp } from './store/app'
import { playerBeatLevel, usePlayer } from './store/player'
import { localBeatLevel, useLocalPlayer } from './store/localPlayer'
import { startIntegrations } from './lib/integrations'
import { useAudioFocus } from './lib/audioFocus'
import {
  applyBackgroundGradient,
  applyCoverBackdrop,
  applyMountainBackdrop,
  applySolidBlack,
  applyTheme,
  resetAccentVars,
  FALLBACK_ACCENT
} from './lib/theme'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { PlayerBar, PlayerSpacer } from './components/PlayerBar'
import { LocalPlayerBar } from './components/LocalPlayerBar'
import { LocalNowPlaying } from './components/LocalNowPlaying'
import { NowPlaying } from './components/NowPlaying'
import { CommandPalette } from './components/CommandPalette'
import { Toasts } from './components/Toasts'
import { WhatsNew } from './components/WhatsNew'
import { MountainBackdrop } from './components/MountainBackdrop'
import { CoverBackdrop } from './components/CoverBackdrop'
import { Welcome } from './pages/Welcome'
import { Collection } from './pages/Collection'
import { Wishlist } from './pages/Wishlist'
import { Liked } from './pages/Liked'
import { AlbumPage } from './pages/Album'
import { Offline } from './pages/Offline'
import { Downloads } from './pages/Downloads'
import { Discover } from './pages/Discover'
import { Settings } from './pages/Settings'
import { Local } from './pages/Local'

export default function App(): ReactElement {
  const init = useApp((state) => state.init)
  const initPlayer = usePlayer((state) => state.init)
  const initLocalPlayer = useLocalPlayer((state) => state.init)
  const ready = useApp((state) => state.ready)
  const loadingError = useApp((state) => state.loadingError)
  const snapshot = useApp((state) => state.snapshot)
  const setPaletteOpen = useApp((state) => state.setPaletteOpen)
  const track = usePlayer((state) => state.queue[state.index])
  const localTrack = useLocalPlayer((state) => state.queue[state.index])
  const audioSource = useAudioFocus((state) => state.source)
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [location.key])

  useEffect(() => {
    void init()
    initPlayer()
    initLocalPlayer()
    startIntegrations()
  }, [init, initPlayer, initLocalPlayer])

  useEffect(() => {
    document.documentElement.dataset.platform = window.sideA.platform
  }, [])

  const accent = snapshot?.settings.accent ?? FALLBACK_ACCENT
  const theme = snapshot?.settings.theme ?? 'dark'
  const rainbow = snapshot?.settings.rainbow ?? false
  const coverTheme = snapshot?.settings.coverTheme ?? false
  const backgroundGradient = snapshot?.settings.backgroundGradient ?? false
  const gradientPosition = snapshot?.settings.gradientPosition ?? 'bottom'
  // The mountains are drawn for the blurred themes only, so a plain dark or
  // light room never picks up a sky it has no glass to show through.
  const mountainBackdrop =
    (snapshot?.settings.mountainBackdrop ?? false) && (theme === 'blurred-dark' || theme === 'blurred-light')
  const coverBackdrop = snapshot?.settings.coverBackdrop ?? false
  const solidBlack = snapshot?.settings.solidBlack ?? false
  const reduceMotion = snapshot?.settings.reduceMotion ?? false
  const beatGlow = snapshot?.settings.beatGlow ?? false
  const [coverAccent, setCoverAccent] = useState<string | null>(null)
  const coverUrl = track?.coverUrl ?? ''
  // The backdrop follows whichever player owns the audio, so local files show
  // their own artwork rather than the last streamed release.
  const backdropCover = (audioSource === 'local' ? localTrack?.coverUrl : track?.coverUrl) ?? ''

  useEffect(() => {
    if (!coverTheme || !coverUrl) {
      setCoverAccent(null)
      return
    }
    let active = true
    setCoverAccent(null)
    void window.sideA.artwork
      .accent(coverUrl)
      .then((colour) => {
        if (active) setCoverAccent(colour)
      })
      .catch(() => {
        if (active) setCoverAccent(null)
      })
    return () => {
      active = false
    }
  }, [coverTheme, coverUrl])

  useEffect(() => {
    applyBackgroundGradient(backgroundGradient, gradientPosition)
  }, [backgroundGradient, gradientPosition])

  useEffect(() => {
    applyMountainBackdrop(mountainBackdrop)
  }, [mountainBackdrop])

  useEffect(() => {
    applyCoverBackdrop(coverBackdrop)
  }, [coverBackdrop])

  useEffect(() => {
    applySolidBlack(solidBlack)
  }, [solidBlack])

  useEffect(() => {
    const root = document.documentElement
    if (!beatGlow || reduceMotion) {
      delete root.dataset.beat
      root.style.setProperty('--beat', '0')
      return
    }
    root.dataset.beat = 'true'
    let frame = 0
    let smooth = 0
    let accent: [number, number, number] = [102, 224, 204]
    let ticks = 0
    const tick = (): void => {
      // Follow whichever player owns the audio, so local files pulse too.
      const local = useAudioFocus.getState().source === 'local'
      const playing = local ? useLocalPlayer.getState().playing : usePlayer.getState().playing
      const level = playing ? (local ? localBeatLevel() : playerBeatLevel()) : 0
      // Quick but softened attack, longer release: kicks land, fades stay silky.
      smooth += (level - smooth) * (level > smooth ? 0.7 : 0.25)
      // Rainbow themes move the accent, so refresh it a few times a second.
      if (ticks % 20 === 0) {
        const raw = getComputedStyle(root).getPropertyValue('--accent-rgb')
        const parts = raw.split(',').map((part) => Number(part.trim()))
        accent = [parts[0] ?? 102, parts[1] ?? 224, parts[2] ?? 204]
      }
      ticks += 1
      const target = root.dataset.theme === 'light' ? 0 : 255
      // Light rooms deepen the accent so the pulse stays visible, dark rooms
      // lift it. Only the glow colour moves, text keeps its own contrast.
      const mix = Math.min(0.55, 0.02 + smooth * 0.53)
      const rgb = accent.map((channel) => Math.round(channel + (target - channel) * mix))
      const channels = rgb.join(', ')
      root.style.setProperty('--beat-rgb', channels)
      root.style.setProperty('--beat', smooth.toFixed(3))
      // Drive the same tokens every accent surface already reads, so the whole
      // room pulses: text, tints, borders, glows and focus rings together.
      root.style.setProperty('--accent-text', `rgb(${channels})`)
      root.style.setProperty('--accent-soft', `rgba(${channels}, ${(0.14 + smooth * 0.1).toFixed(3)})`)
      root.style.setProperty('--accent-line', `rgba(${channels}, ${(0.36 + smooth * 0.22).toFixed(3)})`)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      delete root.dataset.beat
      root.style.setProperty('--beat', '0')
      resetAccentVars()
    }
  }, [beatGlow, reduceMotion])

  useEffect(() => {
    applyTheme(coverTheme && coverAccent ? coverAccent : accent, theme, rainbow)
  }, [accent, coverAccent, coverTheme, theme, rainbow])

  useEffect(() => {
    document.documentElement.dataset.motion = reduceMotion ? 'reduced' : 'full'
  }, [reduceMotion])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPaletteOpen])

  // The window opens straight into the app, with no intro to sit through.
  if (!ready) return <></>

  if (loadingError) {
    return (
      <div className="splash">
        <div className="splash-inner is-error">
          <span className="splash-icon"><AlertTriangle size={26} /></span>
          <h1>Side A could not start</h1>
          <p>{loadingError}</p>
          <button type="button" className="button primary" onClick={() => window.location.reload()}>
            <RefreshCw size={16} />
            Reload app
          </button>
        </div>
      </div>
    )
  }

  const authenticated = snapshot?.auth.status === 'signed-in' || snapshot?.auth.status === 'demo'

  if (!authenticated) {
    return (
      <>
        <Welcome />
        <Toasts />
      </>
    )
  }

  return (
    <div className="app-shell">
      <MountainBackdrop />
      {coverBackdrop ? <CoverBackdrop url={backdropCover} /> : null}
      <Sidebar />
      <div className="app-body">
        <TopBar />
        <main ref={mainRef} className="app-main">
          <Routes>
            <Route path="/" element={<Collection />} />
            <Route path="/wishlist" element={<Wishlist />} />
            <Route path="/liked" element={<Liked />} />
            <Route path="/album/:key" element={<AlbumPage />} />
            <Route path="/offline" element={<Offline />} />
            <Route path="/downloads" element={<Downloads />} />
            <Route path="/local" element={<Local />} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <PlayerSpacer />
        </main>
      </div>
      {audioSource === 'local' ? <LocalPlayerBar /> : <PlayerBar />}
      <NowPlaying />
      <LocalNowPlaying />
      <CommandPalette />
      <WhatsNew />
      <Toasts />
    </div>
  )
}
