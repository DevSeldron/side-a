import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, rename, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { Readable } from 'node:stream'
import { shell } from 'electron'
import type { Album, PurchaseDownload, PurchaseFormat } from '@shared/types'
import type { BandcampClient } from './bandcamp'
import type { Library } from './library'
import type { Store } from './store'
import { findRedownload } from './redownloads'

export interface PurchaseEvents {
  onPurchaseChanged: (entry: PurchaseDownload) => void
}

function safeName(input: string, fallback = 'download'): string {
  const cleaned = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 150)
  return cleaned || fallback
}

function parseFilename(disposition: string | null): string | undefined {
  if (!disposition) return undefined
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition)
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1])
    } catch {
      return star[1]
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition)
  return plain?.[1]
}

function extensionFor(contentType: string | null, format: string, suggested?: string): string {
  const suggestedExt = suggested ? extname(suggested) : ''
  if (suggestedExt && suggestedExt.length <= 6) return suggestedExt
  const type = (contentType ?? '').toLowerCase()
  if (type.includes('zip')) return '.zip'
  if (type.includes('flac')) return '.flac'
  if (type.includes('wav')) return '.wav'
  if (type.includes('aiff')) return '.aiff'
  if (type.includes('mpeg') || type.includes('mp3')) return '.mp3'
  const map: Record<string, string> = {
    flac: '.flac',
    'flac-16': '.flac',
    'flac-24': '.flac',
    wav: '.wav',
    aiff: '.aiff',
    'mp3-v0': '.mp3',
    'mp3-320': '.mp3',
    'mp3-128': '.mp3',
    alac: '.m4a',
    ogg: '.ogg'
  }
  return map[format] ?? '.zip'
}

async function uniqueDestination(directory: string, base: string, extension: string): Promise<string> {
  let attempt = 0
  while (attempt < 200) {
    const suffix = attempt === 0 ? '' : ` (${attempt + 1})`
    const candidate = join(directory, `${base}${suffix}${extension}`)
    if (!existsSync(candidate)) return candidate
    attempt += 1
  }
  return join(directory, `${base}-${Date.now()}${extension}`)
}

async function writeResponse(
  response: Response,
  destination: string,
  onProgress: (bytes: number, total: number) => void
): Promise<number> {
  if (!response.ok) throw new Error(`Bandcamp returned ${response.status} while downloading.`)
  if (!response.body) throw new Error('Bandcamp returned an empty download.')
  const total = Number.parseInt(response.headers.get('content-length') ?? '0', 10) || 0
  const part = `${destination}.part`
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(part)
    const source = Readable.fromWeb(response.body as unknown as import('node:stream/web').ReadableStream)
    let bytes = 0
    let lastReport = 0
    source.on('data', (chunk: Buffer) => {
      bytes += chunk.byteLength
      const now = Date.now()
      if (now - lastReport > 200) {
        lastReport = now
        onProgress(bytes, total)
      }
    })
    source.on('error', reject)
    output.on('error', reject)
    output.on('finish', () => {
      onProgress(bytes, total)
      resolve()
    })
    source.pipe(output)
  })
  const finished = await stat(part)
  await rename(part, destination)
  return finished.size
}

export class PurchaseManager {
  private active = new Set<string>()

  constructor(
    private readonly client: BandcampClient,
    private readonly store: Store,
    private readonly library: Library,
    private readonly events: PurchaseEvents
  ) {}

  init(): void {
    for (const [key, entry] of Object.entries(this.store.get().purchases)) {
      if (entry.status === 'queued' || entry.status === 'preparing' || entry.status === 'downloading') {
        this.store.setPurchase(key, {
          ...entry,
          status: 'error',
          error: 'This download was interrupted. Try again.',
          progress: 0
        })
      }
    }
  }

  private redownloadUrl(album: Album): string | undefined {
    if (!album.saleItemId) return undefined
    return findRedownload(this.store.get().redownloads, album.saleItemId, album.saleItemType)
  }

  requireAlbum(key: string): Album {
    const album = this.library.findAlbum(key)
    if (!album) throw new Error('This release is no longer in your library.')
    return album
  }

  async formats(key: string): Promise<PurchaseFormat[]> {
    const album = this.requireAlbum(key)
    const redownload = this.redownloadUrl(album)
    if (!redownload) throw new Error('Bandcamp does not expose a download for this purchase.')
    const info = await this.client.fetchPurchaseInfo(redownload)
    return info.formats
  }

  async download(key: string, requestedFormat: string): Promise<PurchaseDownload> {
    const album = this.requireAlbum(key)
    if (this.active.has(key)) {
      const current = this.store.get().purchases[key]
      if (current) return current
    }
    const redownload = this.redownloadUrl(album)
    if (!redownload) throw new Error('Bandcamp does not expose a download for this purchase.')
    if (this.active.has(key)) throw new Error('This purchase is already downloading.')

    const startEntry: PurchaseDownload = {
      key,
      title: album.title,
      bandName: album.bandName,
      format: requestedFormat,
      status: 'preparing',
      progress: 0,
      bytes: 0,
      startedAt: Date.now()
    }
    this.active.add(key)
    this.set(startEntry)
    try {
      const link = await this.client.resolvePurchaseDownload(redownload, requestedFormat)
      // No Referer here: Chromium refuses a manually set cross-origin Referer
      // on main-process fetches (net::ERR_BLOCKED_BY_CLIENT), and the signed
      // link does not need one.
      const response = await this.client.fetchRaw(link.url, {
        headers: { Accept: '*/*' }
      })
      if (!response.ok) throw new Error(`Bandcamp returned ${response.status} for the download.`)
      await mkdir(join(this.store.get().settings.downloadDir), { recursive: true })
      const disposition = parseFilename(response.headers.get('content-disposition'))
      const extension = extensionFor(response.headers.get('content-type'), requestedFormat, disposition ?? link.suggestedName)
      const base = safeName(`${link.info.artist || album.bandName} - ${link.info.title || album.title}`)
      const destination = await uniqueDestination(this.store.get().settings.downloadDir, base, extension)
      const totalBytes = Number.parseInt(response.headers.get('content-length') ?? '0', 10) || undefined

      let entry: PurchaseDownload = {
        ...startEntry,
        status: 'downloading',
        totalBytes
      }
      this.set(entry)
      let lastEmit = 0
      const bytes = await writeResponse(response, destination, (current, total) => {
        const now = Date.now()
        if (now - lastEmit > 250) {
          lastEmit = now
          entry = {
            ...entry,
            progress: total ? Math.min(0.99, current / total) : 0,
            bytes: current,
            totalBytes: total || totalBytes
          }
          this.set(entry)
        }
      })
      entry = {
        ...entry,
        status: 'done',
        progress: 1,
        bytes,
        totalBytes: entry.totalBytes ?? bytes,
        filePath: destination,
        completedAt: Date.now()
      }
      this.set(entry)
      this.active.delete(key)
      return entry
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not download this purchase.'
      const failed: PurchaseDownload = {
        ...startEntry,
        status: 'error',
        error: message
      }
      this.set(failed)
      this.active.delete(key)
      throw error
    }
  }

  async reveal(key: string): Promise<void> {
    const entry = this.store.get().purchases[key]
    if (!entry?.filePath) throw new Error('There is no downloaded file to show yet.')
    shell.showItemInFolder(entry.filePath)
  }

  private set(entry: PurchaseDownload): void {
    this.store.setPurchase(entry.key, entry)
    this.events.onPurchaseChanged(entry)
  }
}
