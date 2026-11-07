import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from 'node:fs'
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { protocol, shell } from 'electron'
import type {
  LocalFolder,
  LocalLibrarySnapshot,
  LocalScanState,
  LocalTrack,
  StreamTicket
} from '@shared/types'
import { getAppPaths } from './paths'
import { rangeResponse } from './media'

export const LOCAL_MEDIA_SCHEME = 'localmedia'

const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.flac',
  '.wav',
  '.wave',
  '.ogg',
  '.oga',
  '.opus',
  '.m4a',
  '.m4b',
  '.mp4',
  '.aac',
  '.aiff',
  '.aif',
  '.wma',
  '.ape',
  '.wv',
  '.mpc',
  '.dsf',
  '.dff',
  '.alac'
])

const COVER_NAMES = new Set([
  'cover.jpg',
  'cover.jpeg',
  'cover.png',
  'cover.webp',
  'folder.jpg',
  'folder.jpeg',
  'folder.png',
  'folder.webp',
  'front.jpg',
  'front.jpeg',
  'front.png',
  'front.webp',
  'album.jpg',
  'album.jpeg',
  'album.png',
  'album.webp',
  'artwork.jpg',
  'artwork.jpeg',
  'artwork.png',
  'artwork.webp'
])

const SKIP_DIRS = new Set([
  '.git',
  '.svn',
  '.hg',
  'node_modules',
  'System Volume Information',
  '$RECYCLE.BIN'
])

const COVER_MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp'
}

interface PersistedLocalState {
  version: number
  folders: LocalFolder[]
  tracks: LocalTrack[]
  lastScannedAt?: number
}

interface LocalLibraryEvents {
  onChanged: (snapshot: LocalLibrarySnapshot) => void
  onScan: (scan: LocalScanState) => void
}

let metadataModule: Promise<typeof import('music-metadata')> | null = null
let alacModule: Promise<typeof import('@mgz-dev/alac')> | null = null

function loadMetadataModule(): Promise<typeof import('music-metadata')> {
  if (!metadataModule) metadataModule = import('music-metadata')
  return metadataModule
}

function loadAlacModule(): Promise<typeof import('@mgz-dev/alac')> {
  if (!alacModule) alacModule = import('@mgz-dev/alac')
  return alacModule
}

function pathWithin(root: string, path: string): boolean {
  const base = resolve(root)
  const candidate = resolve(path)
  return candidate === base || candidate.startsWith(`${base}/`) || candidate.startsWith(`${base}\\`)
}

function hashFile(path: string): string {
  return createHash('sha1').update(resolve(path)).digest('hex')
}

