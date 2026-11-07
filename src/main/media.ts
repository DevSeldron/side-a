import { createReadStream, existsSync, statSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { protocol } from 'electron'
import type { Library } from './library'
import type { BandcampClient } from './bandcamp'
import type { Store } from './store'
import type { StreamTicket } from '@shared/types'

/** Whole-track buffering is capped so a huge file cannot exhaust memory. */
const MAX_BUFFER_BYTES = 96 * 1024 * 1024

interface TicketEntry {
  url: string
  albumKey: string
  trackId: number
  expiresAt: number
}

const MEDIA_SCHEME = 'bcmedia'

export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: true
      }
    }
  ])
}

export function mimeFor(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.mp3':
      return 'audio/mpeg'
    case '.m4a':
    case '.mp4':
      return 'audio/mp4'
    case '.flac':
      return 'audio/flac'
    case '.wav':
    case '.wave':
      return 'audio/wav'
    case '.ogg':
    case '.oga':
    case '.opus':
      return 'audio/ogg'
    case '.aif':
    case '.aiff':
      return 'audio/aiff'
    case '.wma':
      return 'audio/x-ms-wma'
    case '.ape':
      return 'audio/ape'
    case '.wv':
      return 'audio/wavpack'
    case '.dsf':
      return 'audio/dsf'
    case '.dff':
      return 'audio/dff'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const startRaw = match[1]
  const endRaw = match[2]
  let start = startRaw ? Number.parseInt(startRaw, 10) : 0
  let end = endRaw ? Number.parseInt(endRaw, 10) : size - 1
  if (!startRaw && endRaw) {
    start = Math.max(0, size - Number.parseInt(endRaw, 10))
    end = size - 1
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  start = Math.max(0, Math.min(start, size - 1))
  end = Math.max(start, Math.min(end, size - 1))
  return { start, end }
}

export function rangeResponse(path: string, request: Request): Response {
  const size = existsSync(path) ? statSync(path).size : 0
  if (!size) return new Response(null, { status: 404 })
  const range = parseRange(request.headers.get('Range'), size)
  const type = mimeFor(path)
  if (!range) {
    if (request.method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: {
          'Content-Type': type,
          'Content-Length': String(size),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store'
        }
      })
    }
    const body = Readable.toWeb(createReadStream(path)) as unknown as ReadableStream
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': type,
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store'
      }
    })
  }
  const { start, end } = range
  const length = end - start + 1
  if (request.method === 'HEAD') {
    return new Response(null, {
      status: 206,
      headers: {
        'Content-Type': type,
        'Content-Length': String(length),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store'
      }
    })
  }
  const body = Readable.toWeb(createReadStream(path, { start, end })) as unknown as ReadableStream
  return new Response(body, {
    status: 206,
    headers: {
      'Content-Type': type,
      'Content-Length': String(length),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store'
    }
  })
}


export class MediaGateway {
  private tickets = new Map<string, TicketEntry>()
  private sweeper: ReturnType<typeof setInterval>

  constructor(
    private readonly client: BandcampClient,
    private readonly library: Library,
    private readonly store: Store
  ) {
    this.sweeper = setInterval(() => this.sweep(), 10 * 60 * 1000)
    this.sweeper.unref?.()
  }

  register(): void {
    protocol.handle(MEDIA_SCHEME, async (request) => {
      try {
        return await this.handle(request)
      } catch (error) {
        console.error('Media request failed', request.url, error)
        return new Response(null, { status: 500 })
      }
    })
  }

  private sweep(): void {
    const now = Date.now()
    for (const [token, entry] of this.tickets) {
      if (entry.expiresAt < now) this.tickets.delete(token)
    }
  }

  async ticket(albumKey: string, trackId: number): Promise<StreamTicket> {
    const resolved = await this.library.resolveStream(albumKey, trackId)
    if (resolved.kind === 'local') {
      return {
        url: `${MEDIA_SCHEME}://local/${encodeURIComponent(albumKey)}/${trackId}`,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000
      }
    }
    const token = randomUUID()
    const expiresAt = Date.now() + 3 * 60 * 60 * 1000
    this.tickets.set(token, { url: resolved.url, albumKey, trackId, expiresAt })
    return { url: `${MEDIA_SCHEME}://stream/${token}`, expiresAt }
  }

