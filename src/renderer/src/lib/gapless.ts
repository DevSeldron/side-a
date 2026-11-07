import { createBeatState, readBeatLevel, resetBeatState } from './beat'

/**
 * Gapless album playback.
 *
 * Every track is fetched and decoded into an AudioBuffer. The next track is
 * scheduled on the audio clock to begin just before the current one ends, so a
 * join has no silence in it by construction rather than by timing a play() call.
 *
 * Position is always "offset into the body where the running node started plus
 * time since it started", which stays correct after any seek. Every path that
 * reaches the end of a track advances: there is no flag that can suppress it.
 */

export interface GaplessOptions {
  context: () => AudioContext
  /** Whole file bytes for a queue index. */
  fetchBytes: (index: number) => Promise<ArrayBuffer>
  /** Queue index that follows the loaded one, or null at the end. */
  nextIndex: () => number | null
  onStart: (index: number, duration: number) => void
  onProgress: (position: number, duration: number) => void
  onEnded: () => void
  onPrepareError?: (index: number, error: unknown) => void
  log?: (event: string, detail?: Record<string, unknown>) => void
  /** How far before the end the next track begins. */
  overlap?: number
}

interface LoadedTrack {
  index: number
  buffer: AudioBuffer
  /** Encoder delay measured at the start of the buffer. */
  lead: number
  /** Encoder padding measured at the end of the buffer. */
  tail: number
  /** Audible length after both edges are trimmed. */
  length: number
}

interface ScheduledTrack {
  source: AudioBufferSourceNode
  index: number
  startAt: number
  loaded: LoadedTrack
}

/** Encoder delay and padding are digital silence; this much is measured off. */
const EDGE_LIMIT = 0.12
const EDGE_THRESHOLD = 0.0015
const MIN_BODY = 0.05
/** A source starting this soon is allowed to start immediately. */
const START_LEAD = 0.02
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

export function measureEdges(buffer: AudioBuffer): { lead: number; tail: number } {
  if (!buffer.numberOfChannels) return { lead: 0, tail: 0 }
  const rate = buffer.sampleRate
  const limit = Math.min(Math.floor(EDGE_LIMIT * rate), Math.floor(buffer.length / 2))
  const samples = buffer.getChannelData(0)
  let first = 0
  while (first < limit && Math.abs(samples[first] ?? 0) < EDGE_THRESHOLD) first += 1
  let last = buffer.length - 1
  const floor = buffer.length - limit
  while (last > floor && Math.abs(samples[last] ?? 0) < EDGE_THRESHOLD) last -= 1
  return { lead: first / rate, tail: (buffer.length - 1 - last) / rate }
}

export class GaplessEngine {
  private options: GaplessOptions
  private audio: AudioContext | null = null
  private output: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private beat = createBeatState()
  private current: LoadedTrack | null = null
  private source: AudioBufferSourceNode | null = null
  private sourceStart = 0
  private sourceOffset = 0
  private pausedAt = 0
  private prepared: LoadedTrack | null = null
  private scheduled: ScheduledTrack | null = null
  private active = false
  private finished = false
  private loadToken = 0
  private prepareToken = 0
  private volume = 0.75
  private muted = false

  constructor(options: GaplessOptions) {
    this.options = options
  }

  get index(): number {
    return this.current?.index ?? -1
  }

  get duration(): number {
    return this.current?.length ?? 0
  }

  get position(): number {
    if (!this.current) return 0
    if (!this.source || !this.audio) return this.pausedAt
    const elapsed = Math.max(0, this.audio.currentTime - this.sourceStart)
    return clamp(this.sourceOffset + elapsed, 0, this.current.length)
  }

  get playing(): boolean {
    return this.active && Boolean(this.source)
  }

  /** Read-only diagnostics, used by the engine checks. */
  get scheduledInfo(): { index: number; startAt: number } | null {
    return this.scheduled ? { index: this.scheduled.index, startAt: this.scheduled.startAt } : null
  }

  get preparedIndex(): number | null {
    return this.prepared?.index ?? null
  }