function titleFromFile(path: string): string {
  return basename(path, extname(path))
    .replace(/^\d{1,3}[\s._-]+/, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || basename(path)
}

function leadingTrackNumber(path: string): number | undefined {
  const match = /^(\d{1,3})[\s._-]+/.exec(basename(path, extname(path)))
  if (!match) return undefined
  const value = Number(match[1])
  return Number.isFinite(value) && value > 0 ? value : undefined
}

function albumKey(albumArtist: string, album: string): string {
  return createHash('sha1').update(`${albumArtist}\u0000${album}`).digest('hex')
}

/** Loose files inherit their folder name as the album. A single-track group
 * with no real album tag should take the track's own name instead. */
function normalizeSingleAlbums(tracks: LocalTrack[]): LocalTrack[] {
  const counts = new Map<string, number>()
  for (const track of tracks) counts.set(track.albumKey, (counts.get(track.albumKey) ?? 0) + 1)
  let changed = false
  const normalized = tracks.map((track) => {
    if (counts.get(track.albumKey) !== 1) return track
    const folderName = basename(dirname(track.path))
    if (track.album !== folderName && track.album !== 'Unknown album') return track
    changed = true
    return {
      ...track,
      album: track.title,
      albumKey: albumKey(track.albumArtist, track.title)
    }
  })
  return changed ? normalized : tracks
}

function extendedSampleRate(buffer: Buffer, offset: number): number {
  const exponent = buffer.readUInt16BE(offset) & 0x7fff
  const mantissa = buffer.readUInt32BE(offset + 2) * 2 ** 32 + buffer.readUInt32BE(offset + 6)
  return exponent === 0 || mantissa === 0 ? 0 : mantissa * 2 ** (exponent - 16383 - 63)
}

/**
 * Chromium has no AIFF demuxer. AIFF stores PCM samples big-endian, so a
 * small local conversion to WAV keeps the original files untouched while
 * letting the normal audio element play and seek them.
 */
function aiffToWav(buffer: Buffer): Buffer {
  if (buffer.toString('ascii', 0, 4) !== 'FORM') throw new Error('Invalid AIFF file')
  const formType = buffer.toString('ascii', 8, 12)
  if (formType !== 'AIFF' && formType !== 'AIFC') throw new Error('Unsupported AIFF container')

  let channels = 0
  let frames = 0
  let bits = 0
  let sampleRate = 0
  let compression = 'NONE'
  let sampleStart = -1
  let sampleLength = 0
  let offset = 12
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32BE(offset + 4)
    const start = offset + 8
    const end = start + size
    if (end > buffer.length) break
    if (id === 'COMM' && size >= 18) {
      channels = buffer.readUInt16BE(start)
      frames = buffer.readUInt32BE(start + 2)
      bits = buffer.readUInt16BE(start + 6)
      sampleRate = Math.round(extendedSampleRate(buffer, start + 8))
      if (formType === 'AIFC' && size >= 22) compression = buffer.toString('ascii', start + 18, start + 22)
    }
    if (id === 'SSND' && size >= 8) {
      const dataOffset = buffer.readUInt32BE(start)
      sampleStart = start + 8 + dataOffset
      sampleLength = Math.min(size - 8 - dataOffset, buffer.length - sampleStart)
    }
    offset = end + (size % 2)
  }

  if (!channels || !frames || !bits || !sampleRate || sampleStart < 0) {
    throw new Error('Incomplete AIFF audio data')
  }
  if (![8, 16, 24, 32].includes(bits)) throw new Error(`Unsupported AIFF bit depth: ${bits}`)
  if (compression !== 'NONE' && compression !== 'sowt' && compression !== 'fl32' && compression !== 'fl64') {
    throw new Error(`Unsupported AIFF compression: ${compression}`)
  }

  const bytesPerSample = bits / 8
  const dataBytes = Math.min(sampleLength, frames * channels * bytesPerSample)
  const pcm = Buffer.allocUnsafe(dataBytes)
  const littleEndian = compression === 'sowt'
  const float = compression === 'fl32' || compression === 'fl64'
  for (let index = 0; index + bytesPerSample <= dataBytes; index += bytesPerSample) {
    const source = sampleStart + index
    if (littleEndian) {
      buffer.copy(pcm, index, source, source + bytesPerSample)
    } else if (bytesPerSample === 1) {
      pcm[index] = buffer[source]! + 128
    } else {
      for (let byte = 0; byte < bytesPerSample; byte += 1) {
        pcm[index + byte] = buffer[source + bytesPerSample - 1 - byte]!
      }
    }
  }

  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(float ? 3 : 1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * channels * bytesPerSample, 28)
  header.writeUInt16LE(channels * bytesPerSample, 32)
  header.writeUInt16LE(bits, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

function wavHeader(dataBytes: number, channels: number, sampleRate: number, bits: number): Buffer {
  const paddedBytes = dataBytes + (dataBytes % 2)
  if (paddedBytes + 36 > 0xffffffff) throw new Error('This track is too long to prepare for playback')
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + paddedBytes, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * channels * (bits / 8), 28)
  header.writeUInt16LE(channels * (bits / 8), 32)
  header.writeUInt16LE(bits, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataBytes, 40)
  return header
}

/**
 * Chromium cannot decode Apple Lossless either, even though it recognises the
 * M4A container. Decode it to a temporary PCM WAV in the app cache so the
 * normal audio element can play and seek it without changing the original.
 */
async function alacToWav(path: string, target: string): Promise<void> {
  const { openTrack, decodeTrack, closeTrack } = await loadAlacModule()
  const track = openTrack(await readFile(path))
  if (!track) throw new Error('This M4A file does not contain an ALAC track')
  try {
    if (track.bits !== 16 && track.bits !== 24) throw new Error(`Unsupported ALAC bit depth: ${track.bits}`)
    if (track.channels < 1 || track.channels > 2) throw new Error(`Unsupported ALAC channel count: ${track.channels}`)
    if (!track.samples || !track.sampleRate) throw new Error('This ALAC track has no audio samples')

    const dataBytes = track.samples * track.bytesPerSample
    const header = wavHeader(dataBytes, track.channels, track.sampleRate, track.bits)
    const handle = await open(target, 'w')
    let position = 0
    let written = 0
    try {
      await handle.write(header, 0, header.length, position)
      position += header.length
      const chunkFrames = Math.max(1, Math.floor(track.sampleRate * 5))
      for (let from = 0; from < track.samples; from += chunkFrames) {
        const wanted = Math.min(chunkFrames, track.samples - from)
        const pcm = decodeTrack(track, from, wanted)
        if (!pcm.length) throw new Error('This ALAC track could not be decoded')
        await handle.write(pcm, 0, pcm.length, position)
        position += pcm.length
        written += pcm.length
      }
      if (written !== dataBytes) throw new Error('This ALAC track decoded to an unexpected length')
      if (dataBytes % 2) await handle.write(Buffer.from([0]), 0, 1, position)
    } finally {
      await handle.close()
    }
  } finally {
    closeTrack(track)
  }
}

export function registerLocalMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: LOCAL_MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
        bypassCSP: true
      }
    }
  ])
}

