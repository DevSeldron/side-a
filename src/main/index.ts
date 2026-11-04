import { app, BrowserWindow, Menu, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import { AuthManager } from './auth'
import { BandcampClient } from './bandcamp'
import { Library } from './library'
import { MediaGateway, registerMediaScheme } from './media'
import { PurchaseManager } from './purchases'
import { ensureDataDirs, Store } from './store'
import { getAppPaths } from './paths'
import { broadcastEvent, registerIpc } from './ipc'
import { IPC } from '@shared/ipc'
import type { AuthState, OfflineEntry, PurchaseDownload, Settings, SyncState } from '@shared/types'

app.setName('Side A')
registerMediaScheme()

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null
  let store: Store
  let client: BandcampClient
  let library: Library
  let purchases: PurchaseManager
  let media: MediaGateway
  let auth: AuthManager

  const createWindow = async (): Promise<void> => {
    const win = new BrowserWindow({
      width: 1440,
      height: 920,
      minWidth: 1080,
      minHeight: 700,
      show: false,
      backgroundColor: '#08080b',
      title: 'Side A',
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 20, y: 24 },
      vibrancy: undefined,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false,
        backgroundThrottling: false
      }
    })
    mainWindow = win
    win.once('ready-to-show', () => {
      win.show()
      win.focus()
    })
    win.on('closed', () => {
      if (mainWindow === win) mainWindow = null
    })
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url).catch(() => undefined)
      return { action: 'deny' }
    })
    win.webContents.on('will-navigate', (event, url) => {
      const devUrl = process.env.ELECTRON_RENDERER_URL
      const allowed = url.startsWith('file://') || (devUrl ? url.startsWith(devUrl) : false)
      if (!allowed) {
        event.preventDefault()
        if (/^https?:\/\//i.test(url)) void shell.openExternal(url).catch(() => undefined)
      }
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      await win.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
      await win.loadFile(join(__dirname, '../renderer/index.html'))
    }
    if (process.env.SIDEA_DEVTOOLS === '1') win.webContents.openDevTools({ mode: 'detach' })
  }

  const buildMenu = (): void => {
    const template: MenuItemConstructorOptions[] = [
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' }
        ]
      },
      {
        label: 'Window',
        submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'Bandcamp Help',
            click: () => void shell.openExternal('https://bandcamp.com/help')
          },
          {
            label: 'Open Side A Data Folder',
            click: () => void shell.openPath(getAppPaths().userData)
          }
        ]
      }
    ]
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  }

  const wireEvents = (): void => {
    // Manager callbacks are wired when the managers are constructed. This block
    // documents the event contract and keeps the pure payload types nearby.
    void (null as unknown as AuthState)
    void (null as unknown as SyncState)
    void (null as unknown as OfflineEntry)
    void (null as unknown as PurchaseDownload)
    void (null as unknown as Settings)
  }

  app.whenReady().then(async () => {
    app.setAboutPanelOptions({
      applicationName: 'Side A',
      applicationVersion: app.getVersion(),
      copyright: 'A personal Bandcamp client. Not affiliated with Bandcamp.',
      credits: 'Your collection. Offline.'
    })
    ensureDataDirs()
    const downloadDir = join(app.getPath('downloads'), 'Side A')
    store = new Store(downloadDir)
    client = new BandcampClient()
    library = new Library(client, store, {
      onSyncChanged: (state) => broadcastEvent(IPC.eventSync, state),
      onOfflineChanged: (entry) => broadcastEvent(IPC.eventOffline, entry),
      onLibraryChanged: (payload) => broadcastEvent(IPC.eventLibrary, payload)
    })
    purchases = new PurchaseManager(client, store, library, {
      onPurchaseChanged: (entry) => broadcastEvent(IPC.eventPurchase, entry)
    })
    media = new MediaGateway(client, library, store)
    auth = new AuthManager(client, store, {
      onAuthChanged: (state) => broadcastEvent(IPC.eventAuth, state),
      onSignedIn: (state, demo) => {
        void library.sync(state, demo).catch((error) => {
          console.error('Library sync after sign-in failed', error)
        })
      }
    })

    await library.initOffline()
    purchases.init()
    media.register()
    registerIpc({
      client,
      store,
      library,
      purchases,
      auth,
      media,
      getMainWindow: () => mainWindow
    })
    buildMenu()
    wireEvents()
    await createWindow()

    if (process.env.SIDEA_DEMO === '1') {
      setTimeout(() => {
        void auth.startDemo().catch((error) => console.error('Could not start demo', error))
      }, 600)
    } else {
      setTimeout(async () => {
        try {
          const state = await auth.getState()
          if (state.status !== 'signed-in') return
          const sync = store.get().sync
          const stale = !sync.lastSyncedAt || Date.now() - sync.lastSyncedAt > 1000 * 60 * 30
          if (stale || store.get().collection.length === 0) {
            await library.sync(state, false)
          }
        } catch (error) {
          console.warn('Startup sync failed', error)
        }
      }, 1200)
    }
  })

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow()
    } else {
      mainWindow?.show()
      mainWindow?.focus()
    }
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    store?.flush()
    auth?.dispose()
    media?.dispose()
  })
}
