/**
 * Shared beat analysis for every audio source: the gapless Bandcamp engine and
 * the local file player both feed an analyser through here, so the visualizer
 * reads the same bands and reacts with the same timing everywhere.
 *
 * Two bands are watched, the kick fundamental and the snare body. Each is
 * judged against its own rolling level and its own recent flux, so a hit has to
 * be a sharp rise above what that band was already doing. Steady noise, held
 * bass notes, hats and cymbals never qualify, and no bin above the snare band
 * is ever read.
 */

// Kick: the fundamental and its first harmonics.
const KICK_LOW = 30
const KICK_HIGH = 110
const KICK_FADE = 80
// Snare body. Hats and cymbals live far above this and are never read.
const SNARE_LOW = 160
const SNARE_HIGH = 320
const SNARE_FADE = 260
/** One hit per band should read as one hit, however long its tail rings. */
const REFRACTORY = 0.09
const KICK_WEIGHT = 1
const SNARE_WEIGHT = 0.75

interface Band {
  previous: number
  baseline: number
  flux: number
  pulse: number
  hitAt: number
}

export interface BeatState {
  bins: Uint8Array<ArrayBuffer> | null
  clock: number
  kick: Band
  snare: Band
}

function emptyBand(): Band {
  return { previous: 0, baseline: 0, flux: 0, pulse: 0, hitAt: -1 }
}

export function createBeatState(): BeatState {
  return { bins: null, clock: 0, kick: emptyBand(), snare: emptyBand() }
}

/** Clears the detector for a new track without reallocating its buffer. */
export function resetBeatState(state: BeatState): void {
  state.clock = 0
  state.kick = emptyBand()
  state.snare = emptyBand()
}

/**
 * Squared, weighted RMS of one band: the loudest bins dominate, which is what
 * a transient looks like, while the top of the band rolls off instead of
 * cutting hard.
 */
function bandLevel(
  bins: ArrayLike<number>,
  binWidth: number,
  count: number,
  low: number,
  high: number,
  fadeFrom: number
): number {
  const first = Math.max(1, Math.ceil(low / binWidth))
  const last = Math.min(count - 1, Math.floor(high / binWidth))
  let total = 0
  let weight = 0
  for (let index = first; index <= last; index += 1) {
    const hz = index * binWidth
    const fade = Math.min(1, Math.max(0, (high - hz) / (high - fadeFrom)))
    const value = (bins[index] ?? 0) / 255
    total += value * value * fade
    weight += fade
  }
  return weight > 0 ? Math.sqrt(total / weight) : 0
}

/**
 * One band's onset gate. A hit needs all three: a rise above the band's own
 * rolling level, a flux sharper than that band's recent flux, and enough gap
 * since its last hit. Strength scales with how far above the level it went.
 */
function readBand(
  band: Band,
  raw: number,
  delta: number,
  now: number,
  ratio: number,
  floor: number,
  release: number
): number {
  const flux = Math.max(0, raw - band.previous)
  band.previous = raw
  if (band.baseline === 0) band.baseline = raw
  band.baseline += (raw - band.baseline) * Math.min(1, delta * 2)
  band.flux += (flux - band.flux) * Math.min(1, delta * 9)
  // Both a proportional and an absolute margin: jitter on a loud noise floor
  // can clear a ratio alone, but it cannot move a band this far this fast.
  const rising = raw > band.baseline * 1.08 + 0.02
  const sharp = flux > Math.max(floor, band.flux * ratio)
  if (rising && sharp && now - band.hitAt >= REFRACTORY) {
    band.hitAt = now
    const strength = Math.min(1, (raw / Math.max(0.05, band.baseline) - 1) * 2 + flux * 4)
    band.pulse = Math.max(band.pulse, 0.55 + strength * 0.45)
  }
  band.pulse *= Math.exp(-delta / release)
  return band.pulse
}

export function readBeatLevel(
  analyser: AnalyserNode,
  rate: number,
  time: number,
  state: BeatState
): number {
  if (!state.bins || state.bins.length !== analyser.frequencyBinCount) {
    state.bins = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
  }
  analyser.getByteFrequencyData(state.bins)
  const binWidth = rate / analyser.fftSize
  const count = analyser.frequencyBinCount
  const delta = Math.min(0.12, Math.max(0, time - state.clock))
  state.clock = time
  const kick = readBand(
    state.kick,
    bandLevel(state.bins, binWidth, count, KICK_LOW, KICK_HIGH, KICK_FADE),
    delta,
    time,
    1.25,
    0.05,
    0.16
  )
  const snare = readBand(
    state.snare,
    bandLevel(state.bins, binWidth, count, SNARE_LOW, SNARE_HIGH, SNARE_FADE),
    delta,
    time,
    1.45,
    0.04,
    0.13
  )
  return Math.min(1, kick * KICK_WEIGHT + snare * SNARE_WEIGHT)
}
