import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const width = 660
const height = 400
const iconY = 176
const arrowY = iconY

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#f5f2ea"/>
  <rect width="${width}" height="4" fill="#18b9a7"/>
  <text x="44" y="60" fill="#171717" font-family="-apple-system, Helvetica Neue, sans-serif" font-size="28" font-weight="500" letter-spacing="-0.6">Side A</text>
  <text x="616" y="60" text-anchor="end" fill="#5e5e5e" font-family="-apple-system, Helvetica Neue, sans-serif" font-size="13">2.1.2</text>

  <g stroke="#149e8d" stroke-width="2.4" fill="none" stroke-linecap="round">
    <path d="M272 ${arrowY} H390" stroke-dasharray="1 9"/>
    <path d="M378 ${arrowY - 8} L392 ${arrowY} L378 ${arrowY + 8}"/>
  </g>

  <text x="330" y="310" text-anchor="middle" fill="#272727" font-family="-apple-system, Helvetica Neue, sans-serif" font-size="16">Drag Side A into Applications</text>
  <text x="330" y="348" text-anchor="middle" fill="#5e5e5e" font-family="-apple-system, Helvetica Neue, sans-serif" font-size="10" letter-spacing="0.8">UNSIGNED BUILD · RIGHT-CLICK TO OPEN</text>
</svg>`

const output = join(process.cwd(), 'build', 'dmg-background.png')
mkdirSync(dirname(output), { recursive: true })
await sharp(Buffer.from(svg)).png().toFile(output)
console.log(`wrote ${output} (${width}x${height})`)