export class LocalLibrary {
  private readonly dataFile: string
  private readonly coverRoot: string
  private readonly transcodedRoot: string
  private state: PersistedLocalState
  private scanState: LocalScanState
  private scanPromise: Promise<LocalLibrarySnapshot> | null = null
  private readonly tracksById = new Map<string, LocalTrack>()
  private readonly folderCovers = new Map<string, string | undefined>()
  private readonly conversions = new Map<string, Promise<string>>()

  constructor(private readonly events: LocalLibraryEvents) {
    const userData = getAppPaths().userData
    this.dataFile = join(userData, 'local-library.json')
    this.coverRoot = join(userData, 'local-covers')
    this.transcodedRoot = join(userData, 'local-transcoded')
    mkdirSync(this.coverRoot, { recursive: true })
    mkdirSync(this.transcodedRoot, { recursive: true })
    this.state = this.load()
    this.scanState = {
      status: this.state.folders.length ? 'ready' : 'idle',
      scanned: 0,
      total: this.state.tracks.length,
      message: this.state.folders.length
        ? `${this.state.tracks.length} local tracks indexed`
        : 'Add a folder to start your local library'
    }
    this.rebuildTrackMap()
  }

  private load(): PersistedLocalState {
    const base: PersistedLocalState = { version: 1, folders: [], tracks: [] }
    if (!existsSync(this.dataFile)) return base
    try {
      const parsed = JSON.parse(readFileSync(this.dataFile, 'utf8')) as Partial<PersistedLocalState>
      return {
        version: 1,
        folders: Array.isArray(parsed.folders) ? parsed.folders : [],
        tracks: Array.isArray(parsed.tracks) ? normalizeSingleAlbums(parsed.tracks) : [],
        lastScannedAt: typeof parsed.lastScannedAt === 'number' ? parsed.lastScannedAt : undefined
      }
    } catch (error) {
      console.warn('Could not read the local library index', error)
      return base
    }
  }

  private persist(): void {
    try {
      const temp = `${this.dataFile}.tmp`
      writeFileSync(temp, JSON.stringify(this.state), 'utf8')
      renameSync(temp, this.dataFile)
    } catch (error) {
      console.warn('Could not save the local library index', error)
    }
  }

  private rebuildTrackMap(): void {
    this.tracksById.clear()
    for (const track of this.state.tracks) this.tracksById.set(track.id, track)
  }

  private emitScan(patch: Partial<LocalScanState>): void {
    this.scanState = { ...this.scanState, ...patch }
    this.events.onScan(this.scanState)
  }

