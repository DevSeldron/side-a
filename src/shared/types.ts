export type AuthStatus = 'signed-out' | 'signed-in' | 'demo' | 'needs-username' | 'checking'

export interface AuthState {
  status: AuthStatus
  username?: string
  fanId?: number
  displayName?: string
  error?: string
}

export type TralbumType = 'a' | 't'

export interface Album {
  /** Stable local key, derived from Bandcamp's item id (p123 / t123). */
  key: string
  itemId: number
  itemType: string
  tralbumId: number
  tralbumType: TralbumType
  bandId: number
  bandName: string
  bandUrl?: string
  title: string
  itemUrl: string
  artId?: number
  artUrl?: string
  added?: string
  purchased?: string
  downloadAvailable?: boolean
  /** True when Bandcamp exposes a re-download page for this purchase. */
  purchaseDownloadable?: boolean
  saleItemId?: number
  saleItemType?: string
  featuredTrackId?: number
  featuredTrackTitle?: string
  featuredTrackDuration?: number
  numTracks?: number
  isPrivate?: boolean
  hidden?: boolean
  genreId?: number
}

export interface Track {
  id: number
  title: string
  artist: string
  number: number
  duration: number
  streamUrl?: string
  isStreamable?: boolean
}

export interface AlbumDetail {
  key: string
  tralbumId: number
  tralbumType: TralbumType
  bandId: number
  bandName: string
  title: string
  artId?: number
  artUrl?: string
  about?: string
  credits?: string
  releaseDate?: string
  itemUrl?: string
  tracks: Track[]
  fetchedAt: number
}

export type OfflineStatus = 'none' | 'queued' | 'downloading' | 'ready' | 'error' | 'removing'

export interface OfflineEntry {
  key: string
  status: OfflineStatus
  progress: number
  done: number
  total: number
  bytes: number
  error?: string
  completedAt?: number
  coverPath?: string
  /** Track id → absolute path. Kept in the main process; renderer sees only status. */
  files?: Record<string, string>
}

export interface PurchaseFormat {
  id: string
  label: string
  description?: string
  size?: number
}

export type DownloadStatus = 'queued' | 'preparing' | 'downloading' | 'done' | 'error'

export interface PurchaseDownload {
  key: string
  title: string
  bandName: string
  format: string
  status: DownloadStatus
  progress: number
  bytes: number
  totalBytes?: number
  filePath?: string
  error?: string
  startedAt: number
  completedAt?: number
}

export type SyncStatus = 'idle' | 'syncing' | 'ready' | 'error'

export interface SyncState {
  status: SyncStatus
  progress: number
  message: string
  collectionCount: number
  wishlistCount: number
  lastSyncedAt?: number
  error?: string
}

export type Accent = 'teal' | 'ember' | 'violet'

export interface Settings {
  purchaseFormat: string
  downloadDir: string
  prefetchDetails: boolean
  reduceMotion: boolean
  accent: Accent
  showWishlist: boolean
}

export interface LibrarySnapshot {
  auth: AuthState
  collection: Album[]
  wishlist: Album[]
  details: Record<string, AlbumDetail>
  offline: Record<string, OfflineEntry>
  purchases: Record<string, PurchaseDownload>
  sync: SyncState
  settings: Settings
  demo: boolean
  appVersion: string
}

export interface StreamTicket {
  url: string
  expiresAt: number
}

export interface SaveAllResult {
  queued: number
  skipped: number
}

export interface LibraryEventMap {
  'auth:changed': AuthState
  'sync:changed': SyncState
  'offline:changed': OfflineEntry
  'purchase:changed': PurchaseDownload
  'settings:changed': Settings
  'library:changed': { collectionCount: number; wishlistCount: number; lastSyncedAt?: number }
}

export type LibraryEvent = keyof LibraryEventMap

export interface SideAAPI {
  getState: () => Promise<LibrarySnapshot>
  auth: {
    login: () => Promise<AuthState>
    logout: () => Promise<void>
    setUsername: (username: string) => Promise<AuthState>
    startDemo: () => Promise<AuthState>
  }
  library: {
    sync: () => Promise<LibrarySnapshot>
    album: (key: string, force?: boolean) => Promise<AlbumDetail>
    openExternal: (url: string) => Promise<void>
  }
  playback: {
    stream: (albumKey: string, trackId: number) => Promise<StreamTicket>
  }
  offline: {
    save: (key: string) => Promise<OfflineEntry>
    remove: (key: string) => Promise<void>
    saveAllPurchased: () => Promise<SaveAllResult>
    openFolder: () => Promise<void>
  }
  purchases: {
    formats: (key: string) => Promise<PurchaseFormat[]>
    download: (key: string, format: string) => Promise<PurchaseDownload>
    reveal: (key: string) => Promise<void>
  }
  settings: {
    update: (patch: Partial<Settings>) => Promise<Settings>
    chooseDownloadDir: () => Promise<string | null>
    clearCaches: () => Promise<void>
  }
  on: <K extends LibraryEvent>(
    event: K,
    callback: (payload: LibraryEventMap[K]) => void
  ) => () => void
}
