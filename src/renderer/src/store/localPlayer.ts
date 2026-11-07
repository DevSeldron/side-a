import { create } from 'zustand'
import type { LocalTrack } from '@shared/types'
import { useApp } from './app'
import { usePlayer } from './player'
import { clearAudioFocus, requestAudioFocus, useAudioFocus } from '../lib/audioFocus'
import { createBeatState, readBeatLevel, resetBeatState } from '../lib/beat'
import { errorMessage } from '../lib/format'

type RepeatMode = 'off' | 'all' | 'one'

interface LocalPlayerState {
  queue: LocalTrack[]
  index: number
  /** Playback order of queue indexes. Stays fixed while shuffle is on. */
  order: number[]
  playing: boolean
  loading: boolean
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
  playTracks: (tracks: LocalTrack[], startTrackId?: string) => Promise<void>
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
let beatContext: AudioContext | null = null
let beatAnalyser: AnalyserNode | null = null
let beatGain: GainNode | null = null
let beatSource: MediaElementAudioSourceNode | null = null
const localBeat = createBeatState()

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
  const raw = localStorage.getItem('sidea.local.repeat')
  return raw === 'all' || raw === 'one' ? raw : 'off'
}

function mediaSession(): MediaSession | null {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null
}

function isLocalActive(): boolean {
  return useAudioFocus.getState().source === 'local'
}

