import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type {
  Album,
  AlbumDetail,
  AuthState,
  IntegrationsConfig,
  OfflineEntry,
  PurchaseDownload,
  Settings,
  SyncState
} from '@shared/types'
import { getAppPaths } from './paths'

const VERSION = 1

export interface PersistedAuth {
  username?: string
  fanId?: number
  displayName?: string
}

export interface PersistedState {
  version: number
  auth: PersistedAuth
  collection: Album[]
  wishlist: Album[]
  details: Record<string, AlbumDetail>
  offline: Record<string, OfflineEntry>
  purchases: Record<string, PurchaseDownload>
  sync: SyncState
  settings: Settings
  integrations: IntegrationsConfig
  redownloads: Record<string, string>
}

export function defaultSettings(downloadDir: string): Settings {
  return {
    purchaseFormat: 'mp3-v0',
    downloadDir,
    prefetchDetails: false,
    reduceMotion: false,
    accent: 'teal',
    showWishlist: true
  }
}

export function emptySync(): SyncState {
  return {
    status: 'idle',
    progress: 0,
    message: 'Not synced yet',
    collectionCount: 0,
    wishlistCount: 0
  }
}

function defaultIntegrations(): IntegrationsConfig {
  return {
    lastfm: {
      apiKey: '',
      apiSecret: '',
      sessionKey: '',
      enabled: true,
      pending: []
    },
    discord: {
      enabled: false,
      clientId: '',
      detailsTemplate: '{title}',
      stateTemplate: '{artist} — {album}',
      showTimestamps: true,
      showButton: true,
      activityType: 'listening'
    }
  }
}

function defaults(downloadDir: string): PersistedState {
  return {
    version: VERSION,
    auth: {},
    collection: [],
    wishlist: [],
    details: {},
    offline: {},
    purchases: {},
    sync: emptySync(),
    settings: defaultSettings(downloadDir),
    integrations: defaultIntegrations(),
    redownloads: {}
  }
}

export class Store {
  private state: PersistedState
  private timer: ReturnType<typeof setTimeout> | null = null
  private dirty = false

  constructor(private readonly downloadDir: string) {
    const paths = getAppPaths()
    mkdirSync(dirname(paths.dataFile), { recursive: true })
    this.state = this.load(paths.dataFile)
  }

  private load(file: string): PersistedState {
    if (!existsSync(file)) return defaults(this.downloadDir)
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<PersistedState>
      const base = defaults(this.downloadDir)
      return {
        ...base,
        ...parsed,
        version: VERSION,
        auth: { ...base.auth, ...parsed.auth },
        settings: { ...base.settings, ...parsed.settings, downloadDir: parsed.settings?.downloadDir || this.downloadDir },
        sync: { ...base.sync, ...parsed.sync },
        integrations: {
          lastfm: { ...base.integrations.lastfm, ...parsed.integrations?.lastfm },
          discord: { ...base.integrations.discord, ...parsed.integrations?.discord }
        },
        details: parsed.details ?? {},
        offline: parsed.offline ?? {},
        purchases: parsed.purchases ?? {},
        collection: parsed.collection ?? [],
        wishlist: parsed.wishlist ?? [],
        redownloads: parsed.redownloads ?? {}
      }
    } catch (error) {
      console.error('Could not read library file, starting fresh', error)
      return defaults(this.downloadDir)
    }
  }

  get(): PersistedState {
    return this.state
  }

  update(mutator: (state: PersistedState) => void): PersistedState {
    mutator(this.state)
    this.dirty = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), 220)
    return this.state
  }

  setAuth(auth: PersistedAuth): void {
    this.update((state) => {
      state.auth = auth
    })
  }

  clearAuth(): void {
    this.update((state) => {
      state.auth = {}
    })
  }

  setCollection(collection: Album[], wishlist: Album[], redownloads: Record<string, string>): void {
    this.update((state) => {
      state.collection = collection
      state.wishlist = wishlist
      state.redownloads = redownloads
      state.sync = {
        ...state.sync,
        status: 'ready',
        progress: 1,
        message: 'Library up to date',
        collectionCount: collection.length,
        wishlistCount: wishlist.length,
        lastSyncedAt: Date.now()
      }
    })
  }

  setSync(patch: Partial<SyncState>): SyncState {
    this.update((state) => {
      state.sync = { ...state.sync, ...patch }
    })
    return this.state.sync
  }

  setOffline(key: string, entry: OfflineEntry | null): void {
    this.update((state) => {
      if (entry) state.offline[key] = entry
      else delete state.offline[key]
    })
  }

  setPurchase(key: string, entry: PurchaseDownload): void {
    this.update((state) => {
      state.purchases[key] = entry
    })
  }

  setDetail(detail: AlbumDetail): void {
    this.update((state) => {
      state.details[detail.key] = detail
    })
  }

  setSettings(patch: Partial<Settings>): Settings {
    this.update((state) => {
      state.settings = { ...state.settings, ...patch }
    })
    return this.state.settings
  }

  setIntegrations(mutator: (integrations: IntegrationsConfig) => void): IntegrationsConfig {
    this.update((state) => {
      mutator(state.integrations)
    })
    return this.state.integrations
  }

  getAuth(): AuthState {
    const { username, fanId, displayName } = this.state.auth
    if (!username) return { status: 'signed-out' }
    return { status: 'signed-in', username, fanId, displayName }
  }

  flush(): void {
    if (!this.dirty) return
    const file = getAppPaths().dataFile
    mkdirSync(dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    try {
      writeFileSync(tmp, JSON.stringify(this.state), 'utf8')
      renameSync(tmp, file)
      this.dirty = false
    } catch (error) {
      console.error('Could not write library file', error)
    }
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}

export function ensureDataDirs(): void {
  const paths = getAppPaths()
  for (const dir of [paths.userData, paths.offlineRoot, paths.mediaRoot, paths.logsRoot, join(paths.userData, 'tmp')]) {
    mkdirSync(dir, { recursive: true })
  }
}
