import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const width = 660
const height = 400
const iconY = 196
const arrowY = iconY

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#1f1f1f"/>
  <rect width="${width}" height="3" fill="#2ad4c0"/>
  <text x="44" y="64" fill="#ededed" font-family="-apple-system, Helvetica Neue, sans-serif" font-size="26" font-weight="500" letter-spacing="-0.5">Side A</text>
  <text x="616" y="64" text-anchor="end" fill="#7a7a7a" font-family="-apple-system, Helvetica Neue, sans-serif" font-size="12">2.1.1</text>

  <g stroke="#2ad4c0" stroke-width="2" fill="none" stroke-linecap="round">
    <path d="M272 ${arrowY} H390" stroke-dasharray="1 9"/>
    <path d="M379 ${arrowY - 7} L391 ${arrowY} L379 ${arrowY + 7}"/>
  </g>

  <text x="330" y="336" text-anchor="middle" fill="#cfcfcf" font-family="-apple-system, Helvetica Neue, sans-serif" font-size="13">Drag Side A into Applications</text>
  <text x="330" y="370" text-anchor="middle" fill="#7a7a7a" font-family="-apple-system, Helvetica Neue, sans-serif" font-size="9" letter-spacing="1.2">UNSIGNED BUILD. OPEN ONCE WITH RIGHT-CLICK, OR RUN xattr -cr</text>
</svg>`

const output = join(process.cwd(), 'build', 'dmg-background.png')
mkdirSync(dirname(output), { recursive: true })
await sharp(Buffer.from(svg)).png().toFile(output)
console.log(`wrote ${output} (${width}x${height})`)
