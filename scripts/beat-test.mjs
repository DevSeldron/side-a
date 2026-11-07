/**
 * Checks the beat detector against synthetic spectra: kicks, snares, hats,
 * steady noise and held bass. Reports how many scheduled hits were found, how
 * late they landed, and whether background material ever triggered a pulse.
 * Run: npx esbuild src/renderer/src/lib/beat.ts --bundle --format=esm --outfile=/tmp/beat.mjs && node scripts/beat-test.mjs
 */
import { createBeatState, readBeatLevel } from '/tmp/beat.mjs'

const BINS = 1024
const RATE = 44100
const DT = 1 / 60

function makeAnalyser() {
  let current = new Array(BINS).fill(0)
  return {
    frequencyBinCount: BINS,
    fftSize: 2048,
    set(values) {
      current = values
    },
    getByteFrequencyData(target) {
      for (let index = 0; index < BINS; index += 1) target[index] = current[index] ?? 0
    }
  }
}

function rng(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function simulate({
  seconds = 12,
  noise = 0,
  jitter = 0,
  kick = 0,
  kickAt = 0.25,
  kickAmp = 245,
  snare = 0,
  snareAt = 0.4,
  hats = false,
  bass = false
}) {
  const analyser = makeAnalyser()
  const state = createBeatState()
  const levels = []
  const random = rng(1234)
  for (let frame = 0; frame * DT < seconds; frame += 1) {
    const time = frame * DT
    const bins = new Array(BINS).fill(noise)
    if (jitter) {
      for (let index = 0; index < BINS; index += 1) {
        bins[index] = Math.max(0, Math.min(255, bins[index] + (random() - 0.5) * jitter))
      }
    }
    if (bass) for (let index = 2; index <= 5; index += 1) bins[index] = 190
    if (kick) {
      const phase = (time - kickAt) % kick
      if (phase >= 0 && phase < 0.035) for (let index = 2; index <= 4; index += 1) bins[index] = kickAmp
    }
    if (snare) {
      const phase = (time - snareAt) % snare
      if (phase >= 0 && phase < 0.03) for (let index = 8; index <= 13; index += 1) bins[index] = 220
    }
    if (hats && time % 0.25 < 0.02) for (let index = 300; index <= 420; index += 1) bins[index] = 250
    analyser.set(bins)
    levels.push(readBeatLevel(analyser, RATE, time, state))
  }
  return levels
}

/**
 * Counts pulses by their attack, so a fast passage counts each hit even when
 * the tail of one is still fading under the next.
 */
function events(levels) {
  let count = 0
  let peak = 0
  let previous = 0
  let last = -99
  for (let frame = 0; frame < levels.length; frame += 1) {
    const level = levels[frame]
    peak = Math.max(peak, level)
    if (level - previous >= 0.15 && frame - last >= 3) {
      count += 1
      last = frame
    }
    previous = level
  }
  return { count, peak }
}

/** Every scheduled hit should clear the threshold within two frames (33 ms). */
function hits(levels, start, interval) {
  let scheduled = 0
  let missed = 0
  let worst = 0
  for (let at = start; at * 60 < levels.length; at += interval) {
    scheduled += 1
    const from = Math.round(at * 60)
    let delay = -1
    for (let frame = from; frame < Math.min(levels.length, from + 3); frame += 1) {
      if (levels[frame] >= 0.25) {
        delay = frame - from
        break
      }
    }
    if (delay < 0) missed += 1
    worst = Math.max(worst, delay)
  }
  return { scheduled, missed, worst }
}

let failures = 0

function check(name, condition, detail) {
  if (!condition) failures += 1
  console.log(`${condition ? 'PASS' : 'FAIL'} ${name}: ${detail}`)
}

function quiet(name, levels) {
  const result = events(levels)
  check(name, result.count === 0, `events=${result.count} peak=${result.peak.toFixed(2)}`)
}

function beats(name, levels, min, max, probes) {
  const result = events(levels)
  const probeResults = probes.map(([start, interval]) => hits(levels, start, interval))
  const missed = probeResults.reduce((sum, probe) => sum + probe.missed, 0)
  const scheduled = probeResults.reduce((sum, probe) => sum + probe.scheduled, 0)
  const worst = Math.max(...probeResults.map((probe) => probe.worst))
  check(
    name,
    result.count >= min && result.count <= max && missed === 0,
    `events=${result.count} hits=${scheduled - missed}/${scheduled} worstDelay=${worst}f peak=${result.peak.toFixed(2)}`
  )
}

quiet('silence', simulate({ seconds: 4 }))
quiet('steady noise', simulate({ seconds: 8, noise: 85, jitter: 16 }))
quiet('loud noise', simulate({ seconds: 8, noise: 150, jitter: 24 }))
quiet('hi-hats only', simulate({ seconds: 6, noise: 40, hats: true }))
quiet('held bass', simulate({ seconds: 8, noise: 30, bass: true }))

beats('kick only', simulate({ seconds: 8, noise: 30, kick: 0.5 }), 14, 17, [[0.25, 0.5]])
beats('soft kick on noise', simulate({ seconds: 8, noise: 100, kick: 0.5, kickAmp: 200 }), 14, 17, [[0.25, 0.5]])
beats('snare only', simulate({ seconds: 8, noise: 30, snare: 0.5 }), 14, 17, [[0.4, 0.5]])
beats(
  'backbeat + hats',
  simulate({ seconds: 10, noise: 55, jitter: 8, kick: 0.5, snare: 0.5, snareAt: 0.5, hats: true }),
  36,
  42,
  [
    [0.25, 0.5],
    [0.5, 0.5]
  ]
)
beats('8th-note kick', simulate({ seconds: 6, noise: 30, kick: 0.25 }), 20, 24, [[0.25, 0.25]])

console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
