import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'

// Windows expects an ICO container. Since Vista the container may hold PNG
// frames directly, which keeps this script dependency-free apart from sharp and
// works on every platform (iconutil on macOS cannot write .ico).
const sizes = [16, 24, 32, 48, 64, 128, 256]
const root = new URL('..', import.meta.url).pathname
const buildDir = join(root, 'build')
const source = await readFile(join(buildDir, 'icon.png'))

const frames = []
for (const size of sizes) {
  frames.push({ size, png: await sharp(source).resize(size, size).png().toBuffer() })
}

const header = Buffer.alloc(6 + frames.length * 16)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(frames.length, 4)

let offset = header.length
frames.forEach((frame, index) => {
  const entry = 6 + index * 16
  header.writeUInt8(frame.size >= 256 ? 0 : frame.size, entry)
  header.writeUInt8(frame.size >= 256 ? 0 : frame.size, entry + 1)
  header.writeUInt8(0, entry + 2)
  header.writeUInt8(0, entry + 3)
  header.writeUInt16LE(1, entry + 4)
  header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(frame.png.length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += frame.png.length
})

await writeFile(join(buildDir, 'icon.ico'), Buffer.concat([header, ...frames.map((frame) => frame.png)]))
console.log(`Wrote build/icon.ico (${sizes.join(', ')}px)`)
