import { nativeImage } from 'electron'
import type { NativeImage } from 'electron'
import type { BandcampClient } from './bandcamp'
import type { Library } from './library'

const cache = new Map<string, string>()
const CACHE_LIMIT = 120

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  const lightness = (max + min) / 2
  let hue = 0
  if (delta > 0) {
    if (max === red) hue = ((green - blue) / delta) % 6
    else if (max === green) hue = (blue - red) / delta + 2
    else hue = (red - green) / delta + 4
    hue *= 60
    if (hue < 0) hue += 360
  }
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1))
  return [hue, saturation, lightness]
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const sector = hue / 60
  const second = chroma * (1 - Math.abs((sector % 2) - 1))
  const offset = lightness - chroma / 2
  let rgb: [number, number, number]
  if (sector < 1) rgb = [chroma, second, 0]
  else if (sector < 2) rgb = [second, chroma, 0]
  else if (sector < 3) rgb = [0, chroma, second]
  else if (sector < 4) rgb = [0, second, chroma]
  else if (sector < 5) rgb = [second, 0, chroma]
  else rgb = [chroma, 0, second]
  return `#${rgb.map((channel) => Math.round((channel + offset) * 255).toString(16).padStart(2, '0')).join('')}`
}

/**
 * Picks the strongest colourful region instead of averaging every pixel, which
 * usually turns busy covers into mud. The result is pulled into a sane
 * saturation and lightness range so it can act as a UI accent.
 */
function accentFromImage(image: NativeImage): string | null {
  if (image.isEmpty()) return null
  const sample = image.resize({ width: 64, height: 64, quality: 'good' })
  const size = sample.getSize()
  const bitmap = sample.toBitmap()
  if (!size.width || !size.height || bitmap.length < 4) return null

  const buckets = Array.from({ length: 24 }, () => ({ weight: 0, r: 0, g: 0, b: 0 }))
  for (let y = 0; y < size.height; y += 2) {
    for (let x = 0; x < size.width; x += 2) {
      const offset = (y * size.width + x) * 4
      const blue = bitmap[offset] ?? 0
      const green = bitmap[offset + 1] ?? 0
      const red = bitmap[offset + 2] ?? 0
      const [hue, saturation, lightness] = rgbToHsl(red, green, blue)
      if (lightness < 0.08 || lightness > 0.92 || saturation < 0.16) continue
      const weight = saturation * (1 - Math.abs(lightness - 0.55) * 0.8)
      const bucket = buckets[Math.floor(hue / 15) % buckets.length]
      if (!bucket) continue
      bucket.weight += weight
      bucket.r += red * weight
      bucket.g += green * weight
      bucket.b += blue * weight
    }
  }

  let best: (typeof buckets)[number] | null = null
  for (const bucket of buckets) {
    if (bucket.weight > (best?.weight ?? 0)) best = bucket
  }
  if (!best || best.weight < 2) return null

  const [hue, saturation, lightness] = rgbToHsl(
    best.r / best.weight,
    best.g / best.weight,
    best.b / best.weight
  )
  return hslToHex(hue, clamp(saturation, 0.48, 0.78), clamp(lightness, 0.48, 0.6))
}

function remember(url: string, accent: string): void {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  cache.set(url, accent)
}

function artworkImage(url: string, client: BandcampClient, library: Library): Promise<NativeImage | null> | NativeImage | null {
  const parsed = new URL(url)
  if (parsed.protocol === 'bcmedia:' && parsed.hostname === 'cover') {
    const key = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
    if (!/^[pt]\d+$/.test(key)) return null
    const path = library.localCover(key)
    if (!path) return null
    const image = nativeImage.createFromPath(path)
    return image.isEmpty() ? null : image
  }
  if (parsed.protocol !== 'https:' || !/(^|\.)bcbits\.com$/i.test(parsed.hostname)) return null
  return (async (): Promise<NativeImage | null> => {
    const response = await client.fetchRaw(parsed.toString(), { headers: { Accept: 'image/*' } })
    if (!response.ok) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > 10_000_000) return null
    const image = nativeImage.createFromBuffer(buffer)
    return image.isEmpty() ? null : image
  })()
}

export async function artworkAccent(
  url: string,
  client: BandcampClient,
  library: Library
): Promise<string | null> {
  const cached = cache.get(url)
  if (cached) return cached
  const image = await artworkImage(url, client, library)
  if (!image) return null
  const accent = accentFromImage(image)
  if (accent) remember(url, accent)
  return accent
}
