import type { LocalTrack, PresenceInput } from '@shared/types'
import { useLocalPlayer } from '../store/localPlayer'
import { usePlayer, type PlayerTrack } from '../store/player'
import { useAudioFocus, type AudioSource } from './audioFocus'

/** Last.fm ignores tracks shorter than this. */
const MIN_TRACK_SECONDS = 30
/** A scrobble is due after half the track or four minutes, whichever comes first. */
const MAX_WAIT_SECONDS = 240
/** Seeking further than this from the expected position refreshes Discord. */
const SEEK_TOLERANCE = 4
/** Coalesces bursts of updates (scrubbing) into one presence call. */
const PRESENCE_DEBOUNCE_MS = 350

interface PlaybackSnapshot {
  playing: boolean
  currentTime: number
  duration: number
}

interface IntegrationTrack {
  key: string
  title: string
  artist: string
  album: string
  albumArtist: string
  duration: number
  trackNumber?: number
  coverUrl?: string
  itemUrl?: string
}

interface PlaySession {
  key: string
  track: IntegrationTrack
  /** Unix seconds when this play started. */
  startedAt: number
  /** Seconds actually listened to, so pauses and seeks do not inflate it. */
  listened: number
  position: number
  announced: boolean
  scrobbled: boolean
}

interface SentPresence {
  key: string
  playing: boolean
  position: number
  at: number
}

let started = false
let session: PlaySession | null = null
let sent: SentPresence | null = null
let pendingPresence: PresenceInput | null = null
let hasPendingPresence = false
let presenceTimer: ReturnType<typeof setTimeout> | null = null

function fromBandcamp(track: PlayerTrack): IntegrationTrack {
  return {
    key: `bandcamp:${track.albumKey}:${track.id}`,
    title: track.title,
    artist: track.artist,
    album: track.albumTitle,
    albumArtist: track.bandName,
    duration: track.duration,
    trackNumber: track.number,
    coverUrl: track.coverUrl,
    itemUrl: track.itemUrl
  }
}

function fromLocal(track: LocalTrack): IntegrationTrack {
  return {
    key: `local:${track.id}`,
    title: track.title,
    artist: track.artist,
    album: track.album,
    albumArtist: track.albumArtist,
    duration: track.duration,
    trackNumber: track.trackNumber
  }
}

function scrobbleThreshold(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return MAX_WAIT_SECONDS
  return Math.min(Math.max(duration / 2, MIN_TRACK_SECONDS), MAX_WAIT_SECONDS)
}

function presenceKey(input: PresenceInput): string {
  return `${input.artist}\u0000${input.title}\u0000${input.album ?? ''}`
}

function announce(play: PlaySession): void {
  const { track } = play
  void window.sideA.integrations
    .nowPlaying({
      artist: track.artist,
      title: track.title,
      album: track.album || undefined,
      albumArtist: track.albumArtist || undefined,
      duration: track.duration || undefined,
      trackNumber: track.trackNumber || undefined,
      timestamp: play.startedAt,
      key: `${play.key}:${play.startedAt}`
    })
    .catch(() => undefined)
}

function scrobble(track: IntegrationTrack, startedAt: number): void {
  void window.sideA.integrations
    .scrobble({
      artist: track.artist,
      title: track.title,
      album: track.album || undefined,
      albumArtist: track.albumArtist || undefined,
      duration: track.duration || undefined,
      trackNumber: track.trackNumber || undefined,
      timestamp: startedAt,
      key: `${track.key}:${startedAt}`
    })
    .catch(() => undefined)
}

function settle(play: PlaySession): void {
  if (play.scrobbled) return
  if (play.listened < scrobbleThreshold(play.track.duration)) return
  play.scrobbled = true
  scrobble(play.track, play.startedAt)
}

function newSession(state: PlaybackSnapshot, track: IntegrationTrack): PlaySession {
  return {
    key: track.key,
    track,
    startedAt: Math.floor(Date.now() / 1000),
    listened: 0,
    position: state.currentTime,
    announced: false,
    scrobbled: false
  }
}

