import { create } from 'zustand'
import type { AlbumDetail } from '@shared/types'
import { useApp } from './app'
import { coverUrl, errorMessage } from '../lib/format'

export interface PlayerTrack {
  id: number
  title: string
  artist: string
  number: number
  duration: number
  albumKey: string
  albumTitle: string
  bandName: string
  coverUrl: string
  itemUrl?: string
  offline: boolean
}

type RepeatMode = 'off' | 'all' | 'one'

interface PlayerState {
  queue: PlayerTrack[]
  index: number
  /** Playback order of queue indexes. Stays fixed while shuffle is on. */
  order: number[]
  playing: boolean
  loading: boolean
  pendingKey: string | null
  currentTime: number
  duration: number
  buffered: number
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: RepeatMode
  expanded: boolean
  error: string | null
  init: () => void
  playAlbum: (albumKey: string, startTrackId?: number) => Promise<void>
  loadAt: (index: number, autoplay?: boolean) => Promise<void>
  play: () => Promise<void>
  pause: () => void
  toggle: () => Promise<void>
  next: (auto?: boolean) => Promise<void>
  prev: () => Promise<void>
  handleEnded: () => void
  seek: (time: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  setExpanded: (expanded: boolean) => void
  stop: () => void
}

let audio: HTMLAudioElement | null = null
let initialized = false
let loadToken = 0
let lastErrorAt = 0

/**
 * Builds a playback order that starts at the current track and visits every
 * other track exactly once. Next and previous both walk this order, so a
 * shuffled album does not re-randomise on every skip.
 */
function buildOrder(length: number, start: number, shuffle: boolean): number[] {
  const natural = Array.from({ length }, (_, index) => index)
  if (!shuffle || length < 2) return natural
  const rest = natural.filter((index) => index !== start)
  for (let index = rest.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    ;[rest[index], rest[swap]] = [rest[swap] as number, rest[index] as number]
  }
  return start >= 0 && start < length ? [start, ...rest] : rest
}

function storedNumber(key: string, fallback: number): number {
  const raw = localStorage.getItem(key)
  if (!raw) return fallback
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

function storedBoolean(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key)
  if (raw === null) return fallback
  return raw === 'true'
}

function readRepeat(): RepeatMode {
  const raw = localStorage.getItem('sidea.repeat')
  return raw === 'all' || raw === 'one' ? raw : 'off'
}

function mediaSession(): MediaSession | null {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null
}

function updateMediaSession(track: PlayerTrack | undefined): void {
  const session = mediaSession()
  if (!session || !track) return
  try {
    session.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.albumTitle,
      artwork: track.coverUrl
        ? [
            { src: track.coverUrl, sizes: '512x512', type: 'image/jpeg' },
            { src: track.coverUrl, sizes: '256x256' }
          ]
        : []
    })
    session.playbackState = 'playing'
  } catch {
    // Metadata support is best effort.
  }
}

function updatePosition(duration: number, position: number): void {
  const session = mediaSession()
  if (!session?.setPositionState || !Number.isFinite(duration) || duration <= 0) return
  try {
    session.setPositionState({
      duration,
      position: Math.min(position, duration),
      playbackRate: 1
    })
  } catch {
    // Ignore unsupported position updates.
  }
}

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio
  const element = new Audio()
  element.preload = 'auto'
  element.volume = usePlayer.getState().volume
  element.muted = usePlayer.getState().muted
  element.addEventListener('timeupdate', () => {
    const state = usePlayer.getState()
    usePlayer.setState({ currentTime: element.currentTime, buffered: bufferedEnd(element) })
    updatePosition(state.duration || element.duration, element.currentTime)
  })
  element.addEventListener('durationchange', () => {
    if (Number.isFinite(element.duration) && element.duration > 0) {
      usePlayer.setState({ duration: element.duration })
    }
  })
  element.addEventListener('progress', () => {
    usePlayer.setState({ buffered: bufferedEnd(element) })
  })
  element.addEventListener('play', () => {
    usePlayer.setState({ playing: true, loading: false })
    const session = mediaSession()
    if (session) session.playbackState = 'playing'
  })
  element.addEventListener('pause', () => {
    usePlayer.setState({ playing: false })
    const session = mediaSession()
    if (session && !element.ended) session.playbackState = 'paused'
  })
  element.addEventListener('waiting', () => usePlayer.setState({ loading: true }))
  element.addEventListener('playing', () => usePlayer.setState({ loading: false }))
  element.addEventListener('canplay', () => usePlayer.setState({ loading: false }))
  element.addEventListener('ended', () => usePlayer.getState().handleEnded())
  element.addEventListener('error', () => {
    if (!element.currentSrc) return
    const now = Date.now()
    if (now - lastErrorAt < 1500) return
    lastErrorAt = now
    usePlayer.setState({ loading: false, playing: false, error: 'This track could not be played.' })
    useApp.getState().pushToast('Playback error', {
      description: 'The stream may have expired. Try the track again.',
      tone: 'error'
    })
  })
  audio = element
  return element
}

