import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const width = 660
const height = 400
const iconY = 196
const arrowY = iconY

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f7f2e7"/>
      <stop offset="0.6" stop-color="#f0e9da"/>
      <stop offset="1" stop-color="#e7ddc9"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#paper)"/>
  <circle cx="52" cy="48" r="130" fill="#66e0cc" opacity="0.10"/>
  <text x="44" y="70" fill="#191612" font-family="-apple-system, Helvetica Neue, sans-serif" font-size="27" font-weight="600" letter-spacing="-0.6">Side A</text>
  <text x="44" y="94" fill="#7c7666" font-family="-apple-system, Helvetica Neue, sans-serif" font-size="11.5" letter-spacing="2.6">BANDCAMP PLAYER</text>

  <g stroke="#0f8f7c" stroke-opacity="0.55" stroke-width="2" fill="none" stroke-linecap="round">
    <path d="M272 ${arrowY} H390" stroke-dasharray="1 9"/>
    <path d="M379 ${arrowY - 7} L391 ${arrowY} L379 ${arrowY + 7}"/>
  </g>

  <text x="330" y="336" text-anchor="middle" fill="#4b463a" font-family="-apple-system, Helvetica Neue, sans-serif" font-size="13">Drag Side A into Applications to install</text>
  <text x="330" y="372" text-anchor="middle" fill="#8d8474" font-family="-apple-system, Helvetica Neue, sans-serif" font-size="10" letter-spacing="1.5">UNSIGNED BUILD · OPEN ONCE VIA RIGHT-CLICK, OR RUN xattr -cr ON THE APP</text>
</svg>`

const output = join(process.cwd(), 'build', 'dmg-background.png')
mkdirSync(dirname(output), { recursive: true })
await sharp(Buffer.from(svg)).png().toFile(output)
console.log(`wrote ${output} (${width}x${height})`)