function trackSession(state: PlaybackSnapshot, track: IntegrationTrack): void {
  if (session && session.key !== track.key) {
    settle(session)
    session = null
  }
  if (!session) session = newSession(state, track)

  const delta = state.currentTime - session.position
  session.position = state.currentTime

  // Looping back to the very start is a new play, including repeat one, where
  // the player seeks to zero before the play event flips playing back on. Any
  // other backwards seek keeps the current session so earlier listening counts.
  if (delta < -1 && state.currentTime < 1) {
    settle(session)
    session = newSession(state, track)
  }

  if (!state.playing) return

  if (delta > 0 && delta < 5) {
    // Forward playback only; jumps mean a seek, not listening time.
    session.listened += delta
  }

  if (!session.announced) {
    session.announced = true
    announce(session)
  }
  settle(session)
}

function presenceFor(state: PlaybackSnapshot, track: IntegrationTrack, source: AudioSource): PresenceInput {
  return {
    playing: state.playing,
    title: track.title,
    artist: track.artist,
    album: track.album || undefined,
    band: track.albumArtist || undefined,
    duration: state.duration || track.duration || undefined,
    position: state.currentTime,
    // Discord can only fetch public HTTPS artwork. Embedded local art stays
    // available in the app and media session, but cannot be sent to Discord.
    coverUrl: source === 'bandcamp' ? track.coverUrl || undefined : undefined,
    itemUrl: track.itemUrl
  }
}

function shouldSendPresence(input: PresenceInput | null): boolean {
  if (!input) return sent !== null
  if (!sent) return true
  if (sent.key !== presenceKey(input)) return true
  if (sent.playing !== input.playing) return true
  if (!input.playing) return Math.abs(sent.position - input.position) > 1
  const expected = sent.position + (Date.now() - sent.at) / 1000
  return Math.abs(expected - input.position) > SEEK_TOLERANCE
}

function flushPresence(): void {
  presenceTimer = null
  if (!hasPendingPresence) return
  hasPendingPresence = false
  const input = pendingPresence
  sent = input
    ? {
        key: presenceKey(input),
        playing: input.playing,
        position: input.position,
        at: Date.now()
      }
    : null
  void window.sideA.integrations.presence(input).catch(() => undefined)
}

function pushPresence(input: PresenceInput | null): void {
  pendingPresence = input
  if (hasPendingPresence) return
  hasPendingPresence = true
  presenceTimer = setTimeout(flushPresence, PRESENCE_DEBOUNCE_MS)
}

function onPlayerState(state: PlaybackSnapshot, source: AudioSource, track: IntegrationTrack | undefined): void {
  const active = useAudioFocus.getState().source
  // A paused source can keep a queue loaded without being the one the listener
  // is using. Only the focused source drives scrobbles and presence.
  if (active && active !== source && !state.playing) return

  if (!track) {
    if (!active || active === source) {
      if (session) settle(session)
      session = null
      if (shouldSendPresence(null)) pushPresence(null)
    }
    return
  }

  trackSession(state, track)
  if (!active || active === source) {
    const input = presenceFor(state, track, source)
    if (shouldSendPresence(input)) pushPresence(input)
  }
}

/**
 * Bridges both playback stores to Discord Rich Presence and Last.fm. Safe to
 * call more than once; the subscriptions are installed on the first call.
 */
export function startIntegrations(): void {
  if (started) return
  started = true
  usePlayer.subscribe((state) => {
    const track = state.queue[state.index]
    onPlayerState(state, 'bandcamp', track ? fromBandcamp(track) : undefined)
  })
  useLocalPlayer.subscribe((state) => {
    const track = state.queue[state.index]
    onPlayerState(state, 'local', track ? fromLocal(track) : undefined)
  })
  const bandcampState = usePlayer.getState()
  const bandcampTrack = bandcampState.queue[bandcampState.index]
  onPlayerState(bandcampState, 'bandcamp', bandcampTrack ? fromBandcamp(bandcampTrack) : undefined)
}
