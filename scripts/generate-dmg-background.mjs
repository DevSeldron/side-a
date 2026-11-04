import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const width = 660
const height = 400
const arrowY = 214

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b0b10"/>
      <stop offset="0.55" stop-color="#101018"/>
      <stop offset="1" stop-color="#16121d"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.18" cy="0.1" r="0.9">
      <stop offset="0" stop-color="#66e0cc" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#66e0cc" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>
  <text x="40" y="66" fill="#f4f1e9" font-family="-apple-system, Helvetica Neue, sans-serif" font-size="26" font-weight="600" letter-spacing="-0.5">Side A</text>
  <text x="40" y="92" fill="#8d8a93" font-family="-apple-system, Helvetica Neue, sans-serif" font-size="12" letter-spacing="2.4">BANDCAMP PLAYER</text>
  <text x="330" y="${arrowY}" text-anchor="middle" fill="#c7c3ba" font-family="-apple-system, Helvetica Neue, sans-serif" font-size="13">Drag Side A into Applications to install</text>
  <g stroke="#66e0cc" stroke-opacity="0.5" stroke-width="2" fill="none">
    <path d="M268 ${arrowY - 34} H392" stroke-dasharray="6 7"/>
    <path d="M380 ${arrowY - 41} L393 ${arrowY - 34} L380 ${arrowY - 27}"/>
  </g>
  <text x="330" y="354" text-anchor="middle" fill="#66646d" font-family="-apple-system, Helvetica Neue, sans-serif" font-size="10.5" letter-spacing="1.4">UNSIGNED BUILD · RIGHT-CLICK OPEN THE FIRST TIME</text>
</svg>`

const output = join(process.cwd(), 'build', 'dmg-background.png')
mkdirSync(dirname(output), { recursive: true })
await sharp(Buffer.from(svg)).png().toFile(output)
console.log(`wrote ${output} (${width}x${height})`)
