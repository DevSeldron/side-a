import { existsSync } from 'node:fs'
import { mkdir, open, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { shell } from 'electron'
import type { Album, AlbumDetail, AuthState, OfflineEntry, SaveAllResult, SyncState } from '@shared/types'
import { absoluteArt, BandcampClient } from './bandcamp'
import { getAppPaths } from './paths'
import type { Store } from './store'

interface Manifest {
  album: AlbumDetail
  files: Record<string, string>
  cover?: string
  savedAt: number
}

export interface LibraryEvents {
  onSyncChanged: (state: SyncState) => void
  onOfflineChanged: (entry: OfflineEntry) => void
  onLibraryChanged: (payload: { collectionCount: number; wishlistCount: number; lastSyncedAt?: number }) => void
}

function safeName(input: string, fallback = 'Untitled'): string {
  const cleaned = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120)
  return cleaned || fallback
}

function contentLength(response: Response): number {
  const value = response.headers.get('content-length')
  const parsed = value ? Number.parseInt(value, 10) : 0
  return Number.isFinite(parsed) ? parsed : 0
}

async function streamToFile(
  response: Response,
  destination: string,
  onBytes?: (bytes: number, total: number) => void
): Promise<{ bytes: number; total: number }> {
  if (!response.ok) throw new Error(`Download failed (${response.status})`)
  if (!response.body) throw new Error('Download returned no data')
  const total = contentLength(response)
  await mkdir(join(destination, '..'), { recursive: true })
  const part = `${destination}.part`
  const handle = await open(part, 'w')
  const reader = response.body.getReader()
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      await handle.write(value)
      bytes += value.byteLength
      onBytes?.(bytes, total)
    }
  } catch (error) {
    await handle.close().catch(() => undefined)
    await rm(part, { force: true }).catch(() => undefined)
    throw error
  }
  await handle.close()
  await rename(part, destination)
  return { bytes, total }
}

export class Library {
  private detailRequests = new Map<string, Promise<AlbumDetail>>()
  private activeSaves = new Map<string, Promise<OfflineEntry>>()
  private queuedSaves = new Set<string>()
  private bulkQueue: Promise<void> = Promise.resolve()
  private bulkRunning = false
  private syncPromise: Promise<void> | null = null

  constructor(
    private readonly client: BandcampClient,
    private readonly store: Store,
    private readonly events: LibraryEvents
  ) {}

  async initOffline(): Promise<void> {
    const state = this.store.get()
    const updates: Array<[string, OfflineEntry | null]> = []
    for (const [key, entry] of Object.entries(state.offline)) {
      if (entry.status !== 'ready') {
        updates.push([key, { ...entry, status: 'error', error: 'This download was interrupted.', progress: 0 }])
        continue
      }
      const files = entry.files ?? {}
      const missing = Object.values(files).some((file) => {
        try {
          return !existsSync(file)
        } catch {
          return true
        }
      })
      if (missing || !Object.keys(files).length) {
        updates.push([key, { ...entry, status: 'error', error: 'The offline files are missing. Download again.', progress: 0 }])
      }
    }
    for (const [key, entry] of updates) {
      this.store.setOffline(key, entry)
      if (entry) this.events.onOfflineChanged(entry)
    }
  }

  private emitLibraryChanged(): void {
    const state = this.store.get()
    this.events.onLibraryChanged({
      collectionCount: state.collection.length,
      wishlistCount: state.wishlist.length,
      lastSyncedAt: state.sync.lastSyncedAt
    })
  }

  async sync(auth: AuthState, demo: boolean): Promise<void> {
    if (this.syncPromise) return this.syncPromise
    this.syncPromise = this.runSync(auth, demo).finally(() => {
      this.syncPromise = null
    })
    return this.syncPromise
  }

