import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

// One design, drawn in a 1200x630 coordinate space. The site uses it as is and
// GitHub's 1280x640 social preview fits the same drawing inside its canvas.
const WIDTH = 1200
const HEIGHT = 630
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

function starfield() {
  const rand = random(11)
  const dots = []
  for (let i = 0; i < 58; i++) {
    const x = Math.round(rand() * WIDTH)
    const y = Math.round(rand() * HEIGHT * 0.6)
    const r = (0.8 + rand() * 1.5).toFixed(2)
    const opacity = (0.26 + rand() * 0.6).toFixed(2)
    const halo = rand() > 0.85 ? ' filter="url(#starHalo)"' : ''
    dots.push(`<circle cx="${x}" cy="${y}" r="${r}" opacity="${opacity}"${halo} />`)
  }
  return dots.join('')
}

function ridge(base, amplitude, seed) {
  const rand = random(seed)
  const steps = 8
  const points = []
  for (let i = 0; i <= steps; i++) {
    const x = Math.round((i * WIDTH) / steps)
    const y = Math.round(base - rand() * amplitude)
    points.push(`${x},${y}`)
  }
  return `M0,${HEIGHT} L${points.join(' L')} L${WIDTH},${HEIGHT} Z`
}

// librsvg resolves fonts through fontconfig, which cannot read the site's woff2,
// so the card uses the platform grotesque directly instead of silently falling
// back when "Inter" is not installed.
const font = 'Helvetica Neue, Helvetica, Arial, sans-serif'

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
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

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sky)" />
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)" />

  <g fill="#96eadd">${starfield()}</g>

  <path d="${ridge(492, 38, 5)}" fill="${TEAL}" opacity="0.1" />
  <path d="${ridge(532, 28, 9)}" fill="${TEAL}" opacity="0.14" />
  <path d="${ridge(572, 22, 13)}" fill="${TEAL}" opacity="0.2" />

  <rect width="${WIDTH}" height="4" fill="${TEAL}" />

  <g font-family="${font}">
    <text x="88" y="104" font-size="30" font-weight="500" fill="#ededed" letter-spacing="-0.6">Side A</text>
    <text x="1112" y="100" font-size="18" fill="#7a7a7a" text-anchor="end">sidea.devseldron.xyz</text>

    <text x="88" y="238" font-size="66" font-weight="400" fill="#ededed" letter-spacing="-2">Your Bandcamp collection,</text>
    <text x="88" y="310" font-size="66" font-weight="400" fill="${TEAL}" letter-spacing="-2">redesigned.</text>

    <text x="88" y="374" font-size="22" fill="#d4d4d4">A Bandcamp player for macOS and Windows</text>
  </g>
</svg>`

const targets = [
  { file: join('site', 'assets', 'social-card.png'), width: WIDTH, height: HEIGHT, fit: 'fill' },
  { file: join('.github', 'social-preview.png'), width: 1280, height: 640, fit: 'contain' }
]

for (const { file, width, height, fit } of targets) {
  mkdirSync(join(file, '..'), { recursive: true })
  await sharp(Buffer.from(svg), { density: 144 })
    .resize(width, height, { fit, position: 'centre', background: '#212121' })
    .png({ compressionLevel: 9 })
    .toFile(file)
  console.log(`wrote ${file} (${width}x${height})`)
}
