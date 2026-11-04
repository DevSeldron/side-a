import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import type {
  IntegrationsState,
  LibrarySnapshot,
  OfflineEntry,
  PresenceInput,
  ScrobbleInput,
  Settings,
  TrackQuality
} from '@shared/types'
import { IPC } from '@shared/ipc'
import type { AuthManager } from './auth'
import type { BandcampClient } from './bandcamp'
import type { DiscordService, DiscordUpdate } from './discord'
import type { LastfmService } from './lastfm'
import type { Library } from './library'
import type { MediaGateway } from './media'
import type { PurchaseManager } from './purchases'
import type { Store, } from './store'
import { normalizeAccent } from './store'
import { TRACK_QUALITIES, type TrackDownloadManager } from './trackDownloads'
import { checkForUpdate } from './updates'

interface IpcContext {
  client: BandcampClient
  store: Store
  library: Library
  purchases: PurchaseManager
  trackDownloads: TrackDownloadManager
  auth: AuthManager
  media: MediaGateway
  lastfm: LastfmService
  discord: DiscordService
  getMainWindow: () => BrowserWindow | null
}

function publicOffline(entry: OfflineEntry): OfflineEntry {
  const { files: _files, coverPath: _coverPath, ...rest } = entry
  return rest
}

function readText(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, limit) : undefined
}

function readScrobble(value: unknown): ScrobbleInput {
  if (!value || typeof value !== 'object') throw new Error('Invalid scrobble payload.')
  const input = value as Record<string, unknown>
  const artist = readText(input.artist, 300)
  const title = readText(input.title, 300)
  if (!artist || !title) throw new Error('A scrobble needs an artist and a title.')
  const timestamp = Number(input.timestamp)
  const duration = Number(input.duration)
  const trackNumber = Number(input.trackNumber)
  const seconds = Number.isFinite(timestamp) ? Math.floor(timestamp) : Math.floor(Date.now() / 1000)
  return {
    artist,
    title,
    album: readText(input.album, 300),
    albumArtist: readText(input.albumArtist, 300),
    duration: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : undefined,
    trackNumber: Number.isFinite(trackNumber) && trackNumber > 0 ? Math.round(trackNumber) : undefined,
    timestamp: seconds,
    key: readText(input.key, 300) ?? `${artist}\u0000${title}\u0000${seconds}`
  }
}

function readPresence(value: unknown): PresenceInput | null {
  if (value === null) return null
  if (!value || typeof value !== 'object') throw new Error('Invalid presence payload.')
  const input = value as Record<string, unknown>
  const artist = readText(input.artist, 300)
  const title = readText(input.title, 300)
  if (!artist || !title) throw new Error('Presence needs an artist and a title.')
  const position = Number(input.position)
  const duration = Number(input.duration)
  return {
    playing: input.playing === true,
    artist,
    title,
    album: readText(input.album, 300),
    band: readText(input.band, 300),
    duration: Number.isFinite(duration) && duration > 0 ? duration : undefined,
    position: Number.isFinite(position) && position > 0 ? position : 0,
    coverUrl: readText(input.coverUrl, 2048),
    itemUrl: readText(input.itemUrl, 2048)
  }
}

