import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

// Drawn in a 1200-unit-wide design space. Each target keeps the design at its
// own aspect ratio instead of being letterboxed, so the ridges still reach the
// edges of the GitHub card.
const DESIGN_WIDTH = 1200
const TEAL = '#2ad4c0'

// Deterministic pseudo random values so the committed PNG stays byte stable.
function random(seed) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function starfield(height) {
  const rand = random(11)
  const dots = []
  for (let i = 0; i < 58; i++) {
    const x = Math.round(rand() * DESIGN_WIDTH)
    const y = Math.round(rand() * height * 0.6)
    const r = (0.8 + rand() * 1.5).toFixed(2)
    const opacity = (0.26 + rand() * 0.6).toFixed(2)
    const halo = rand() > 0.85 ? ' filter="url(#starHalo)"' : ''
    dots.push(`<circle cx="${x}" cy="${y}" r="${r}" opacity="${opacity}"${halo} />`)
  }
  return dots.join('')
}

function ridge(height, base, amplitude, seed) {
  const rand = random(seed)
  const steps = 8
  const points = []
  for (let i = 0; i <= steps; i++) {
    const x = Math.round((i * DESIGN_WIDTH) / steps)
    const y = Math.round(base - rand() * amplitude)
    points.push(`${x},${y}`)
  }
  return `M0,${height} L${points.join(' L')} L${DESIGN_WIDTH},${height} Z`
}

// librsvg resolves fonts through fontconfig, which cannot read the site's woff2,
// so the card uses the platform grotesque directly instead of silently falling
// back when "Inter" is not installed.
const font = 'Helvetica Neue, Helvetica, Arial, sans-serif'

function cardSvg(width, height) {
  const scale = width / DESIGN_WIDTH
  const h = height / scale

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${DESIGN_WIDTH} ${h}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#212121" />
      <stop offset="0.66" stop-color="#1c2523" />
      <stop offset="1" stop-color="#212121" />
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="1" r="0.72">
      <stop offset="0" stop-color="${TEAL}" stop-opacity="0.18" />
      <stop offset="1" stop-color="${TEAL}" stop-opacity="0" />
    </radialGradient>
    <filter id="starHalo" x="-150%" y="-150%" width="400%" height="400%">
      <feGaussianBlur stdDeviation="3" />
    </filter>
  </defs>

  <rect width="${DESIGN_WIDTH}" height="${h}" fill="url(#sky)" />
  <rect width="${DESIGN_WIDTH}" height="${h}" fill="url(#glow)" />

  <g fill="#96eadd">${starfield(h)}</g>

  <path d="${ridge(h, h - 138, 38, 5)}" fill="${TEAL}" opacity="0.1" />
  <path d="${ridge(h, h - 98, 28, 9)}" fill="${TEAL}" opacity="0.14" />
  <path d="${ridge(h, h - 58, 22, 13)}" fill="${TEAL}" opacity="0.2" />

  <rect width="${DESIGN_WIDTH}" height="4" fill="${TEAL}" />

  <g font-family="${font}">
    <text x="88" y="104" font-size="30" font-weight="500" fill="#ededed" letter-spacing="-0.6">Side A</text>
    <text x="1112" y="100" font-size="18" fill="#7a7a7a" text-anchor="end">sidea.devseldron.xyz</text>

    <text x="88" y="238" font-size="66" font-weight="400" fill="#ededed" letter-spacing="-2">Your Bandcamp collection,</text>
    <text x="88" y="310" font-size="66" font-weight="400" fill="${TEAL}" letter-spacing="-2">redesigned.</text>

    <text x="88" y="374" font-size="22" fill="#d4d4d4">A Bandcamp player for macOS and Windows</text>
  </g>
</svg>`
}

const targets = [
  { file: join('site', 'assets', 'social-card.png'), width: 1200, height: 630 },
  { file: join('.github', 'social-preview.png'), width: 1280, height: 640 }
]

for (const { file, width, height } of targets) {
  mkdirSync(join(file, '..'), { recursive: true })
  await sharp(Buffer.from(cardSvg(width, height)), { density: 144 })
    .resize(width, height, { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toFile(file)
  console.log(`wrote ${file} (${width}x${height})`)
}
