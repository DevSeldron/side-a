import { create } from 'zustand'
import type { AlbumDetail, LikedTrack } from '@shared/types'
import { useApp } from './app'
import { clearAudioFocus, requestAudioFocus, useAudioFocus } from '../lib/audioFocus'
import { GaplessEngine } from '../lib/gapless'
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
  shuffleLoading: boolean
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
  /** Plays liked songs in the order shown, starting at the chosen row. */
  playLiked: (tracks: LikedTrack[], start?: number) => Promise<void>
  /** Builds a queue of random tracks drawn from across the collection. */
  playShuffle: (albumKeys: string[]) => Promise<void>
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

let audio: AudioContext | null = null
let engine: GaplessEngine | null = null
let initialized = false
let loadToken = 0

/** Bass energy of the streaming player, for the beat glow. */
export function playerBeatLevel(): number {
  return engine?.beatLevel() ?? 0
}

function audioContext(): AudioContext {
  if (!audio) audio = new AudioContext()
  if (audio.state === 'suspended') void audio.resume()
  return audio
}

function logPlayback(event: string, detail?: Record<string, unknown>): void {
  void window.sideA.playback.log(event, detail).catch(() => undefined)
}

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

/** Fisher-Yates copy, so callers never mutate the array they pass in. */
function shuffleCopy<T>(items: readonly T[]): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    const first = copy[index]
    const second = copy[swap]
    if (first === undefined || second === undefined) continue
    copy[index] = second
    copy[swap] = first
  }
  return copy
}

/**
 * Breaks up runs of the same release, so a mix does not play three tracks off
 * one album back to back.
 */
function spreadReleases(tracks: PlayerTrack[]): PlayerTrack[] {
  const shuffled = shuffleCopy(tracks)
  for (let index = 1; index < shuffled.length; index += 1) {
    const previous = shuffled[index - 1]
    const current = shuffled[index]
    if (!previous || !current || previous.albumKey !== current.albumKey) continue
    const swap = shuffled.findIndex(
      (candidate, position) => position > index && candidate.albumKey !== previous.albumKey
    )
    const other = swap === -1 ? undefined : shuffled[swap]
    if (!other || swap < index) continue
    shuffled[swap] = current
    shuffled[index] = other
  }
  return shuffled
}

/** How many tracks a shuffle mix gathers before it starts playing. */
const SHUFFLE_TRACK_TARGET = 60
const SHUFFLE_TRACKS_PER_RELEASE = 3
const SHUFFLE_RELEASE_LIMIT = 24
const SHUFFLE_FETCH_BATCH = 6

function toPlayerTrack(
  track: AlbumDetail['tracks'][number],
  detail: AlbumDetail,
  cover: string,
  offline: boolean
): PlayerTrack {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist || detail.bandName,
    number: track.number,
    duration: track.duration,
    albumKey: detail.key,
    albumTitle: detail.title,
    bandName: detail.bandName,
    coverUrl: cover,
    itemUrl: detail.itemUrl,
    offline
  }
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

/** The queue index an automatic advance lands on, or null when playback stops. */
function resolveNextIndex(auto: boolean): number | null {
  const { queue, index, repeat, shuffle, order } = usePlayer.getState()
  if (!queue.length) return null
  if (auto && repeat === 'one') return index
  const active = order.length === queue.length ? order : buildOrder(queue.length, index, shuffle)
  const position = Math.max(0, active.indexOf(index))
  let nextPosition = position + 1
  if (nextPosition >= active.length) {
    if (auto && repeat === 'off') return null
    nextPosition = 0
  }
  return active[nextPosition] ?? 0
}

/**
 * The single audio engine for the Bandcamp queue. It decodes each track and
 * schedules the next one on the audio clock, so joins are gapless, and it keeps
 * every position calculation relative to the track body rather than to when a
 * source node happened to start.
 */