function integrationState(lastfm: LastfmService, discord: DiscordService): IntegrationsState {
  return { lastfm: lastfm.state(), discord: discord.state() }
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

export function registerIpc(context: IpcContext): void {
  const { client, store, library, purchases, trackDownloads, auth, media, lastfm, discord, getMainWindow } = context

  const snapshot = async (): Promise<LibrarySnapshot> => {
    const state = store.get()
    const authState = await auth.getState()
    const offline: Record<string, OfflineEntry> = {}
    for (const [key, entry] of Object.entries(state.offline)) offline[key] = publicOffline(entry)
    return {
      auth: authState,
      collection: state.collection,
      wishlist: state.wishlist,
      details: state.details,
      offline,
      purchases: state.purchases,
      trackDownloads: state.trackDownloads,
      sync: state.sync,
      settings: state.settings,
      integrations: integrationState(lastfm, discord),
      demo: authState.status === 'demo',
      appVersion: app.getVersion()
    }
  }

  const syncFor = async (): Promise<LibrarySnapshot> => {
    const authState = await auth.getState()
    if (authState.status !== 'signed-in' && authState.status !== 'demo') {
      throw new Error('Sign in to Bandcamp to sync your collection.')
    }
    await library.sync(authState, authState.status === 'demo')
    return snapshot()
  }

  ipcMain.handle(IPC.getState, () => snapshot())
  ipcMain.handle(IPC.updatesCheck, () => checkForUpdate())
  ipcMain.handle(IPC.discoverSearch, async (_event, query: unknown) => {
    if (typeof query !== 'string' || query.trim().length < 2) throw new Error('Type at least two characters to search.')
    return client.searchDiscover(query.trim().slice(0, 120))
  })
  ipcMain.handle(IPC.discoverArtist, async (_event, bandId: unknown) => {
    if (typeof bandId !== 'number' || !Number.isFinite(bandId)) throw new Error('Invalid artist id.')
    return client.fetchArtist(bandId)
  })
  ipcMain.handle(IPC.discoverAlbum, async (_event, bandId: unknown, tralbumId: unknown, tralbumType: unknown) => {
    if (typeof bandId !== 'number' || !Number.isFinite(bandId)) throw new Error('Invalid artist id.')
    if (typeof tralbumId !== 'number' || !Number.isFinite(tralbumId)) throw new Error('Invalid release id.')
    const type = tralbumType === 't' ? 't' : 'a'
    return client.fetchDiscoveredAlbum(bandId, tralbumId, type)
  })
  ipcMain.handle(IPC.discoverStream, async (_event, url: unknown) => {
    if (typeof url !== 'string') throw new Error('Invalid stream URL.')
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    if (parsed.protocol !== 'https:' || (host !== 'bandcamp.com' && !host.endsWith('.bcbits.com'))) {
      throw new Error('Invalid stream URL.')
    }
    return media.ticketForUrl(parsed.toString())
  })

  ipcMain.handle(IPC.authLogin, (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    return auth.login(parent)
  })
  ipcMain.handle(IPC.authLogout, async () => {
    await auth.logout()
    store.setSync({
      status: 'idle',
      progress: 0,
      message: 'Signed out',
      collectionCount: 0,
      wishlistCount: 0
    })
    broadcast(IPC.eventSync, store.get().sync)
    store.flush()
  })
  ipcMain.handle(IPC.authSetUsername, (_event, username: unknown) => {
    if (typeof username !== 'string') throw new Error('A username is required.')
    return auth.setUsername(username)
  })
  ipcMain.handle(IPC.authStartDemo, () => auth.startDemo())

  ipcMain.handle(IPC.librarySync, () => syncFor())
  ipcMain.handle(IPC.libraryAlbum, async (_event, key: unknown, force: unknown) => {
    if (typeof key !== 'string' || !/^[pt]\d+$/.test(key)) throw new Error('Invalid release id.')
    return library.getDetail(key, force === true)
  })

  ipcMain.handle(IPC.openExternal, async (_event, url: unknown) => {
    if (typeof url !== 'string') throw new Error('Invalid URL.')
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('Only web links can be opened.')
    await shell.openExternal(parsed.toString())
  })

  ipcMain.handle(IPC.playbackStream, async (_event, albumKey: unknown, trackId: unknown) => {
    if (typeof albumKey !== 'string' || !/^[pt]\d+$/.test(albumKey)) throw new Error('Invalid release id.')
    if (typeof trackId !== 'number' || !Number.isFinite(trackId)) throw new Error('Invalid track id.')
    return media.ticket(albumKey, trackId)
  })

  ipcMain.handle(IPC.offlineSave, async (_event, key: unknown) => {
    if (typeof key !== 'string' || !/^[pt]\d+$/.test(key)) throw new Error('Invalid release id.')
    const entry = await library.saveOffline(key)
    return publicOffline(entry)
  })
  ipcMain.handle(IPC.offlineRemove, async (_event, key: unknown) => {
    if (typeof key !== 'string' || !/^[pt]\d+$/.test(key)) throw new Error('Invalid release id.')
    await library.removeOffline(key)
  })
  ipcMain.handle(IPC.offlineSaveAll, () => library.saveAllPurchased())
  ipcMain.handle(IPC.offlineOpenFolder, () => library.openOfflineFolder())

  ipcMain.handle(IPC.purchaseFormats, async (_event, key: unknown) => {
    if (typeof key !== 'string' || !/^[pt]\d+$/.test(key)) throw new Error('Invalid release id.')
    return purchases.formats(key)
  })
  ipcMain.handle(IPC.purchaseDownload, async (_event, key: unknown, format: unknown) => {
    if (typeof key !== 'string' || !/^[pt]\d+$/.test(key)) throw new Error('Invalid release id.')
    if (typeof format !== 'string' || !/^[a-z0-9-]{1,32}$/i.test(format)) throw new Error('Invalid download format.')
    return purchases.download(key, format)
  })
  ipcMain.handle(IPC.purchaseReveal, async (_event, key: unknown) => {
    if (typeof key !== 'string' || !/^[pt]\d+$/.test(key)) throw new Error('Invalid release id.')
    await purchases.reveal(key)
  })

  ipcMain.handle(IPC.trackDownload, async (_event, key: unknown, trackId: unknown, quality: unknown) => {
    if (typeof key !== 'string' || !/^[pt]\d+$/.test(key)) throw new Error('Invalid release id.')
    if (typeof trackId !== 'number' || !Number.isFinite(trackId)) throw new Error('Invalid track id.')
    if (!TRACK_QUALITIES.includes(quality as TrackQuality)) throw new Error('Invalid download quality.')
    return trackDownloads.download(key, trackId, quality as TrackQuality)
  })
  ipcMain.handle(IPC.trackReveal, async (_event, id: unknown) => {
    if (typeof id !== 'string' || !/^[pt]\d+:\d+$/.test(id)) throw new Error('Invalid download id.')
    await trackDownloads.reveal(id)
  })

  ipcMain.handle(IPC.settingsUpdate, async (_event, patch: unknown) => {
    if (!patch || typeof patch !== 'object') throw new Error('Invalid settings.')
    const input = patch as Record<string, unknown>
    const allowed: Partial<Settings> = {}
    if (typeof input.prefetchDetails === 'boolean') allowed.prefetchDetails = input.prefetchDetails
    if (typeof input.reduceMotion === 'boolean') allowed.reduceMotion = input.reduceMotion
    if (typeof input.showWishlist === 'boolean') allowed.showWishlist = input.showWishlist
    if (typeof input.purchaseFormat === 'string' && /^[a-z0-9-]{1,32}$/i.test(input.purchaseFormat)) {
      allowed.purchaseFormat = input.purchaseFormat
    }
    if (typeof input.accent === 'string' && /^#[0-9a-f]{6}$/i.test(input.accent.trim())) {
      allowed.accent = normalizeAccent(input.accent)
    }
    if (input.theme === 'dark' || input.theme === 'light') allowed.theme = input.theme
    if (input.trackQuality === 'mp3-128' || input.trackQuality === 'mp3-v0' || input.trackQuality === 'mp3-320') {
      allowed.trackQuality = input.trackQuality
    }
    if (typeof input.downloadDir === 'string' && input.downloadDir.length > 0) {
      allowed.downloadDir = input.downloadDir
    }
    const settings = store.setSettings(allowed)
    if (allowed.downloadDir) await mkdir(allowed.downloadDir, { recursive: true }).catch(() => undefined)
    broadcast(IPC.eventSettings, settings)
    return settings
  })
  ipcMain.handle(IPC.settingsChooseDir, async () => {
    // Opened without a parent window on purpose. A macOS sheet disables its
    // parent window, and if the sheet fails to present (for example because the
    // default folder does not exist yet) the whole app stays disabled until it
    // is restarted. Only pass a default path that is actually there.
    const downloadDir = store.get().settings.downloadDir
    const options: Electron.OpenDialogOptions = {
      title: 'Choose where downloads are saved',
      properties: ['openDirectory', 'createDirectory']
    }
    if (existsSync(downloadDir)) options.defaultPath = downloadDir
    const result = await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    const settings = store.setSettings({ downloadDir: result.filePaths[0] })
    await mkdir(settings.downloadDir, { recursive: true }).catch(() => undefined)
    broadcast(IPC.eventSettings, settings)
    return settings.downloadDir
  })
  ipcMain.handle(IPC.settingsClearCaches, async () => {
    await library.clearCaches()
    await client.session.clearCache().catch(() => undefined)
  })

  // Every integration handler answers with the complete IntegrationsState.
  // Returning a single service's state here used to leave the renderer with a
  // snapshot whose `integrations.discord` was undefined, which crashed the
  // settings page on the next render.
  ipcMain.handle(IPC.lastfmUpdate, (_event, patch: unknown) => {
    if (!patch || typeof patch !== 'object') throw new Error('Invalid Last.fm settings.')
    const input = patch as Record<string, unknown>
    lastfm.update({
      enabled: typeof input.enabled === 'boolean' ? input.enabled : undefined,
      apiKey: typeof input.apiKey === 'string' ? input.apiKey : undefined,
      apiSecret: typeof input.apiSecret === 'string' ? input.apiSecret : undefined
    })
    return integrationState(lastfm, discord)
  })
  ipcMain.handle(IPC.lastfmConnect, async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender) ?? getMainWindow()
    await lastfm.connect(parent)
    return integrationState(lastfm, discord)
  })
  ipcMain.handle(IPC.lastfmDisconnect, () => {
    lastfm.disconnect()
    return integrationState(lastfm, discord)
  })
  ipcMain.handle(IPC.lastfmNowPlaying, async (_event, input: unknown) => {
    await lastfm.nowPlaying(readScrobble(input))
    return integrationState(lastfm, discord)
  })
  ipcMain.handle(IPC.lastfmScrobble, async (_event, input: unknown) => {
    await lastfm.scrobble(readScrobble(input))
    return integrationState(lastfm, discord)
  })
  ipcMain.handle(IPC.discordUpdate, (_event, patch: unknown) => {
    if (!patch || typeof patch !== 'object') throw new Error('Invalid Discord settings.')
    const input = patch as Record<string, unknown>
    if (typeof input.clientId === 'string' && input.clientId.trim() && !/^\d{15,25}$/.test(input.clientId.trim())) {
      throw new Error('A Discord application ID is a 15–25 digit number.')
    }
    const next: DiscordUpdate = {
      enabled: typeof input.enabled === 'boolean' ? input.enabled : undefined,
      clientId: typeof input.clientId === 'string' ? input.clientId : undefined,
      showTimestamps: typeof input.showTimestamps === 'boolean' ? input.showTimestamps : undefined,
      showButton: typeof input.showButton === 'boolean' ? input.showButton : undefined
    }
    if (typeof input.detailsTemplate === 'string') next.detailsTemplate = input.detailsTemplate.slice(0, 160)
    if (typeof input.stateTemplate === 'string') next.stateTemplate = input.stateTemplate.slice(0, 160)
    if (input.activityType === 'listening' || input.activityType === 'playing' || input.activityType === 'watching') {
      next.activityType = input.activityType
    }
    discord.update(next)
    return integrationState(lastfm, discord)
  })
  ipcMain.handle(IPC.discordPresence, async (_event, input: unknown) => {
    await discord.setPresence(readPresence(input))
    return integrationState(lastfm, discord)
  })
  ipcMain.handle(IPC.integrationsRetry, async () => {
    await lastfm.flush()
    return integrationState(lastfm, discord)
  })

}

export function broadcastEvent(channel: string, payload: unknown): void {
  broadcast(channel, payload)
}