  /**
   * The entire track as bytes. Decoding it locally lets the player schedule the
   * next song on the audio clock instead of waiting for a stream to open.
   */
  async buffer(albumKey: string, trackId: number): Promise<ArrayBuffer> {
    const resolved = await this.library.resolveStream(albumKey, trackId)
    if (resolved.kind === 'local') {
      const data = await readFile(resolved.path)
      return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
    }
    const response = await this.client.fetchRaw(resolved.url, {
      headers: { Accept: '*/*', Referer: 'https://bandcamp.com/' }
    })
    if (!response.ok) throw new Error(`Could not buffer this track (${response.status})`)
    const length = Number(response.headers.get('content-length') ?? 0)
    if (length > MAX_BUFFER_BYTES) throw new Error('This track is too large to buffer')
    const data = new Uint8Array(await response.arrayBuffer())
    if (data.byteLength > MAX_BUFFER_BYTES) throw new Error('This track is too large to buffer')
    return data.buffer as ArrayBuffer
  }

  /**
   * Tickets for releases that are not in the library (Discover). The URL is a
   * Bandcamp streaming rendition that needs the session cookies and a bandcamp
   * Referer, so it is proxied through this scheme instead of played directly.
   */
  ticketForUrl(url: string): StreamTicket {
    const token = randomUUID()
    const expiresAt = Date.now() + 3 * 60 * 60 * 1000
    this.tickets.set(token, { url, albumKey: '', trackId: 0, expiresAt })
    return { url: `${MEDIA_SCHEME}://stream/${token}`, expiresAt }
  }

  coverUrl(albumKey: string, remote?: string): string {
    const local = this.store.get().offline[albumKey]
    if (local?.status === 'ready' && local.coverPath) {
      return `${MEDIA_SCHEME}://cover/${encodeURIComponent(albumKey)}`
    }
    return remote ?? ''
  }

  private async handle(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.host === 'stream') {
      const token = url.pathname.replace(/^\//, '')
      const entry = this.tickets.get(token)
      if (!entry) return new Response(null, { status: 410 })
      if (entry.expiresAt < Date.now()) {
        this.tickets.delete(token)
        return new Response(null, { status: 410 })
      }
      const headers = new Headers()
      headers.set('Accept', '*/*')
      headers.set('Referer', 'https://bandcamp.com/')
      const range = request.headers.get('Range')
      if (range) headers.set('Range', range)
      const response = await this.client.fetchRaw(entry.url, { headers })
      const outgoing = new Headers()
      for (const name of [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges',
        'cache-control',
        'etag',
        'last-modified'
      ]) {
        const value = response.headers.get(name)
        if (value) outgoing.set(name, value)
      }
      if (!outgoing.has('accept-ranges')) outgoing.set('accept-ranges', 'bytes')
      return new Response(response.body, { status: response.status, headers: outgoing })
    }

    if (url.host === 'local') {
      const parts = url.pathname.split('/').filter(Boolean)
      const key = parts[0] ? decodeURIComponent(parts[0]) : ''
      const trackId = parts[1] ?? ''
      if (!/^[pt]\d+$/.test(key) || !/^\d+$/.test(trackId)) return new Response(null, { status: 400 })
      const entry = this.store.get().offline[key]
      const path = entry?.files?.[trackId]
      if (!path) return new Response(null, { status: 404 })
      try {
        await stat(path)
      } catch {
        return new Response(null, { status: 404 })
      }
      return rangeResponse(path, request)
    }

    if (url.host === 'cover') {
      const key = url.pathname.replace(/^\//, '')
      const entry = this.store.get().offline[key]
      if (!entry?.coverPath) return new Response(null, { status: 404 })
      try {
        await stat(entry.coverPath)
      } catch {
        return new Response(null, { status: 404 })
      }
      return rangeResponse(entry.coverPath, request)
    }

    return new Response(null, { status: 404 })
  }

  dispose(): void {
    clearInterval(this.sweeper)
    this.tickets.clear()
    protocol.unhandle(MEDIA_SCHEME)
  }
}
