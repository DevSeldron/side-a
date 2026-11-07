export type AuthStatus = 'signed-out' | 'signed-in' | 'demo' | 'needs-username' | 'checking'

export interface AuthState {
  status: AuthStatus
  username?: string
  fanId?: number
  displayName?: string
  photoUrl?: string
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

export interface UpdateInfo {
  available: boolean
  version?: string
  url?: string
  name?: string
  /** What the updater is doing right now, so the UI can follow along. */
  status?: 'idle' | 'checking' | 'downloading' | 'ready' | 'installing'
  /** Download progress from 0 to 1 while status is downloading. */
  percent?: number
  /** Human-readable reason when a check or install could not finish. */
  message?: string
}

export type DiscoverKind = 'artist' | 'album' | 'track'

export interface DiscoverResult {
  kind: DiscoverKind
  id: number
  bandId?: number
  bandName?: string
  title: string
  url: string
  artUrl?: string
  location?: string
  tags?: string[]
  releaseDate?: string
}

export interface DiscoverArtist {
  bandId: number
  name: string
  url: string
  image?: string
  bio?: string
  releases: DiscoverResult[]
}

export interface DiscoverAlbum {
  bandId: number
  tralbumId: number
  tralbumType: TralbumType
  title: string
  bandName: string
  url: string
  artUrl?: string
  about?: string
  tracks: Track[]
}

export interface Track {
  id: number
  title: string
  artist: string
  number: number
  duration: number
  streamUrl?: string
  /** Every streaming rendition Bandcamp exposes for this track, keyed by format. */
  streamUrls?: Record<string, string>
  isStreamable?: boolean
}

/**
 * Bumped whenever a cached release detail would carry stale information, so
 * copies written by an older build are re-fetched instead of trusted. Version
 * 2 fixed the order track credits are chosen in: the storefront name is only a
 * fallback, never a credit.
 */
export const DETAILS_VERSION = 2

export interface AlbumDetail {
  key: string
  /** Cache marker, missing on details written before versioning. */
  version?: number
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

export type Accent = string

export type ThemeMode = 'dark' | 'light' | 'blurred-dark' | 'blurred-light'

export type TrackQuality = 'mp3-128' | 'mp3-v0' | 'mp3-320'

export interface TrackDownload {
  /** `<albumKey>:<trackId>` */
  id: string
  albumKey: string
  trackId: number
  title: string
  artist: string
  albumTitle: string
  quality: TrackQuality
  /** Format actually served by Bandcamp (it may fall back). */
  actualQuality?: string
  status: 'queued' | 'downloading' | 'done' | 'error'
  progress: number
  bytes: number
  totalBytes?: number
  filePath?: string
  error?: string
  startedAt: number
  completedAt?: number
}

export interface LocalTrack {
  /** Stable SHA-1 of the absolute file path. */
  id: string
  path: string
  fileName: string
  folder: string
  title: string
  artist: string
  albumArtist: string
  album: string
  /** Stable grouping key for an album/artist pair. */
  albumKey: string
  genre?: string
  year?: number
  trackNumber?: number
  discNumber?: number
  duration: number
  format: string
  container?: string
  codec?: string
  bitrate?: number
  sampleRate?: number
  bitsPerSample?: number
  lossless: boolean
  coverUrl?: string
  size: number
  modifiedAt: number
  addedAt: number
}

export interface LocalFolder {
  path: string
  addedAt: number
  lastScannedAt?: number
  trackCount: number
}

export type LocalScanStatus = 'idle' | 'scanning' | 'ready' | 'error'

export interface LocalScanState {
  status: LocalScanStatus
  scanned: number
  total: number
  message: string
  currentFile?: string
  error?: string
}

export interface LocalLibrarySnapshot {
  tracks: LocalTrack[]
  folders: LocalFolder[]
  scan: LocalScanState
  totalDuration: number
  lastScannedAt?: number
}

export interface ScrobbleInput {
  artist: string
  title: string
  album?: string
  albumArtist?: string
  duration?: number
  trackNumber?: number
  /** Unix timestamp (seconds) for when the track started playing. */
  timestamp: number
  /** Stable key used to de-duplicate queued scrobbles. */
  key: string
}

export interface PresenceInput {
  playing: boolean
  title: string
  artist: string
  album?: string
  /** Band or label the release belongs to. */
  band?: string
  duration?: number
  position: number
  coverUrl?: string
  itemUrl?: string
}

export interface LastfmConfig {
  apiKey: string
  apiSecret: string
  sessionKey: string
  username?: string
  enabled: boolean
  pending: ScrobbleInput[]
}

export type DiscordActivityType = 'listening' | 'playing' | 'watching'

export interface DiscordPatch {
  enabled?: boolean
  clientId?: string
  detailsTemplate?: string
  stateTemplate?: string
  showTimestamps?: boolean
  showButton?: boolean
  activityType?: DiscordActivityType
}

export interface DiscordConfig {
  enabled: boolean
  clientId: string
  /** Template for the first line. Tokens: {title} {artist} {album} {band}. */
  detailsTemplate: string
  /** Template for the second line. Tokens: {title} {artist} {album} {band}. */
  stateTemplate: string
  showTimestamps: boolean
  showButton: boolean
  activityType: DiscordActivityType
}

export interface IntegrationsConfig {
  lastfm: LastfmConfig
  discord: DiscordConfig
}

export interface LastfmState {
  configured: boolean
  connected: boolean
  username?: string
  enabled: boolean
  pending: number
  error?: string
}

export interface DiscordState {
  configured: boolean
  enabled: boolean
  connected: boolean
  clientId?: string
  error?: string
  detailsTemplate: string
  stateTemplate: string
  showTimestamps: boolean
  showButton: boolean
  activityType: DiscordActivityType
}

export interface IntegrationsState {
  lastfm: LastfmState
  discord: DiscordState
}

export interface Settings {
  purchaseFormat: string
  downloadDir: string
  prefetchDetails: boolean
  reduceMotion: boolean
  /** Hex colour, e.g. #66e0cc. */
  accent: string
  theme: ThemeMode
  coverTheme: boolean
  backgroundGradient: boolean
  gradientPosition: 'top' | 'bottom'
  mountainBackdrop: boolean
  /** Blur the playing release's artwork behind the app. */
  coverBackdrop: boolean
  /** Flat black canvas, independent of the light/dark theme. */
  solidBlack: boolean
  /** Pulse accent glows with the bass of the playing track. */
  beatGlow: boolean
  rainbow: boolean
  rainbowUnlocked: boolean
  showWishlist: boolean
  /** Quality used by direct track downloads. */
  trackQuality: TrackQuality
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
  integrations: IntegrationsState
  trackDownloads: Record<string, TrackDownload>
  liked: Record<string, LikedTrack>
  local: LocalLibrarySnapshot
  demo: boolean
  appVersion: string
}

export interface LikedTrack {
  /** `${albumKey}:${trackId}`, used as the record key. */
  key: string
  albumKey: string
  id: number
  title: string
  artist: string
  bandName: string
  albumTitle: string
  coverUrl: string
  itemUrl?: string
  duration: number
  likedAt: number
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
  'download:changed': TrackDownload
  'likes:changed': Record<string, LikedTrack>
  'integration:changed': IntegrationsState
  'library:changed': { collectionCount: number; wishlistCount: number; lastSyncedAt?: number }
  'local:changed': LocalLibrarySnapshot
  'local:scan': LocalScanState
  'update:changed': UpdateInfo
}

export type LibraryEvent = keyof LibraryEventMap

export interface SideAAPI {
  /** Host platform, so the renderer can adjust window chrome. */
  platform: string
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
    /** Whole track bytes, so the next song can be decoded before it is needed. */
    buffer: (albumKey: string, trackId: number) => Promise<ArrayBuffer>
    /** Appends one line to the playback log in the app's data directory. */
    log: (event: string, detail?: Record<string, unknown>) => Promise<void>
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
  downloads: {
    track: (albumKey: string, trackId: number, quality: TrackQuality) => Promise<TrackDownload>
    reveal: (id: string) => Promise<void>
    /** Keys and ids whose saved file is still on disk. */
    saved: () => Promise<{ purchases: string[]; tracks: string[] }>
  }
  settings: {
    update: (patch: Partial<Settings>) => Promise<Settings>
    chooseDownloadDir: () => Promise<string | null>
    clearCaches: () => Promise<void>
  }
  artwork: {
    accent: (url: string) => Promise<string | null>
  }
  update: {
    /** Starts a real check; a newer release downloads in the background. */
    check: () => Promise<UpdateInfo>
    /** Current updater status, for a window that just opened. */
    state: () => Promise<UpdateInfo>
    /** Installs the downloaded release and restarts Side A. */
    install: () => Promise<void>
  }
  discover: {
    search: (query: string) => Promise<DiscoverResult[]>
    artist: (bandId: number) => Promise<DiscoverArtist>
    album: (bandId: number, tralbumId: number, tralbumType: TralbumType) => Promise<DiscoverAlbum>
    stream: (url: string) => Promise<StreamTicket>
  }
  local: {
    snapshot: () => Promise<LocalLibrarySnapshot>
    chooseFolder: () => Promise<LocalLibrarySnapshot | null>
    removeFolder: (path: string) => Promise<LocalLibrarySnapshot>
    rescan: () => Promise<LocalLibrarySnapshot>
    stream: (id: string) => Promise<StreamTicket>
    reveal: (id: string) => Promise<void>
  }
  integrations: {
    updateLastfm: (patch: { enabled?: boolean; apiKey?: string; apiSecret?: string }) => Promise<IntegrationsState>
    connectLastfm: () => Promise<IntegrationsState>
    disconnectLastfm: () => Promise<IntegrationsState>
    updateDiscord: (patch: DiscordPatch) => Promise<IntegrationsState>
    nowPlaying: (input: ScrobbleInput) => Promise<IntegrationsState>
    scrobble: (input: ScrobbleInput) => Promise<IntegrationsState>
    presence: (input: PresenceInput | null) => Promise<IntegrationsState>
    retryPending: () => Promise<IntegrationsState>
  }
  likes: {
    /** Adds the track to liked songs, or removes it when it is already liked. */
    toggle: (track: LikedTrack) => Promise<Record<string, LikedTrack>>
  }
  on: <K extends LibraryEvent>(
    event: K,
    callback: (payload: LibraryEventMap[K]) => void
  ) => () => void
}
