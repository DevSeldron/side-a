import { useEffect, useState, type ReactElement } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useApp } from './store/app'
import { usePlayer } from './store/player'
import { startIntegrations } from './lib/integrations'
import { applyBackgroundGradient, applyMountainBackdrop, applyTheme, FALLBACK_ACCENT } from './lib/theme'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { PlayerBar, PlayerSpacer } from './components/PlayerBar'
import { NowPlaying } from './components/NowPlaying'
import { CommandPalette } from './components/CommandPalette'
import { Toasts } from './components/Toasts'
import { Brand } from './components/Brand'
import { MountainBackdrop } from './components/MountainBackdrop'
import { Welcome } from './pages/Welcome'
import { Collection } from './pages/Collection'
import { Wishlist } from './pages/Wishlist'
import { AlbumPage } from './pages/Album'
import { Offline } from './pages/Offline'
import { Downloads } from './pages/Downloads'
import { Discover } from './pages/Discover'
import { Settings } from './pages/Settings'

export default function App(): ReactElement {
  const init = useApp((state) => state.init)
  const initPlayer = usePlayer((state) => state.init)
  const ready = useApp((state) => state.ready)
  const loadingError = useApp((state) => state.loadingError)
  const snapshot = useApp((state) => state.snapshot)
  const setPaletteOpen = useApp((state) => state.setPaletteOpen)
  const track = usePlayer((state) => state.queue[state.index])

  useEffect(() => {
    void init()
    initPlayer()
    startIntegrations()
  }, [init, initPlayer])

  useEffect(() => {
    document.documentElement.dataset.platform = window.sideA.platform
  }, [])

  const accent = snapshot?.settings.accent ?? FALLBACK_ACCENT
  const theme = snapshot?.settings.theme ?? 'dark'
  const rainbow = snapshot?.settings.rainbow ?? false
  const coverTheme = snapshot?.settings.coverTheme ?? false
  const backgroundGradient = snapshot?.settings.backgroundGradient ?? false
  const gradientPosition = snapshot?.settings.gradientPosition ?? 'bottom'
  const mountainBackdrop = snapshot?.settings.mountainBackdrop ?? false
  const reduceMotion = snapshot?.settings.reduceMotion ?? false
  const [coverAccent, setCoverAccent] = useState<string | null>(null)
  const coverUrl = track?.coverUrl ?? ''

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

  if (!ready) {
    return (
      <div className="splash">
        <div className="splash-inner">
          <Brand />
          <div className="splash-loader">
            <span />
          </div>
          <p>Finding your records</p>
        </div>
      </div>
    )
  }

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
      <Sidebar />
      <div className="app-body">
        <TopBar />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Collection />} />
            <Route path="/wishlist" element={<Wishlist />} />
            <Route path="/album/:key" element={<AlbumPage />} />
            <Route path="/offline" element={<Offline />} />
            <Route path="/downloads" element={<Downloads />} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <PlayerSpacer />
        </main>
      </div>
      <PlayerBar />
      <NowPlaying />
      <CommandPalette />
      <Toasts />
    </div>
  )
}
