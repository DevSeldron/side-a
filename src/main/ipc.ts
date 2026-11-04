import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { mkdir } from 'node:fs/promises'
import type { Accent, LibrarySnapshot, OfflineEntry, Settings } from '@shared/types'
import { IPC } from '@shared/ipc'
import type { AuthManager } from './auth'
import type { BandcampClient } from './bandcamp'
import type { Library } from './library'
import type { MediaGateway } from './media'
import type { PurchaseManager } from './purchases'
import type { Store } from './store'

interface IpcContext {
  client: BandcampClient
  store: Store
  library: Library
  purchases: PurchaseManager
  auth: AuthManager
  media: MediaGateway
  getMainWindow: () => BrowserWindow | null
}

function publicOffline(entry: OfflineEntry): OfflineEntry {
  const { files: _files, coverPath: _coverPath, ...rest } = entry
  return rest
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

export function registerIpc(context: IpcContext): void {
  const { client, store, library, purchases, auth, media, getMainWindow } = context

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
      sync: state.sync,
      settings: state.settings,
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
    if (input.accent === 'teal' || input.accent === 'ember' || input.accent === 'violet') {
      allowed.accent = input.accent as Accent
    }
    if (typeof input.downloadDir === 'string' && input.downloadDir.length > 0) {
      allowed.downloadDir = input.downloadDir
    }
    const settings = store.setSettings(allowed)
    if (allowed.downloadDir) await mkdir(allowed.downloadDir, { recursive: true }).catch(() => undefined)
    broadcast(IPC.eventSettings, settings)
    return settings
  })
  ipcMain.handle(IPC.settingsChooseDir, async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender) ?? getMainWindow()
    const options = {
      title: 'Choose where purchased downloads are saved',
      defaultPath: store.get().settings.downloadDir,
      properties: ['openDirectory', 'createDirectory'] as const
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, { ...options, properties: [...options.properties] })
      : await dialog.showOpenDialog({ ...options, properties: [...options.properties] })
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

}

export function broadcastEvent(channel: string, payload: unknown): void {
  broadcast(channel, payload)
}