function setSessionMetadata(track: LocalTrack | undefined): void {
  const session = mediaSession()
  if (!session || !track || !isLocalActive()) return
  try {
    session.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork: track.coverUrl
        ? [
            { src: track.coverUrl, sizes: '512x512' },
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
  if (!session?.setPositionState || !isLocalActive() || !Number.isFinite(duration) || duration <= 0) return
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

function routePlay(): void {
  if (isLocalActive()) void useLocalPlayer.getState().play()
  else void usePlayer.getState().play()
}

function routePause(): void {
  if (isLocalActive()) useLocalPlayer.getState().pause()
  else usePlayer.getState().pause()
}

function routeNext(): void {
  if (isLocalActive()) void useLocalPlayer.getState().next()
  else void usePlayer.getState().next()
}

function routePrev(): void {
  if (isLocalActive()) void useLocalPlayer.getState().prev()
  else void usePlayer.getState().prev()
}

function routeSeek(time: number): void {
  if (isLocalActive()) useLocalPlayer.getState().seek(time)
  else usePlayer.getState().seek(time)
}

function routeStop(): void {
  if (isLocalActive()) useLocalPlayer.getState().stop()
  else usePlayer.getState().stop()
}

function installMediaSessionHandlers(): void {
  const session = mediaSession()
  if (!session) return
  const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
    ['play', routePlay],
    ['pause', routePause],
    ['nexttrack', routeNext],
    ['previoustrack', routePrev],
    ['stop', routeStop],
    [
      'seekbackward',
      (details) => {
        const current = isLocalActive() ? useLocalPlayer.getState().currentTime : usePlayer.getState().currentTime
        routeSeek(current - (details.seekOffset ?? 10))
      }
    ],
    [
      'seekforward',
      (details) => {
        const current = isLocalActive() ? useLocalPlayer.getState().currentTime : usePlayer.getState().currentTime
        routeSeek(current + (details.seekOffset ?? 10))
      }
    ],
    [
      'seekto',
      (details) => {
        if (details.seekTime !== undefined) routeSeek(details.seekTime)
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

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio
  const element = new Audio()
  element.preload = 'auto'
  // CORS-clean media lets the beat tap read the stream without tainting it.
  element.crossOrigin = 'anonymous'
  element.volume = useLocalPlayer.getState().volume
  element.muted = useLocalPlayer.getState().muted
  element.addEventListener('timeupdate', () => {
    const state = useLocalPlayer.getState()
    useLocalPlayer.setState({ currentTime: element.currentTime, buffered: bufferedEnd(element) })
    updatePosition(state.duration || element.duration, element.currentTime)
  })
  element.addEventListener('durationchange', () => {
    if (Number.isFinite(element.duration) && element.duration > 0) {
      useLocalPlayer.setState({ duration: element.duration })
    }
  })
  element.addEventListener('progress', () => {
    useLocalPlayer.setState({ buffered: bufferedEnd(element) })
  })
  element.addEventListener('play', () => {
    useLocalPlayer.setState({ playing: true, loading: false })
    const session = mediaSession()
    if (session && isLocalActive()) session.playbackState = 'playing'
  })
  element.addEventListener('pause', () => {
    useLocalPlayer.setState({ playing: false })
    const session = mediaSession()
    if (session && isLocalActive() && !element.ended) session.playbackState = 'paused'
  })
  element.addEventListener('waiting', () => useLocalPlayer.setState({ loading: true }))
  element.addEventListener('playing', () => {
    useLocalPlayer.setState({ loading: false })
    ensureBeatTap(element)
  })
  element.addEventListener('canplay', () => useLocalPlayer.setState({ loading: false }))
  element.addEventListener('ended', () => useLocalPlayer.getState().handleEnded())
  element.addEventListener('error', () => {
    if (!element.currentSrc) return
    const now = Date.now()
    if (now - lastErrorAt < 1500) return
    lastErrorAt = now
    useLocalPlayer.setState({ loading: false, playing: false, error: 'This local track could not be played' })
    useApp.getState().pushToast('Playback error', {
      description: 'The file may have moved, rescan the folder and try again',
      tone: 'error'
    })
  })
  audio = element
  return element
}

/**
 * Routes the local element through Web Audio once so it can be analysed. The
 * analyser sits in that path; the store's volume and mute live on the gain
 * after it, because routing bypasses the element's own volume control.
 */
function ensureBeatTap(element: HTMLAudioElement): void {
  try {
    if (beatSource) {
      applyBeatGain()
      if (beatContext?.state === 'suspended') void beatContext.resume().catch(() => {})
      return
    }
    const context = new AudioContext()
    const analyser = context.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.12
    const gain = context.createGain()
    // Routing the element through Web Audio bypasses its own volume control,
    // so the store's volume and mute live on this gain from now on.
    const { volume, muted } = useLocalPlayer.getState()
    gain.gain.value = muted ? 0 : volume
    const source = context.createMediaElementSource(element)
    source.connect(analyser)
    analyser.connect(gain)
    gain.connect(context.destination)
    beatContext = context
    beatAnalyser = analyser
    beatGain = gain
    beatSource = source
    // The gain owns loudness now; leaving the element at full avoids squaring
    // the two volumes if the browser still applies the element's own control.
    element.volume = 1
    element.muted = false
    resetBeatState(localBeat)
    if (context.state === 'suspended') void context.resume().catch(() => {})
  } catch (error) {
    // The visualizer is optional; playback stays untouched either way.
    console.warn('Local beat tap unavailable', error)
  }
}

/** Pushes the store's volume and mute onto the Web Audio gain, if routed. */
function applyBeatGain(): void {
  if (!beatGain) return
  const { volume, muted } = useLocalPlayer.getState()
  beatGain.gain.value = muted || volume === 0 ? 0 : volume
}

/** Clears the detector between tracks; the routed source follows the element. */
function dropBeatTap(): void {
  resetBeatState(localBeat)
}

/** Low-end level of the local element, for the shared beat effect. */
export function localBeatLevel(): number {
  if (!beatAnalyser || !audio) return 0
  return readBeatLevel(beatAnalyser, beatContext?.sampleRate ?? 48000, audio.currentTime, localBeat)
}

function bufferedEnd(element: HTMLAudioElement): number {
  if (!element.buffered || element.buffered.length === 0) return 0
  return element.buffered.end(element.buffered.length - 1)
}

export const useLocalPlayer = create<LocalPlayerState>()((set, get) => ({
  queue: [],
  index: -1,
  order: [],
  playing: false,
  loading: false,
  currentTime: 0,
  duration: 0,
  buffered: 0,
  volume: storedNumber('sidea.local.volume', 0.75),
  muted: storedBoolean('sidea.local.muted', false),
  shuffle: storedBoolean('sidea.local.shuffle', false),
  repeat: readRepeat(),
  expanded: false,
  error: null,

  init: () => {
    if (initialized) return
    initialized = true
    ensureAudio()
    installMediaSessionHandlers()
    useAudioFocus.subscribe((state) => {
      if (state.source !== 'local') {
        audio?.pause()
        useLocalPlayer.setState({ expanded: false })
      } else {
        usePlayer.getState().setExpanded(false)
      }
    })
  },

  playTracks: async (tracks, startTrackId) => {
    if (!tracks.length) return
    requestAudioFocus('local')
    const found = startTrackId ? tracks.findIndex((track) => track.id === startTrackId) : 0
    const index = found >= 0 ? found : 0
    set({
      queue: tracks,
      index,
      order: buildOrder(tracks.length, index, get().shuffle),
      currentTime: 0,
      duration: tracks[index]?.duration ?? 0,
      buffered: 0,
      error: null
    })
    await get().loadAt(index, true)
  },

  loadAt: async (index, autoplay = true) => {
    const track = get().queue[index]
    if (!track) return
    requestAudioFocus('local')
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
    setSessionMetadata(track)
    try {
      const ticket = await window.sideA.local.stream(track.id)
      if (token !== loadToken) return
      const element = ensureAudio()
      element.src = ticket.url
      element.load()
      dropBeatTap()
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
      useApp.getState().pushToast('Could not start local playback', {
        description: errorMessage(error),
        tone: 'error'
      })
    }
  },

  play: async () => {
    if (!get().queue.length) {
      const first = useApp.getState().snapshot?.local.tracks[0]
      if (first) await get().playTracks([first])
      return
    }
    requestAudioFocus('local')
    const element = ensureAudio()
    if (!element.src) {
      await get().loadAt(get().index < 0 ? 0 : get().index, true)
      return
    }
    try {
      await element.play()
    } catch (error) {
      useApp.getState().pushToast('Could not resume local playback', {
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
    if (!queue.length) return
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
    localStorage.setItem('sidea.local.volume', String(next))
    if (next > 0 && get().muted) {
      element.muted = false
      localStorage.setItem('sidea.local.muted', 'false')
      set({ volume: next, muted: false })
      applyBeatGain()
      return
    }
    set({ volume: next })
    applyBeatGain()
  },

  toggleMute: () => {
    const element = ensureAudio()
    const muted = !get().muted
    element.muted = muted
    localStorage.setItem('sidea.local.muted', String(muted))
    set({ muted })
    applyBeatGain()
  },

  toggleShuffle: () => {
    const { queue, index, order } = get()
    const shuffle = !get().shuffle
    const nextOrder = queue.length ? buildOrder(queue.length, index, shuffle) : order
    localStorage.setItem('sidea.local.shuffle', String(shuffle))
    set({ shuffle, order: nextOrder })
  },

  cycleRepeat: () => {
    const order: RepeatMode[] = ['off', 'all', 'one']
    const current = order.indexOf(get().repeat)
    const repeat = order[(current + 1) % order.length] ?? 'off'
    localStorage.setItem('sidea.local.repeat', repeat)
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
    dropBeatTap()
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
      error: null
    })
    const session = mediaSession()
    if (session && isLocalActive()) session.metadata = null
    clearAudioFocus('local')
  }
}))