  private async runSync(auth: AuthState, demo: boolean): Promise<void> {
    const username = auth.username
    if (!username) throw new Error('Sign in to Bandcamp first.')
    const progressState: SyncState = {
      status: 'syncing',
      progress: 0,
      message: demo ? 'Loading the public demo collection…' : 'Connecting to Bandcamp…',
      collectionCount: 0,
      wishlistCount: 0,
      lastSyncedAt: this.store.get().sync.lastSyncedAt
    }
    this.store.update((state) => {
      state.sync = progressState
    })
    this.events.onSyncChanged(progressState)
    try {
      const result = await this.client.syncLibrary(username, auth.fanId, (progress) => {
        const next = this.store.setSync({
          status: 'syncing',
          progress: progress.progress,
          message: progress.message,
          collectionCount: progress.collectionCount,
          wishlistCount: progress.wishlistCount,
          error: undefined
        })
        this.events.onSyncChanged(next)
      })
      this.store.setCollection(result.collection, result.wishlist, result.redownloads)
      // Keep the display name fresh from the profile.
      this.store.update((state) => {
        if (result.fan.displayName) state.auth.displayName = result.fan.displayName
      })
      const done = this.store.get().sync
      this.events.onSyncChanged(done)
      this.emitLibraryChanged()
      if (this.store.get().settings.prefetchDetails) {
        void this.prefetch(result.collection.slice(0, 40))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not sync your Bandcamp library.'
      const failed = this.store.setSync({
        status: 'error',
        message: 'Could not sync',
        error: message
      })
      this.events.onSyncChanged(failed)
      throw error
    }
  }

  private async prefetch(albums: Album[]): Promise<void> {
    const queue = [...albums]
    const workers = Array.from({ length: 3 }, async () => {
      while (queue.length) {
        const album = queue.shift()
        if (!album) return
        try {
          await this.getDetail(album.key)
        } catch {
          // Prefetching is best effort.
        }
      }
    })
    await Promise.allSettled(workers)
  }

  findAlbum(key: string): Album | undefined {
    const state = this.store.get()
    return state.collection.find((album) => album.key === key) ?? state.wishlist.find((album) => album.key === key)
  }

  cachedDetail(key: string): AlbumDetail | undefined {
    return this.store.get().details[key]
  }

  async getDetail(key: string, force = false): Promise<AlbumDetail> {
    const album = this.findAlbum(key)
    if (!album) throw new Error('This release is no longer in your library.')
    const cached = this.store.get().details[key]
    if (!force && cached) return cached
    const existing = this.detailRequests.get(key)
    if (existing) return existing
    const request = this.client
      .fetchAlbumDetail(album, force)
      .then((detail) => {
        this.store.setDetail(detail)
        return detail
      })
      .finally(() => {
        this.detailRequests.delete(key)
      })
    this.detailRequests.set(key, request)
    return request
  }

  async resolveStream(albumKey: string, trackId: number): Promise<{ kind: 'local'; path: string } | { kind: 'remote'; url: string }> {
    const offline = this.store.get().offline[albumKey]
    if (offline?.status === 'ready') {
      const path = offline.files?.[String(trackId)]
      if (path) {
        try {
          await stat(path)
          return { kind: 'local', path }
        } catch {
          // Fall through to streaming if the file was removed behind our back.
        }
      }
    }
    const album = this.findAlbum(albumKey)
    if (!album) throw new Error('This release is no longer in your library.')
    const detail = await this.getDetail(albumKey)
    const result = await this.client.getStreamUrl(album, trackId, detail)
    if (result.detail.fetchedAt !== detail.fetchedAt) this.store.setDetail(result.detail)
    return { kind: 'remote', url: result.url }
  }

  localCover(key: string): string | undefined {
    const entry = this.store.get().offline[key]
    if (entry?.status === 'ready' && entry.coverPath) return entry.coverPath
    return undefined
  }

  async saveOffline(key: string): Promise<OfflineEntry> {
    const existing = this.activeSaves.get(key)
    if (existing) return existing
    const current = this.store.get().offline[key]
    if (current?.status === 'ready') return current
    if (this.queuedSaves.has(key)) return current ?? this.queuedEntry(key, 0)
    return this.startSave(key)
  }

  private queuedEntry(key: string, total: number): OfflineEntry {
    return {
      key,
      status: 'queued',
      progress: 0,
      done: 0,
      total,
      bytes: 0
    }
  }

  private startSave(key: string): Promise<OfflineEntry> {
    const promise = this.executeSave(key).finally(() => {
      this.activeSaves.delete(key)
      this.queuedSaves.delete(key)
    })
    this.activeSaves.set(key, promise)
    return promise
  }

  private async executeSave(key: string): Promise<OfflineEntry> {
    const album = this.findAlbum(key)
    if (!album) throw new Error('This release is no longer in your library.')
    const queued = this.store.get().offline[key]
    const total = Math.max(1, queued?.total || album.numTracks || 1)
    let entry: OfflineEntry = {
      key,
      status: 'queued',
      progress: 0,
      done: 0,
      total,
      bytes: 0
    }
    this.store.setOffline(key, entry)
    this.events.onOfflineChanged(entry)
    try {
      const detail = await this.getDetail(key, true)
      const tracks = detail.tracks
      if (!tracks.length) throw new Error('This release has no streamable tracks.')
      const root = getAppPaths().offlineRoot
      const folder = join(root, key)
      await rm(folder, { recursive: true, force: true })
      await mkdir(folder, { recursive: true })

      const coverUrl = absoluteArt(album, 10)
      let coverPath: string | undefined
      if (coverUrl) {
        try {
          const coverFile = join(folder, 'cover.jpg')
          const response = await this.client.fetchRaw(coverUrl, { headers: { Accept: 'image/*' } })
          await streamToFile(response, coverFile)
          coverPath = coverFile
        } catch (error) {
          console.warn('Could not cache cover art', error)
        }
      }

      entry = {
        key,
        status: 'downloading',
        progress: 0,
        done: 0,
        total: tracks.length,
        bytes: 0,
        coverPath
      }
      this.store.setOffline(key, entry)
      this.events.onOfflineChanged(entry)

      const files: Record<string, string> = {}
      let bytes = 0
      let done = 0
      let lastEmit = 0
      const usedNames = new Set<string>()
      for (const track of tracks) {
        const base = safeName(`${String(track.number).padStart(2, '0')} ${track.title}`, `${track.id}`)
        let name = `${base}.mp3`
        let counter = 2
        while (usedNames.has(name)) {
          name = `${base} (${counter}).mp3`
          counter += 1
        }
        usedNames.add(name)
        const destination = join(folder, name)
        const result = await this.client.getStreamUrl(album, track.id, detail)
        const response = await this.client.fetchRaw(result.url, {
          headers: {
            Accept: '*/*',
            Referer: 'https://bandcamp.com/'
          }
        })
        const saved = await streamToFile(response, destination, (current, totalBytes) => {
          const now = Date.now()
          if (now - lastEmit > 250) {
            lastEmit = now
            entry = {
              ...entry,
              progress: Math.min(0.99, (done + (totalBytes ? current / totalBytes : 0)) / tracks.length),
              bytes: bytes + current
            }
            this.store.setOffline(key, entry)
            this.events.onOfflineChanged(entry)
          }
        })
        bytes += saved.bytes
        done += 1
        files[String(track.id)] = destination
        entry = {
          ...entry,
          progress: Math.min(0.99, done / tracks.length),
          done,
          bytes
        }
        this.store.setOffline(key, entry)
        this.events.onOfflineChanged(entry)
      }

      const manifest: Manifest = { album: detail, files, cover: coverPath, savedAt: Date.now() }
      await writeFile(join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
      entry = {
        key,
        status: 'ready',
        progress: 1,
        done: tracks.length,
        total: tracks.length,
        bytes,
        coverPath,
        files,
        completedAt: Date.now()
      }
      this.store.setOffline(key, entry)
      this.events.onOfflineChanged(entry)
      return entry
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save this release offline.'
      try {
        await rm(join(getAppPaths().offlineRoot, key), { recursive: true, force: true })
      } catch {
        // Ignore cleanup failures.
      }
      const failed: OfflineEntry = {
        key,
        status: 'error',
        progress: 0,
        done: 0,
        total,
        bytes: 0,
        error: message
      }
      this.store.setOffline(key, failed)
      this.events.onOfflineChanged(failed)
      throw error
    }
  }

  async removeOffline(key: string): Promise<void> {
    const running = this.activeSaves.get(key)
    if (running) {
      await running.catch(() => undefined)
    }
    this.queuedSaves.delete(key)
    await rm(join(getAppPaths().offlineRoot, key), { recursive: true, force: true })
    this.store.setOffline(key, null)
    this.events.onOfflineChanged({
      key,
      status: 'none',
      progress: 0,
      done: 0,
      total: 0,
      bytes: 0
    })
  }

  async saveAllPurchased(): Promise<SaveAllResult> {
    if (this.bulkRunning) return { queued: 0, skipped: 0 }
    const state = this.store.get()
    const candidates = state.collection.filter((album) => {
      if (!album.purchased) return false
      const offline = state.offline[album.key]
      if (offline?.status === 'ready' || this.activeSaves.has(album.key) || this.queuedSaves.has(album.key)) return false
      return true
    })
    const purchasedCount = state.collection.filter((album) => album.purchased).length
    if (!candidates.length) return { queued: 0, skipped: purchasedCount }
    const keys: string[] = []
    for (const album of candidates) {
      keys.push(album.key)
      this.queuedSaves.add(album.key)
      const queued = this.queuedEntry(album.key, album.numTracks ?? 1)
      this.store.setOffline(album.key, queued)
      this.events.onOfflineChanged(queued)
    }
    this.bulkRunning = true
    this.bulkQueue = this.bulkQueue
      .then(async () => {
        for (const key of keys) {
          if (!this.queuedSaves.has(key)) continue
          try {
            await this.startSave(key)
          } catch (error) {
            console.warn('Bulk offline save failed for', key, error)
          }
        }
      })
      .finally(() => {
        this.bulkRunning = false
      })
    return { queued: keys.length, skipped: Math.max(0, purchasedCount - keys.length) }
  }

  async openOfflineFolder(): Promise<void> {
    await shell.openPath(getAppPaths().offlineRoot)
  }

  async clearCaches(): Promise<void> {
    this.store.update((state) => {
      state.details = {}
    })
    this.client.clearMemoryCache()
  }
}
