/**
 * Checks the gapless engine's state machine against a fake audio clock.
 * Run: npx esbuild src/renderer/src/lib/gapless.ts --format=esm --outfile=/tmp/gapless.mjs && node scripts/gapless-test.mjs
 */
import { GaplessEngine } from '/tmp/gapless.mjs'

let failures = 0

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`PASS ${name}`)
  } else {
    failures += 1
    console.log(`FAIL ${name} ${detail}`)
  }
}

function near(name, actual, expected, tolerance = 0.05) {
  check(name, Math.abs(actual - expected) <= tolerance, `actual=${actual} expected=${expected}`)
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

class FakeSource {
  constructor(sources) {
    this.sources = sources
    this.startArgs = null
  }
  connect() {}
  start(when, offset, duration) {
    this.startArgs = { when, offset, duration }
    this.sources.push(this)
  }
  stop() {}
}

class FakeContext {
  constructor() {
    this.currentTime = 0
    this.destination = {}
    this.state = 'running'
    this.sources = []
  }
  createGain() {
    return { gain: { value: 1 }, connect() {} }
  }
  createAnalyser() {
    return {
      fftSize: 256,
      frequencyBinCount: 128,
      smoothingTimeConstant: 0,
      getByteFrequencyData(target) {
        target.fill(0)
      },
      connect() {},
      disconnect() {}
    }
  }
  createBufferSource() {
    return new FakeSource(this.sources)
  }
  resume() {
    return Promise.resolve()
  }
  async decodeAudioData(bytes) {
    const duration = new DataView(bytes).getFloat64(0, true)
    const sampleRate = 100
    const length = Math.round(duration * sampleRate)
    const data = new Float32Array(length).fill(0.5)
    return {
      duration,
      sampleRate,
      length,
      numberOfChannels: 1,
      getChannelData: () => data
    }
  }
}

function bytesFor(duration) {
  const bytes = new ArrayBuffer(8)
  new DataView(bytes).setFloat64(0, duration, true)
  return bytes
}

function build(durations, { repeat = false } = {}) {
  const context = new FakeContext()
  const events = []
  let engine
  engine = new GaplessEngine({
    context: () => context,
    fetchBytes: async (index) => bytesFor(durations[index] ?? 30),
    nextIndex: () => {
      if (repeat) return engine.index
      const next = engine.index + 1
      return next < durations.length ? next : null
    },
    onStart: (index) => events.push(['start', index]),
    onProgress: () => {},
    onEnded: () => events.push(['ended', engine.index]),
    log: (event, detail) => events.push([event, detail]),
    overlap: 0.008
  })
  return { engine, context, events }
}

// 1. A loaded track schedules the next one at its real end.
{
  const { engine, context } = build([30, 30, 30])
  await engine.load(0, true)
  await settle()
  await settle()
  const start = context.currentTime + 0.02
  near('join lands at end of track', engine.scheduledInfo?.startAt ?? -1, start + 30 - 0.008)
  check('next track is queued', engine.scheduledInfo?.index === 1, JSON.stringify(engine.scheduledInfo))
}

// 2. Promoting the queued track moves the engine to it.
{
  const { engine, context, events } = build([30, 30, 30])
  await engine.load(0, true)
  await settle()
  await settle()
  context.currentTime = (engine.scheduledInfo?.startAt ?? 0) + 0.001
  engine.tick()
  check('promotion advances the index', engine.index === 1, `index=${engine.index}`)
  check('promotion reports a start', events.some(([name, index]) => name === 'start' && index === 1))
}

// 3. Seeking near the end still queues the next track at the real end.
{
  const { engine, context } = build([30, 30, 30])
  await engine.load(0, true)
  await settle()
  await settle()
  context.currentTime = 10
  engine.seek(29.8)
  const queued = engine.scheduledInfo
  near('seek near end queues the next track immediately', queued?.startAt ?? -1, 10 + 0.02 + 0.2 - 0.008, 0.03)
}

// 4. Seeking to the very end advances on the next tick.
{
  const { engine, context } = build([30, 30, 30])
  await engine.load(0, true)
  await settle()
  await settle()
  context.currentTime = 10
  engine.seek(30)
  context.currentTime += 0.02
  engine.tick()
  context.currentTime += 0.05
  engine.tick()
  check('seek to end reaches the next track', engine.index === 1, `index=${engine.index}`)
}

// 5. Playing through a boundary keeps the chain going for several songs.
{
  const { engine, context } = build([18, 18, 18])
  await engine.load(0, true)
  for (let step = 0; step < 60; step += 1) {
    await settle()
    const queued = engine.scheduledInfo
    if (queued) context.currentTime = queued.startAt + 0.05
    engine.tick()
  }
  check('chain reaches the last track', engine.index === 2, `index=${engine.index}`)
}

// 6. Pause and resume keep the position.
{
  const { engine, context } = build([30, 30])
  await engine.load(0, true)
  await settle()
  context.currentTime = 8
  engine.pause()
  near('pause keeps position', engine.position, 7.98, 0.05)
  engine.play()
  near('resume continues from position', engine.position, 7.98, 0.05)
}

// 7. The end of the queue reports ended exactly once.
{
  let ended = 0
  const context = new FakeContext()
  let engine
  engine = new GaplessEngine({
    context: () => context,
    fetchBytes: async () => bytesFor(5),
    nextIndex: () => null,
    onStart: () => {},
    onProgress: () => {},
    onEnded: () => {
      ended += 1
    }
  })
  await engine.load(0, true)
  context.currentTime = 6
  engine.tick()
  engine.tick()
  check('queue end reports ended once', ended === 1, `ended=${ended}`)
}

// 8. Repeat one loops through the same scheduled path.
{
  const { engine, context } = build([5, 5], { repeat: true })
  await engine.load(0, true)
  await settle()
  await settle()
  check('repeat one queues the same track', engine.scheduledInfo?.index === 0, JSON.stringify(engine.scheduledInfo))
  context.currentTime = (engine.scheduledInfo?.startAt ?? 0) + 0.05
  engine.tick()
  check('repeat one keeps playing', engine.playing && engine.index === 0)
}

console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