function playerEngine(): GaplessEngine {
  if (engine) return engine
  const created = new GaplessEngine({
    context: audioContext,
    fetchBytes: (index) => {
      const track = usePlayer.getState().queue[index]
      if (!track) return Promise.reject(new Error('That track is no longer in the queue'))
      return window.sideA.playback.buffer(track.albumKey, track.id)
    },
    nextIndex: () => resolveNextIndex(true),
    onStart: (index, duration) => {
      const state = usePlayer.getState()
      updateMediaSession(state.queue[index])
      usePlayer.setState({
        index,
        duration,
        currentTime: 0,
        buffered: duration,
        playing: true,
        loading: false
      })
    },
    onProgress: (position, duration) => {
      usePlayer.setState({ currentTime: position })
      updatePosition(duration, position)
    },
    onEnded: () => {
      const target = resolveNextIndex(true)
      if (target === null) {
        usePlayer.setState({ playing: false })
        return
      }
      void usePlayer.getState().loadAt(target, true)
    },
    onPrepareError: (index, error) => logPlayback('prepare-error', { index, error: String(error) }),
    log: logPlayback,
    overlap: 0.008
  })
  engine = created
  const state = usePlayer.getState()
  created.setVolume(state.volume, state.muted)
  return created
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
  shuffleLoading: false,
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
    installMediaSessionHandlers()
    useAudioFocus.subscribe((state) => {
      if (state.source !== 'bandcamp') usePlayer.getState().pause()
    })
    const player = playerEngine()
    setInterval(() => player.tick(), 100)
  },

  playAlbum: async (albumKey, startTrackId) => {
    requestAudioFocus('bandcamp')
    set({ pendingKey: albumKey, error: null })
    try {
      const detail = await window.sideA.library.album(albumKey)
      const snapshot = useApp.getState().snapshot
      const album =
        snapshot?.collection.find((entry) => entry.key === albumKey) ??
        snapshot?.wishlist.find((entry) => entry.key === albumKey)
      if (!detail.tracks.length) throw new Error('This release has no streamable tracks')
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

  playLiked: async (tracks, start = 0) => {
    if (!tracks.length) return
    requestAudioFocus('bandcamp')
    const queue: PlayerTrack[] = tracks.map((track, position) => ({
      id: track.id,
      title: track.title,
      artist: track.artist,
      number: position + 1,
      duration: track.duration,
      albumKey: track.albumKey,
      albumTitle: track.albumTitle,
      bandName: track.bandName,
      coverUrl: track.coverUrl,
      itemUrl: track.itemUrl,
      offline: false
    }))
    const index = Math.min(Math.max(0, start), queue.length - 1)
    set({
      queue,
      index,
      order: buildOrder(queue.length, index, get().shuffle),
      pendingKey: null,
      error: null,
      currentTime: 0,
      duration: queue[index]?.duration ?? 0,
      buffered: 0
    })
    await get().loadAt(index, true)
  },

  playShuffle: async (albumKeys) => {
    const keys = shuffleCopy([...new Set(albumKeys)]).slice(0, SHUFFLE_RELEASE_LIMIT)
    if (!keys.length) return
    requestAudioFocus('bandcamp')
    set({ shuffleLoading: true, error: null })
    try {
      const snapshot = useApp.getState().snapshot
      const picks: PlayerTrack[] = []
      for (
        let cursor = 0;
        cursor < keys.length && picks.length < SHUFFLE_TRACK_TARGET;
        cursor += SHUFFLE_FETCH_BATCH
      ) {
        const batch = keys.slice(cursor, cursor + SHUFFLE_FETCH_BATCH)
        const details = await Promise.all(
          batch.map(async (key) => {
            try {
              return await window.sideA.library.album(key)
            } catch {
              // A release that will not load should not break the whole mix.
              return null
            }
          })
        )
        for (const detail of details) {
          if (!detail || picks.length >= SHUFFLE_TRACK_TARGET) continue
          const offline = snapshot?.offline[detail.key]?.status === 'ready'
          const album =
            snapshot?.collection.find((entry) => entry.key === detail.key) ??
            snapshot?.wishlist.find((entry) => entry.key === detail.key)
          const cover = offline ? `bcmedia://cover/${detail.key}` : detail.artUrl || (album ? coverUrl(album, 10) : '')
          const selection = shuffleCopy(detail.tracks).slice(0, SHUFFLE_TRACKS_PER_RELEASE)
          for (const track of selection) picks.push(toPlayerTrack(track, detail, cover, offline))
        }
      }
      if (!picks.length) throw new Error('No streamable tracks in your collection')
      const queue = spreadReleases(picks)
      set({
        queue,
        index: 0,
        order: buildOrder(queue.length, 0, get().shuffle),
        shuffleLoading: false,
        currentTime: 0,
        duration: queue[0]?.duration ?? 0,
        buffered: 0
      })
      await get().loadAt(0, true)
    } catch (error) {
      set({ shuffleLoading: false, loading: false })
      useApp.getState().pushToast('Could not build a shuffle mix', {
        description: errorMessage(error),
        tone: 'error'
      })
    }
  },

  loadAt: async (index, autoplay = true) => {
    const track = get().queue[index]
    if (!track) return
    requestAudioFocus('bandcamp')
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
    const player = playerEngine()
    try {
      await player.load(index, autoplay)
      if (token !== loadToken) return
      set({
        loading: false,
        playing: autoplay,
        duration: player.duration,
        buffered: player.duration
      })
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
    requestAudioFocus('bandcamp')
    const player = playerEngine()
    if (!player.duration) {
      await get().loadAt(get().index < 0 ? 0 : get().index, true)
      return
    }
    player.play()
    set({ playing: true })
  },

  pause: () => {
    playerEngine().pause()
    set({ playing: false })
    const session = mediaSession()
    if (session) session.playbackState = 'paused'
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
    const player = playerEngine()
    const duration = player.duration || get().duration
    const next = Math.min(Math.max(time, 0), duration || 0)
    if (!Number.isFinite(next)) return
    player.seek(next)
    set({ currentTime: next })
  },

  setVolume: (volume) => {
    const next = Math.min(1, Math.max(0, volume))
    localStorage.setItem('sidea.volume', String(next))
    if (next > 0 && get().muted) {
      localStorage.setItem('sidea.muted', 'false')
      set({ volume: next, muted: false })
      engine?.setVolume(next, false)
      return
    }
    set({ volume: next })
    engine?.setVolume(next, get().muted)
  },

  toggleMute: () => {
    const muted = !get().muted
    localStorage.setItem('sidea.muted', String(muted))
    set({ muted })
    engine?.setVolume(get().volume, muted)
  },

  toggleShuffle: () => {
    const { queue, index, order } = get()
    const shuffle = !get().shuffle
    const nextOrder = queue.length ? buildOrder(queue.length, index, shuffle) : order
    localStorage.setItem('sidea.shuffle', String(shuffle))
    set({ shuffle, order: nextOrder })
    engine?.reprepare()
  },

  cycleRepeat: () => {
    const order: RepeatMode[] = ['off', 'all', 'one']
    const currentRepeat = order.indexOf(get().repeat)
    const repeat = order[(currentRepeat + 1) % order.length] ?? 'off'
    localStorage.setItem('sidea.repeat', repeat)
    set({ repeat })
    engine?.reprepare()
  },

  setExpanded: (expanded) => set({ expanded }),

  stop: () => {
    loadToken += 1
    engine?.stop()
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
    clearAudioFocus('bandcamp')
  }
}))