  snapshot(): LocalLibrarySnapshot {
    return {
      tracks: this.state.tracks,
      folders: this.state.folders.map((folder) => ({
        ...folder,
        trackCount: this.state.tracks.filter((track) => pathWithin(folder.path, track.path)).length
      })),
      scan: this.scanState,
      totalDuration: this.state.tracks.reduce((total, track) => total + (track.duration || 0), 0),
      lastScannedAt: this.state.lastScannedAt
    }
  }

  register(): void {
    protocol.handle(LOCAL_MEDIA_SCHEME, async (request) => {
      try {
        const response = await this.handleMedia(request)
        // The visualizer reads local audio through Web Audio, which only sees
        // cross-origin media when the response is CORS-clean.
        const headers = new Headers(response.headers)
        headers.set('Access-Control-Allow-Origin', '*')
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers
        })
      } catch (error) {
        console.error('Local media request failed', request.url, error)
        return new Response(null, { status: 500 })
      }
    })
  }

  addFolder(path: string): void {
    const normalized = resolve(path)
    if (this.state.folders.some((folder) => resolve(folder.path) === normalized)) return
    this.state.folders.push({
      path: normalized,
      addedAt: Date.now(),
      trackCount: 0
    })
    this.persist()
    this.events.onChanged(this.snapshot())
  }

  removeFolder(path: string): LocalLibrarySnapshot {
    const normalized = resolve(path)
    this.state.folders = this.state.folders.filter((folder) => resolve(folder.path) !== normalized)
    this.state.tracks = this.state.tracks.filter((track) => !pathWithin(normalized, track.path))
    this.rebuildTrackMap()
    this.scanState = {
      ...this.scanState,
      status: this.state.folders.length ? 'ready' : 'idle',
      scanned: this.state.tracks.length,
      total: this.state.tracks.length,
      message: this.state.folders.length ? 'Folder removed' : 'Add a folder to start your local library'
    }
    this.persist()
    const snapshot = this.snapshot()
    this.events.onChanged(snapshot)
    return snapshot
  }

  async scan(): Promise<LocalLibrarySnapshot> {
    if (this.scanPromise) return this.scanPromise
    this.scanPromise = this.runScan().finally(() => {
      this.scanPromise = null
    })
    return this.scanPromise
  }

  private async runScan(): Promise<LocalLibrarySnapshot> {
    const roots = this.state.folders.map((folder) => resolve(folder.path)).filter(existsSync)
    if (!roots.length) {
      this.state.tracks = []
      this.rebuildTrackMap()
      this.state.lastScannedAt = Date.now()
      this.persist()
      this.emitScan({
        status: 'idle',
        scanned: 0,
        total: 0,
        message: 'Add a folder to start your local library',
        currentFile: undefined,
        error: undefined
      })
      const snapshot = this.snapshot()
      this.events.onChanged(snapshot)
      return snapshot
    }

    this.emitScan({
      status: 'scanning',
      scanned: 0,
      total: 0,
      message: 'Looking for audio files',
      currentFile: undefined,
      error: undefined
    })

    try {
      const files: string[] = []
      for (const root of roots) await this.walk(root, files)
      const previousByPath = new Map(this.state.tracks.map((track) => [track.path, track]))
      const tracks: LocalTrack[] = []
      let cursor = 0
      let finished = 0
      let lastEmit = 0

      this.emitScan({
        status: 'scanning',
        scanned: 0,
        total: files.length,
        message: files.length ? 'Reading tags and artwork' : 'No supported audio files found'
      })

      const workers = Array.from({ length: Math.min(4, Math.max(1, files.length)) }, async () => {
        while (true) {
          const index = cursor
          cursor += 1
          const file = files[index]
          if (!file) return
          const track = await this.readTrack(file, previousByPath.get(file))
          if (track) tracks.push(track)
          finished += 1
          const now = Date.now()
          if (now - lastEmit > 120 || finished === files.length) {
            lastEmit = now
            this.emitScan({
              status: 'scanning',
              scanned: finished,
              total: files.length,
              message: 'Reading tags and artwork',
              currentFile: basename(file)
            })
          }
        }
      })
      await Promise.all(workers)

      const indexedTracks = normalizeSingleAlbums(tracks)
      indexedTracks.sort((a, b) => {
        return (
          a.albumArtist.localeCompare(b.albumArtist) ||
          a.album.localeCompare(b.album) ||
          (a.discNumber ?? 1) - (b.discNumber ?? 1) ||
          (a.trackNumber ?? 999) - (b.trackNumber ?? 999) ||
          a.title.localeCompare(b.title)
        )
      })

      const scannedAt = Date.now()
      this.state.tracks = indexedTracks
      this.state.folders = this.state.folders.map((folder) => ({
        ...folder,
        lastScannedAt: scannedAt,
        trackCount: indexedTracks.filter((track) => pathWithin(folder.path, track.path)).length
      }))
      this.state.lastScannedAt = scannedAt
      this.rebuildTrackMap()
      this.persist()
      this.emitScan({
        status: 'ready',
        scanned: indexedTracks.length,
        total: indexedTracks.length,
        message: indexedTracks.length
          ? `${indexedTracks.length} ${indexedTracks.length === 1 ? 'track' : 'tracks'} indexed`
          : 'No supported audio files found',
        currentFile: undefined,
        error: undefined
      })
      const snapshot = this.snapshot()
      this.events.onChanged(snapshot)
      return snapshot
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The folder could not be scanned'
      this.emitScan({
        status: 'error',
        message: 'Could not scan this folder',
        error: message,
        currentFile: undefined
      })
      throw error
    }
  }

  private async walk(directory: string, files: string[]): Promise<void> {
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (error) {
      console.warn('Could not read music folder', directory, error)
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        await this.walk(path, files)
        continue
      }
      if (!entry.isFile()) continue
      if (AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) files.push(path)
    }
  }

  private async readTrack(path: string, previous?: LocalTrack): Promise<LocalTrack | undefined> {
    const fallbackArtist = 'Unknown artist'
    let parsed: Awaited<ReturnType<Awaited<ReturnType<typeof loadMetadataModule>>['parseFile']>> | undefined
    try {
      const { parseFile } = await loadMetadataModule()
      parsed = await parseFile(path, { duration: true })
    } catch (error) {
      console.warn('Could not read audio metadata', path, error)
    }

    let fileStat: Awaited<ReturnType<typeof stat>>
    try {
      fileStat = await stat(path)
    } catch (error) {
      console.warn('Could not stat local track', path, error)
      return undefined
    }

    const common = parsed?.common
    const format = parsed?.format
    const title = common?.title?.trim() || titleFromFile(path)
    const artist = common?.artist?.trim() || common?.albumartist?.trim() || fallbackArtist
    const albumArtist = common?.albumartist?.trim() || artist
    const album = common?.album?.trim() || basename(dirname(path)) || 'Unknown album'
    const ext = extname(path).toLowerCase()
    let coverUrl: string | undefined
    const picture = common?.picture?.[0]
    if (picture) {
      const mime = picture.format || 'image/jpeg'
      coverUrl = await this.saveCover(Buffer.from(picture.data), COVER_MIME_EXT[mime.toLowerCase()] ?? '.jpg')
    }
    if (!coverUrl) coverUrl = await this.folderCover(dirname(path))

    return {
      id: hashFile(path),
      path,
      fileName: basename(path),
      folder: dirname(path),
      title,
      artist,
      albumArtist,
      album,
      albumKey: albumKey(albumArtist, album),
      genre: common?.genre?.length ? common.genre.join(', ') : undefined,
      year: typeof common?.year === 'number' ? common.year : undefined,
      trackNumber: common?.track?.no ?? leadingTrackNumber(path),
      discNumber: common?.disk?.no ?? undefined,
      duration: typeof format?.duration === 'number' && format.duration > 0 ? format.duration : 0,
      format: ext.slice(1).toUpperCase() || 'AUDIO',
      container: format?.container,
      codec: format?.codec,
      bitrate: typeof format?.bitrate === 'number' ? Math.round(format.bitrate) : undefined,
      sampleRate: typeof format?.sampleRate === 'number' ? format.sampleRate : undefined,
      bitsPerSample: typeof format?.bitsPerSample === 'number' ? format.bitsPerSample : undefined,
      lossless: format?.lossless === true,
      coverUrl,
      size: fileStat.size,
      modifiedAt: fileStat.mtimeMs,
      addedAt: previous?.addedAt ?? Date.now()
    }
  }

  private async saveCover(data: Buffer, extension: string): Promise<string | undefined> {
    try {
      const hash = createHash('sha1').update(data).digest('hex')
      const fileName = `${hash}${extension}`
      const path = join(this.coverRoot, fileName)
      if (!existsSync(path)) await writeFile(path, data)
      return `${LOCAL_MEDIA_SCHEME}://cover/${fileName}`
    } catch (error) {
      console.warn('Could not cache local cover art', error)
      return undefined
    }
  }

  private async folderCover(folder: string): Promise<string | undefined> {
    if (this.folderCovers.has(folder)) return this.folderCovers.get(folder)
    let result: string | undefined
    try {
      const entries = await readdir(folder, { withFileTypes: true })
      const match = entries.find((entry) => entry.isFile() && COVER_NAMES.has(entry.name.toLowerCase()))
      if (match) {
        const path = join(folder, match.name)
        const data = await readFile(path)
        const mime = extname(match.name).toLowerCase()
        const extension = mime === '.png' ? '.png' : mime === '.webp' ? '.webp' : mime === '.gif' ? '.gif' : '.jpg'
        result = await this.saveCover(data, extension)
      }
    } catch {
      // A folder cover is optional; embedded artwork is preferred.
    }
    this.folderCovers.set(folder, result)
    return result
  }

  private async handleMedia(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.host === 'track') {
      const id = url.pathname.replace(/^\//, '')
      if (!/^[a-f0-9]{40}$/.test(id)) return new Response(null, { status: 400 })
      const track = this.tracksById.get(id)
      if (!track) return new Response(null, { status: 404 })
      try {
        await stat(track.path)
      } catch {
        return new Response(null, { status: 404 })
      }
      return rangeResponse(await this.playablePath(track), request)
    }
    if (url.host === 'cover') {
      const name = url.pathname.replace(/^\//, '')
      if (!/^[a-f0-9]{40}\.(jpg|jpeg|png|webp|gif)$/i.test(name)) return new Response(null, { status: 400 })
      const path = join(this.coverRoot, name)
      if (!existsSync(path)) return new Response(null, { status: 404 })
      return rangeResponse(path, request)
    }
    return new Response(null, { status: 404 })
  }

  async stream(id: string): Promise<StreamTicket> {
    const track = this.tracksById.get(id)
    if (!track) throw new Error('This local track is no longer indexed')
    try {
      await stat(track.path)
    } catch {
      throw new Error('This local track is no longer available')
    }
    await this.playablePath(track)
    return {
      url: `${LOCAL_MEDIA_SCHEME}://track/${id}`,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000
    }
  }

  async reveal(id: string): Promise<void> {
    const track = this.tracksById.get(id)
    if (!track) throw new Error('This local track is no longer indexed')
    shell.showItemInFolder(track.path)
  }

  private async playablePath(track: LocalTrack): Promise<string> {
    const extension = extname(track.path).toLowerCase()
    const aiff = extension === '.aiff' || extension === '.aif'
    const alac = track.codec?.toLowerCase() === 'alac'
    if (!aiff && !alac) return track.path
    const cachePath = join(this.transcodedRoot, `${track.id}-${Math.round(track.modifiedAt)}.wav`)
    if (existsSync(cachePath)) return cachePath
    const pending = this.conversions.get(cachePath)
    if (pending) return pending
    const conversion = this.convertToWav(track, aiff, cachePath).finally(() => {
      this.conversions.delete(cachePath)
    })
    this.conversions.set(cachePath, conversion)
    return conversion
  }

  private async convertToWav(track: LocalTrack, aiff: boolean, cachePath: string): Promise<string> {
    await mkdir(this.transcodedRoot, { recursive: true })
    const temp = `${cachePath}.${process.pid}.${Date.now()}.tmp`
    try {
      if (aiff) {
        await writeFile(temp, aiffToWav(await readFile(track.path)))
      } else {
        await alacToWav(track.path, temp)
      }
      await rename(temp, cachePath)
      return cachePath
    } catch (error) {
      await rm(temp, { force: true })
      throw error
    }
  }

  dispose(): void {
    this.persist()
    protocol.unhandle(LOCAL_MEDIA_SCHEME)
  }
}