  /**
   * Bass onsets after the volume gain, not raw loudness: the rise between
   * consecutive frames decides a hit, scaled against the track's own flux, so
   * kicks read even in a loud master and each hit fades instead of holding.
   */
  beatLevel(): number {
    const analyser = this.analyser
    const audio = this.audio
    if (!analyser || !audio) return 0
    return readBeatLevel(analyser, audio.sampleRate, audio.currentTime, this.beat)
  }

  setVolume(volume: number, muted: boolean): void {
    this.volume = clamp(volume, 0, 1)
    this.muted = muted
    if (this.output) this.output.gain.value = muted ? 0 : this.volume
  }

  async load(index: number, autoplay: boolean): Promise<void> {
    const token = ++this.loadToken
    this.prepareToken += 1
    this.stopNodes()
    resetBeatState(this.beat)
    this.current = null
    this.prepared = null
    this.pausedAt = 0
    this.active = false
    this.finished = false
    this.options.log?.('load', { index })
    try {
      const bytes = await this.options.fetchBytes(index)
      if (token !== this.loadToken) return
      const buffer = await this.ensureAudio().decodeAudioData(bytes)
      if (token !== this.loadToken) return
      const { lead, tail } = measureEdges(buffer)
      const length = Math.max(MIN_BODY, buffer.duration - lead - tail)
      this.current = { index, buffer, lead, tail, length }
      this.pausedAt = 0
      this.options.log?.('decoded', { index, duration: round(buffer.duration), lead: round(lead), tail: round(tail) })
      if (autoplay) {
        this.startAt(0)
        void this.prepare()
      } else {
        this.emitProgress()
      }
    } catch (error) {
      if (token !== this.loadToken) return
      this.options.log?.('load-failed', { index, error: String(error) })
      throw error
    }
  }

  play(): void {
    if (!this.current) return
    if (!this.source) this.startAt(this.pausedAt)
    else this.active = true
    this.scheduleNext()
    void this.prepare()
    this.emitProgress()
  }

  pause(): void {
    if (this.current && this.source) this.pausedAt = this.position
    this.stopNodes()
    this.active = false
    this.options.log?.('pause', { at: round(this.pausedAt) })
    this.emitProgress()
  }

  seek(time: number): void {
    const loaded = this.current
    if (!loaded) return
    const target = clamp(time, 0, loaded.length)
    this.pausedAt = target
    this.options.log?.('seek', { to: round(target), playing: this.active })
    if (this.active) this.startAt(target)
    else this.emitProgress()
  }

  stop(): void {
    this.loadToken += 1
    this.prepareToken += 1
    this.stopNodes()
    this.current = null
    this.prepared = null
    this.pausedAt = 0
    this.active = false
    this.finished = false
    this.emitProgress()
  }

  /** Queue membership changed, so any prepared next track is now wrong. */
  reprepare(): void {
    this.prepareToken += 1
    this.prepared = null
    this.dropScheduled()
    void this.prepare()
  }

  tick(): void {
    const audio = this.audio
    if (!audio || !this.current) return
    try {
      if (this.scheduled && audio.currentTime + 0.03 >= this.scheduled.startAt) this.promote()
      const loaded = this.current
      if (!loaded || !this.source) return
      const position = this.position
      this.emitProgress()
      if (this.scheduled) return
      if (position < loaded.length - 0.05) return
      if (this.finished) return
      this.finished = true
      this.pausedAt = loaded.length
      this.source = null
      this.active = false
      this.options.log?.('ended', { index: loaded.index })
      this.options.onEnded()
    } catch (error) {
      this.options.log?.('tick-failed', { error: String(error) })
    }
  }

  private ensureAudio(): AudioContext {
    if (!this.audio) {
      this.audio = this.options.context()
      this.output = this.audio.createGain()
      this.analyser = this.audio.createAnalyser()
      this.analyser.fftSize = 2048
      this.analyser.smoothingTimeConstant = 0.12
      this.output.connect(this.analyser)
      this.analyser.connect(this.audio.destination)
      this.output.gain.value = this.muted ? 0 : this.volume
    }
    if (this.audio.state === 'suspended') void this.audio.resume()
    return this.audio
  }

