import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const width = 660
const height = 400
const iconY = 176
const arrowY = iconY

const renderSvg = (scale) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${height * scale}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#f5f2ea"/>
  <rect width="${width}" height="4" fill="#18b9a7"/>
  <text x="44" y="60" fill="#171717" font-family="-apple-system, Helvetica Neue, sans-serif" font-size="28" font-weight="500" letter-spacing="-0.6">Side A</text>
  <text x="616" y="60" text-anchor="end" fill="#5e5e5e" font-family="-apple-system, Helvetica Neue, sans-serif" font-size="13">2.2.0</text>

  <g stroke="#149e8d" stroke-width="2.4" fill="none" stroke-linecap="round">
    <path d="M272 ${arrowY} H390" stroke-dasharray="1 9"/>
    <path d="M378 ${arrowY - 8} L392 ${arrowY} L378 ${arrowY + 8}"/>
  </g>

  <text x="330" y="310" text-anchor="middle" fill="#272727" font-family="-apple-system, Helvetica Neue, sans-serif" font-size="16">Drag Side A into Applications</text>
</svg>`

const buildDir = join(process.cwd(), 'build')
mkdirSync(buildDir, { recursive: true })

// Keep the 1x image at the exact DMG window size. electron-builder derives
// the Finder window from this image, while the @2x sibling supplies Retina detail.
const output = join(buildDir, 'dmg-background.png')
await sharp(Buffer.from(renderSvg(1))).withMetadata({ density: 72 }).png().toFile(output)
await sharp(Buffer.from(renderSvg(2))).withMetadata({ density: 144 }).png().toFile(join(buildDir, 'dmg-background@2x.png'))
console.log(`wrote ${output} (${width}x${height}) and dmg-background@2x.png (${width * 2}x${height * 2})`)
