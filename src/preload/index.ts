import { contextBridge, ipcRenderer } from 'electron'
import type { LibraryEvent, LibraryEventMap, SideAAPI } from '@shared/types'
import { IPC } from '@shared/ipc'

const api: SideAAPI = {
  getState: () => ipcRenderer.invoke(IPC.getState),
  auth: {
    login: () => ipcRenderer.invoke(IPC.authLogin),
    logout: () => ipcRenderer.invoke(IPC.authLogout),
    setUsername: (username) => ipcRenderer.invoke(IPC.authSetUsername, username),
    startDemo: () => ipcRenderer.invoke(IPC.authStartDemo)
  },
  library: {
    sync: () => ipcRenderer.invoke(IPC.librarySync),
    album: (key, force) => ipcRenderer.invoke(IPC.libraryAlbum, key, force),
    openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url)
  },
  playback: {
    stream: (albumKey, trackId) => ipcRenderer.invoke(IPC.playbackStream, albumKey, trackId)
  },
  offline: {
    save: (key) => ipcRenderer.invoke(IPC.offlineSave, key),
    remove: (key) => ipcRenderer.invoke(IPC.offlineRemove, key),
    saveAllPurchased: () => ipcRenderer.invoke(IPC.offlineSaveAll),
    openFolder: () => ipcRenderer.invoke(IPC.offlineOpenFolder)
  },
  purchases: {
    formats: (key) => ipcRenderer.invoke(IPC.purchaseFormats, key),
    download: (key, format) => ipcRenderer.invoke(IPC.purchaseDownload, key, format),
    reveal: (key) => ipcRenderer.invoke(IPC.purchaseReveal, key)
  },
  settings: {
    update: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
    chooseDownloadDir: () => ipcRenderer.invoke(IPC.settingsChooseDir),
    clearCaches: () => ipcRenderer.invoke(IPC.settingsClearCaches)
  },
  integrations: {
    updateLastfm: (patch) => ipcRenderer.invoke(IPC.lastfmUpdate, patch),
    connectLastfm: () => ipcRenderer.invoke(IPC.lastfmConnect),
    disconnectLastfm: () => ipcRenderer.invoke(IPC.lastfmDisconnect),
    updateDiscord: (patch) => ipcRenderer.invoke(IPC.discordUpdate, patch),
    nowPlaying: (input) => ipcRenderer.invoke(IPC.lastfmNowPlaying, input),
    scrobble: (input) => ipcRenderer.invoke(IPC.lastfmScrobble, input),
    presence: (input) => ipcRenderer.invoke(IPC.discordPresence, input),
    retryPending: () => ipcRenderer.invoke(IPC.integrationsRetry)
  },
  on: <K extends LibraryEvent>(event: K, callback: (payload: LibraryEventMap[K]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: LibraryEventMap[K]): void => {
      callback(payload)
    }
    ipcRenderer.on(event, listener)
    return () => {
      ipcRenderer.removeListener(event, listener)
    }
  }
}

contextBridge.exposeInMainWorld('sideA', api)