  private startAt(offset: number): void {
    const loaded = this.current
    if (!loaded) return
    this.stopNodes()
    const audio = this.ensureAudio()
    const from = clamp(offset, 0, Math.max(0, loaded.length - MIN_BODY))
    const source = audio.createBufferSource()
    source.buffer = loaded.buffer
    if (this.output) source.connect(this.output)
    const when = audio.currentTime + START_LEAD
    const body = Math.max(MIN_BODY, loaded.length - from)
    source.start(when, loaded.lead + from, body)
    this.source = source
    this.sourceStart = when
    this.sourceOffset = from
    this.pausedAt = from
    this.active = true
    this.finished = false
    this.options.log?.('start', { index: loaded.index, from: round(from), at: round(when) })
    this.emitProgress()
    this.scheduleNext()
  }

  private scheduleNext(): void {
    const audio = this.audio
    const loaded = this.current
    const next = this.prepared
    if (!audio || !loaded || !next || !this.source || this.scheduled) return
    const target = this.options.nextIndex()
    if (target === null || next.index !== target) return
    const overlap = this.options.overlap ?? 0.008
    // The running node may have been started mid-track by a seek, so the join
    // is measured from what is left of this track, not from its full length.
    const endsAt = this.sourceStart + Math.max(0, loaded.length - this.sourceOffset)
    const startAt = Math.max(audio.currentTime + 0.01, endsAt - overlap)
    const source = audio.createBufferSource()
    source.buffer = next.buffer
    if (this.output) source.connect(this.output)
    try {
      source.start(startAt, next.lead, Math.max(MIN_BODY, next.length))
    } catch (error) {
      this.options.log?.('schedule-failed', { index: target, error: String(error) })
      return
    }
    this.scheduled = { source, index: target, startAt, loaded: next }
    this.prepared = null
    this.options.log?.('scheduled', {
      index: target,
      startAt: round(startAt),
      joinedIn: round(startAt - audio.currentTime)
    })
  }

  private promote(): void {
    const next = this.scheduled
    if (!next || !this.audio) return
    this.scheduled = null
    this.current = next.loaded
    this.source = next.source
    this.sourceStart = next.startAt
    this.sourceOffset = 0
    this.pausedAt = 0
    this.active = true
    this.finished = false
    this.options.onStart(next.index, next.loaded.length)
    this.options.log?.('promote', { index: next.index, lateBy: round(this.audio.currentTime - next.startAt) })
    void this.prepare()
  }

  private async prepare(): Promise<void> {
    if (this.prepared || this.scheduled) return
    const target = this.options.nextIndex()
    if (target === null) return
    const token = ++this.prepareToken
    try {
      const bytes = await this.options.fetchBytes(target)
      if (token !== this.prepareToken) return
      const buffer = await this.ensureAudio().decodeAudioData(bytes)
      if (token !== this.prepareToken) return
      const { lead, tail } = measureEdges(buffer)
      const prepared: LoadedTrack = {
        index: target,
        buffer,
        lead,
        tail,
        length: Math.max(MIN_BODY, buffer.duration - lead - tail)
      }
      this.prepared = prepared
      this.options.log?.('prepared', { index: target, length: round(prepared.length) })
      this.scheduleNext()
    } catch (error) {
      if (token !== this.prepareToken) return
      this.options.log?.('prepare-failed', { index: target, error: String(error) })
      this.options.onPrepareError?.(target, error)
    }
  }

  private dropScheduled(): void {
    if (!this.scheduled) return
    try {
      this.scheduled.source.stop()
    } catch {
      // Already ended.
    }
    this.scheduled = null
  }

  private stopNodes(): void {
    // Keep the track that was queued for the old end so it can be scheduled
    // again against the new position instead of being thrown away.
    if (this.scheduled) this.prepared = this.scheduled.loaded
    this.dropScheduled()
    if (this.source) {
      try {
        this.source.stop()
      } catch {
        // Already ended.
      }
      this.source = null
    }
  }

  private emitProgress(): void {
    this.options.onProgress(this.position, this.current?.length ?? 0)
  }
}
