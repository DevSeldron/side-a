import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, rename, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { shell } from 'electron'
import type { TrackDownload, TrackQuality } from '@shared/types'
import type { BandcampClient } from './bandcamp'
import type { Library } from './library'
import type { Store } from './store'

export interface TrackDownloadEvents {
  onChanged: (entry: TrackDownload) => void
}

/**
 * Bandcamp only publishes a few renditions of each stream. Requests for a
 * higher quality degrade gracefully and the entry records what was served.
 */
const QUALITY_ORDER: Record<TrackQuality, string[]> = {
  'mp3-320': ['mp3-320', 'mp3-v0', 'mp3-v2', 'mp3-128'],
  'mp3-v0': ['mp3-v0', 'mp3-v2', 'mp3-128'],
  'mp3-128': ['mp3-128']
}

const QUALITY_LABEL: Record<string, string> = {
  'mp3-320': 'MP3 320',
  'mp3-v0': 'MP3 V0',
  'mp3-v2': 'MP3 V0',
  'mp3-128': 'MP3 128'
}

export const TRACK_QUALITIES: TrackQuality[] = ['mp3-128', 'mp3-v0', 'mp3-320']

function safeName(input: string, fallback = 'track'): string {
  const cleaned = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 110)
  return cleaned || fallback
}

async function uniqueDestination(directory: string, base: string, extension: string): Promise<string> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const suffix = attempt === 0 ? '' : ` (${attempt + 1})`
    const candidate = join(directory, `${base}${suffix}${extension}`)
    if (!existsSync(candidate)) return candidate
  }
  return join(directory, `${base}-${Date.now()}${extension}`)
}

async function writeResponse(
  response: Response,
  destination: string,
  onProgress: (bytes: number, total: number) => void
): Promise<number> {
  if (!response.ok) throw new Error(`Bandcamp returned ${response.status} for this track`)
  if (!response.body) throw new Error('Bandcamp returned an empty stream')
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

export class TrackDownloadManager {
  private active = new Map<string, Promise<TrackDownload>>()

  constructor(
    private readonly client: BandcampClient,
    private readonly store: Store,
    private readonly library: Library,
    private readonly events: TrackDownloadEvents
  ) {}

  async download(albumKey: string, trackId: number, quality: TrackQuality): Promise<TrackDownload> {
    const id = `${albumKey}:${trackId}`
    const running = this.active.get(id)
    if (running) return running
    const existing = this.store.get().trackDownloads[id]
    if (existing?.status === 'done' && existing.filePath && existsSync(existing.filePath)) return existing
    const promise = this.run(id, albumKey, trackId, quality).finally(() => {
      this.active.delete(id)
    })
    this.active.set(id, promise)
    return promise
  }

  async reveal(id: string): Promise<void> {
    const entry = this.store.get().trackDownloads[id]
    if (!entry?.filePath) throw new Error('That track has not finished downloading yet')
    shell.showItemInFolder(entry.filePath)
  }

  private set(entry: TrackDownload): void {
    this.store.setTrackDownload(entry.id, entry)
    this.events.onChanged(entry)
  }

  private async run(id: string, albumKey: string, trackId: number, quality: TrackQuality): Promise<TrackDownload> {
    const album = this.library.findAlbum(albumKey)
    if (!album) throw new Error('This release is no longer in your library')
    const detail = await this.library.getDetail(albumKey)
    const track = detail.tracks.find((entry) => entry.id === trackId)
    if (!track) throw new Error('That track is not part of this release')

    const streams = track.streamUrls ?? {}
    const chosen = QUALITY_ORDER[quality].find((key) => streams[key])
    const url = chosen ? streams[chosen] : track.streamUrl
    const actualQuality = chosen ?? 'mp3-128'
    if (!url) throw new Error('Bandcamp is not offering a downloadable stream for this track')

    const start: TrackDownload = {
      id,
      albumKey,
      trackId,
      title: track.title,
      artist: track.artist || detail.bandName,
      albumTitle: detail.title,
      quality,
      actualQuality: QUALITY_LABEL[actualQuality] ?? actualQuality.toUpperCase(),
      status: 'downloading',
      progress: 0,
      bytes: 0,
      startedAt: Date.now()
    }
    this.set(start)

    try {
      const directory = this.store.get().settings.downloadDir
      await mkdir(directory, { recursive: true })
      const base = safeName(`${start.artist} - ${track.title}`)
      const destination = await uniqueDestination(directory, base, '.mp3')
      const response = await this.client.fetchRaw(url, {
        headers: { Accept: '*/*', Referer: 'https://bandcamp.com/' }
      })
      let entry = start
      let lastEmit = 0
      const bytes = await writeResponse(response, destination, (current, total) => {
        const now = Date.now()
        if (now - lastEmit > 200) {
          lastEmit = now
          entry = {
            ...entry,
            progress: total ? Math.min(0.99, current / total) : 0,
            bytes: current,
            totalBytes: total || undefined
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
      return entry
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not download this track'
      const failed: TrackDownload = { ...start, status: 'error', progress: 0, error: message }
      this.set(failed)
      throw error
    }
  }
}