function bufferedEnd(element: HTMLAudioElement): number {
  if (!element.buffered || element.buffered.length === 0) return 0
  return element.buffered.end(element.buffered.length - 1)
}

function installMediaSessionHandlers(): void {
  const session = mediaSession()
  if (!session) return
  const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
    ['play', () => void usePlayer.getState().play()],
    ['pause', () => usePlayer.getState().pause()],
    ['nexttrack', () => void usePlayer.getState().next()],
    ['previoustrack', () => void usePlayer.getState().prev()],
    ['stop', () => usePlayer.getState().stop()],
    [
      'seekbackward',
      (details) => {
        const state = usePlayer.getState()
        state.seek(state.currentTime - (details.seekOffset ?? 10))
      }
    ],
    [
      'seekforward',
      (details) => {
        const state = usePlayer.getState()
        state.seek(state.currentTime + (details.seekOffset ?? 10))
      }
    ],
    [
      'seekto',
      (details) => {
        if (details.seekTime !== undefined) usePlayer.getState().seek(details.seekTime)
      }
    ]
  ]
  for (const [action, handler] of handlers) {
    try {
      session.setActionHandler(action, handler)
    } catch {
      // Some actions are not supported on every platform.
    }
  }
}

export const usePlayer = create<PlayerState>()((set, get) => ({
  queue: [],
  index: -1,
  order: [],
  playing: false,
  loading: false,
  pendingKey: null,
  currentTime: 0,
  duration: 0,
  buffered: 0,
  volume: storedNumber('sidea.volume', 0.75),
  muted: storedBoolean('sidea.muted', false),
  shuffle: storedBoolean('sidea.shuffle', false),
  repeat: readRepeat(),
  expanded: false,
  error: null,

  init: () => {
    if (initialized) return
    initialized = true
    ensureAudio()
    installMediaSessionHandlers()
  },

  playAlbum: async (albumKey, startTrackId) => {
    set({ pendingKey: albumKey, error: null })
    try {
      const detail = await window.sideA.library.album(albumKey)
      const snapshot = useApp.getState().snapshot
      const album =
        snapshot?.collection.find((entry) => entry.key === albumKey) ??
        snapshot?.wishlist.find((entry) => entry.key === albumKey)
      if (!detail.tracks.length) throw new Error('This release has no streamable tracks.')
      const offline = snapshot?.offline[albumKey]?.status === 'ready'
      const cover = offline
        ? `bcmedia://cover/${albumKey}`
        : detail.artUrl || (album ? coverUrl(album, 10) : '')
      const queue: PlayerTrack[] = detail.tracks.map((track) => ({
        id: track.id,
        title: track.title,
        artist: track.artist || detail.bandName,
        number: track.number,
        duration: track.duration,
        albumKey,
        albumTitle: detail.title,
        bandName: detail.bandName,
        coverUrl: cover,
        itemUrl: detail.itemUrl,
        offline
      }))
      const found = startTrackId ? queue.findIndex((track) => track.id === startTrackId) : 0
      const index = found >= 0 ? found : 0
      set({
        queue,
        index,
        order: buildOrder(queue.length, index, get().shuffle),
        pendingKey: null,
        currentTime: 0,
        duration: queue[index]?.duration ?? 0,
        buffered: 0
      })
      await get().loadAt(index, true)
    } catch (error) {
      set({ pendingKey: null, loading: false })
      useApp.getState().pushToast('Could not play this release', {
        description: errorMessage(error),
        tone: 'error'
      })
    }
  },

  loadAt: async (index, autoplay = true) => {
    const track = get().queue[index]
    if (!track) return
    const token = ++loadToken
    set({
      index,
      loading: true,
      playing: false,
      currentTime: 0,
      duration: track.duration,
      buffered: 0,
      error: null
    })
    updateMediaSession(track)
    try {
      const ticket = await window.sideA.playback.stream(track.albumKey, track.id)
      if (token !== loadToken) return
      const element = ensureAudio()
      element.src = ticket.url
      element.load()
      if (autoplay) {
        element.volume = get().volume
        element.muted = get().muted
        await element.play()
      } else {
        set({ loading: false })
      }
    } catch (error) {
      if (token !== loadToken) return
      set({ loading: false, playing: false, error: errorMessage(error) })
      useApp.getState().pushToast('Could not start playback', {
        description: errorMessage(error),
        tone: 'error'
      })
    }
  },

  play: async () => {
    if (!get().queue.length) {
      const first = useApp.getState().snapshot?.collection[0]
      if (first) await get().playAlbum(first.key)
      return
    }
    const element = ensureAudio()
    if (!element.src) {
      await get().loadAt(get().index < 0 ? 0 : get().index, true)
      return
    }
    try {
      await element.play()
    } catch (error) {
      useApp.getState().pushToast('Could not resume playback', {
        description: errorMessage(error),
        tone: 'error'
      })
    }
  },

  pause: () => {
    audio?.pause()
  },

  toggle: async () => {
    if (get().playing) get().pause()
    else await get().play()
  },

  next: async (auto = false) => {
    const { queue, index, repeat, shuffle, order } = get()
    if (!queue.length) return
    if (auto && repeat === 'one') {
      get().seek(0)
      await get().play()
      return
    }
    const active = order.length === queue.length ? order : buildOrder(queue.length, index, shuffle)
    const position = Math.max(0, active.indexOf(index))
    let nextPosition = position + 1
    if (nextPosition >= active.length) {
      if (auto && repeat === 'off') {
        set({ playing: false, currentTime: get().duration })
        return
      }
      nextPosition = 0
    }
    await get().loadAt(active[nextPosition] ?? 0, true)
  },

  prev: async () => {
    const { queue, index, currentTime, shuffle, order } = get()
    if (currentTime > 3) {
      get().seek(0)
      return
    }
    if (queue.length === 0) return
    const active = order.length === queue.length ? order : buildOrder(queue.length, index, shuffle)
    const position = Math.max(0, active.indexOf(index))
    const previousPosition = position <= 0 ? active.length - 1 : position - 1
    await get().loadAt(active[previousPosition] ?? 0, true)
  },

  handleEnded: () => {
    void get().next(true)
  },

  seek: (time) => {
    const element = ensureAudio()
    const duration = get().duration || element.duration || 0
    const next = Math.min(Math.max(time, 0), duration || time)
    if (Number.isFinite(next)) {
      element.currentTime = next
      set({ currentTime: next })
    }
  },

  setVolume: (volume) => {
    const next = Math.min(1, Math.max(0, volume))
    const element = ensureAudio()
    element.volume = next
    element.muted = next === 0 ? element.muted : false
    localStorage.setItem('sidea.volume', String(next))
    if (next > 0 && get().muted) {
      element.muted = false
      localStorage.setItem('sidea.muted', 'false')
      set({ volume: next, muted: false })
      return
    }
    set({ volume: next })
  },

  toggleMute: () => {
    const element = ensureAudio()
    const muted = !get().muted
    element.muted = muted
    localStorage.setItem('sidea.muted', String(muted))
    set({ muted })
  },

  toggleShuffle: () => {
    const { queue, index, order } = get()
    const shuffle = !get().shuffle
    const nextOrder = queue.length ? buildOrder(queue.length, index, shuffle) : order
    localStorage.setItem('sidea.shuffle', String(shuffle))
    set({ shuffle, order: nextOrder })
  },

  cycleRepeat: () => {
    const order: RepeatMode[] = ['off', 'all', 'one']
    const current = order.indexOf(get().repeat)
    const repeat = order[(current + 1) % order.length] ?? 'off'
    localStorage.setItem('sidea.repeat', repeat)
    set({ repeat })
  },

  setExpanded: (expanded) => set({ expanded }),

  stop: () => {
    loadToken += 1
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    set({
      queue: [],
      index: -1,
      order: [],
      playing: false,
      loading: false,
      currentTime: 0,
      duration: 0,
      buffered: 0,
      expanded: false,
      pendingKey: null
    })
    const session = mediaSession()
    if (session) session.metadata = null
  }
}))
