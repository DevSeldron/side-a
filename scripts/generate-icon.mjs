import { execFile } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import sharp from 'sharp'

const run = promisify(execFile)
const root = new URL('..', import.meta.url).pathname
const buildDir = join(root, 'build')
const iconset = join(buildDir, 'icon.iconset')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect x="72" y="72" width="880" height="880" rx="176" fill="#1f1f1f"/>
  <g transform="translate(142 142) scale(18.5)">
    <path d="M10.5 30.5 21.2 9.5h8.3L18.8 30.5z" fill="#1a7f76"/>
    <path d="M4 30.5 14.7 9.5h5.2L9.2 30.5z" fill="#2ad4c0"/>
  </g>
</svg>`

const entries = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024]
]

await mkdir(iconset, { recursive: true })
const source = Buffer.from(svg)
for (const [name, size] of entries) {
  await sharp(source).resize(size, size).png().toFile(join(iconset, name))
}
await sharp(source).resize(1024, 1024).png().toFile(join(buildDir, 'icon.png'))
await writeFile(join(buildDir, 'icon.svg'), svg)
await run('iconutil', ['-c', 'icns', iconset, '-o', join(buildDir, 'icon.icns')])
await rm(iconset, { recursive: true, force: true })
console.log('Wrote build/icon.icns and build/icon.png')
