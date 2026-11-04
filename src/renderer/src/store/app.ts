import { create } from 'zustand'
import type {
  AuthState,
  LibrarySnapshot,
  OfflineEntry,
  PurchaseDownload,
  Settings,
  SyncState
} from '@shared/types'
import { IPC } from '@shared/ipc'
import { errorMessage } from '../lib/format'

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastItem {
  id: number
  title: string
  description?: string
  tone: ToastTone
}

interface AppState {
  snapshot: LibrarySnapshot | null
  ready: boolean
  loadingError: string | null
  toasts: ToastItem[]
  paletteOpen: boolean
  init: () => Promise<void>
  refresh: () => Promise<void>
  sync: () => Promise<void>
  login: () => Promise<void>
  logout: () => Promise<void>
  startDemo: () => Promise<void>
  setUsername: (username: string) => Promise<void>
  saveOffline: (key: string) => Promise<void>
  removeOffline: (key: string) => Promise<void>
  saveAllPurchased: () => Promise<void>
  downloadPurchase: (key: string, format: string) => Promise<void>
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  chooseDownloadDir: () => Promise<void>
  clearCaches: () => Promise<void>
  pushToast: (title: string, options?: { description?: string; tone?: ToastTone }) => void
  dismissToast: (id: number) => void
  setPaletteOpen: (open: boolean) => void
  applyAuth: (auth: AuthState) => void
  applySync: (sync: SyncState) => void
  applyOffline: (entry: OfflineEntry) => void
  applyPurchase: (entry: PurchaseDownload) => void
  applySettings: (settings: Settings) => void
}

let toastCounter = 1
let initialized = false
let subscribed = false

function withSnapshot(
  state: AppState,
  mutate: (snapshot: LibrarySnapshot) => LibrarySnapshot
): Partial<AppState> {
  if (!state.snapshot) return {}
  return { snapshot: mutate(state.snapshot) }
}

export const useApp = create<AppState>()((set, get) => ({
  snapshot: null,
  ready: false,
  loadingError: null,
  toasts: [],
  paletteOpen: false,

  init: async () => {
    if (initialized) return
    initialized = true
    if (!subscribed) {
      subscribed = true
      window.sideA.on(IPC.eventAuth, (auth) => get().applyAuth(auth))
      window.sideA.on(IPC.eventSync, (sync) => get().applySync(sync))
      window.sideA.on(IPC.eventOffline, (entry) => get().applyOffline(entry))
      window.sideA.on(IPC.eventPurchase, (entry) => get().applyPurchase(entry))
      window.sideA.on(IPC.eventSettings, (settings) => get().applySettings(settings))
      window.sideA.on(IPC.eventLibrary, () => {
        void get().refresh()
      })
    }
    try {
      const snapshot = await window.sideA.getState()
      set({ snapshot, ready: true, loadingError: null })
    } catch (error) {
      set({ ready: true, loadingError: errorMessage(error, 'Side A could not start.') })
    }
  },

  refresh: async () => {
    try {
      const snapshot = await window.sideA.getState()
      set({ snapshot, ready: true, loadingError: null })
    } catch (error) {
      get().pushToast('Could not refresh the library', { description: errorMessage(error), tone: 'error' })
    }
  },

  sync: async () => {
    const state = get().snapshot
    if (!state || (state.auth.status !== 'signed-in' && state.auth.status !== 'demo')) {
      get().pushToast('Sign in to Bandcamp first', { tone: 'error' })
      return
    }
    try {
      const snapshot = await window.sideA.library.sync()
      set({ snapshot })
      get().pushToast('Library is up to date', {
        description: `${snapshot.collection.length} releases · ${snapshot.wishlist.length} wishlisted`,
        tone: 'success'
      })
    } catch (error) {
      get().pushToast('Sync failed', { description: errorMessage(error), tone: 'error' })
    }
  },

  login: async () => {
    try {
      await window.sideA.auth.login()
      await get().refresh()
    } catch (error) {
      get().pushToast('Could not open Bandcamp sign-in', {
        description: errorMessage(error),
        tone: 'error'
      })
    }
  },

  logout: async () => {
    try {
      await window.sideA.auth.logout()
      await get().refresh()
      get().pushToast('Signed out of Bandcamp', { tone: 'info' })
    } catch (error) {
      get().pushToast('Could not sign out', { description: errorMessage(error), tone: 'error' })
    }
  },

  startDemo: async () => {
    try {
      await window.sideA.auth.startDemo()
      await get().refresh()
      get().pushToast('Demo collection loaded', {
        description: 'Browse and listen freely. Purchased downloads need your own account.',
        tone: 'info'
      })
    } catch (error) {
      get().pushToast('Could not load the demo', { description: errorMessage(error), tone: 'error' })
    }
  },

  setUsername: async (username: string) => {
    try {
      await window.sideA.auth.setUsername(username)
      await get().refresh()
      get().pushToast('Bandcamp account connected', { tone: 'success' })
    } catch (error) {
      get().pushToast('Could not connect that profile', {
        description: errorMessage(error),
        tone: 'error'
      })
      throw error
    }
  },

  saveOffline: async (key) => {
    try {
      await window.sideA.offline.save(key)
    } catch (error) {
      get().pushToast('Could not save for offline', {
        description: errorMessage(error),
        tone: 'error'
      })
      throw error
    }
  },

  removeOffline: async (key) => {
    try {
      await window.sideA.offline.remove(key)
      await get().refresh()
      get().pushToast('Removed offline copy', { tone: 'info' })
    } catch (error) {
      get().pushToast('Could not remove the offline copy', {
        description: errorMessage(error),
        tone: 'error'
      })
      throw error
    }
  },

  saveAllPurchased: async () => {
    try {
      const result = await window.sideA.offline.saveAllPurchased()
      await get().refresh()
      get().pushToast('Offline queue started', {
        description: result.queued
          ? `${result.queued} release${result.queued === 1 ? '' : 's'} queued${result.skipped ? ` · ${result.skipped} already saved` : ''}`
          : 'Every purchased release is already available offline.',
        tone: result.queued ? 'success' : 'info'
      })
    } catch (error) {
      get().pushToast('Could not start the offline queue', {
        description: errorMessage(error),
        tone: 'error'
      })
    }
  },

  downloadPurchase: async (key, format) => {
    try {
      await window.sideA.purchases.download(key, format)
    } catch (error) {
      get().pushToast('Could not download this purchase', {
        description: errorMessage(error),
        tone: 'error'
      })
      throw error
    }
  },

  updateSettings: async (patch) => {
    try {
      const settings = await window.sideA.settings.update(patch)
      get().applySettings(settings)
    } catch (error) {
      get().pushToast('Could not save settings', {
        description: errorMessage(error),
        tone: 'error'
      })
    }
  },

  chooseDownloadDir: async () => {
    try {
      const dir = await window.sideA.settings.chooseDownloadDir()
      if (dir) get().pushToast('Download folder updated', { description: dir, tone: 'success' })
    } catch (error) {
      get().pushToast('Could not choose a folder', {
        description: errorMessage(error),
        tone: 'error'
      })
    }
  },

  clearCaches: async () => {
    try {
      await window.sideA.settings.clearCaches()
      get().pushToast('Caches cleared', {
        description: 'Release details and downloaded artwork will be fetched again.',
        tone: 'success'
      })
    } catch (error) {
      get().pushToast('Could not clear caches', {
        description: errorMessage(error),
        tone: 'error'
      })
    }
  },

  pushToast: (title, options) => {
    const toast: ToastItem = {
      id: toastCounter++,
      title,
      description: options?.description,
      tone: options?.tone ?? 'info'
    }
    set((state) => ({ toasts: [...state.toasts.slice(-3), toast] }))
  },

  dismissToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
  },

  setPaletteOpen: (open) => set({ paletteOpen: open }),

  applyAuth: (auth) => {
    set((state) => ({
      ...withSnapshot(state, (snapshot) => ({
        ...snapshot,
        auth,
        demo: auth.status === 'demo'
      }))
    }))
    if (auth.status === 'signed-in') {
      get().pushToast('Connected to Bandcamp', { tone: 'success' })
    }
    if (auth.status === 'needs-username') {
      get().pushToast('Signed in — one more step', {
        description: 'Enter your Bandcamp username so Side A can find your collection.',
        tone: 'info'
      })
    }
  },

  applySync: (sync) => {
    set((state) => ({ ...withSnapshot(state, (snapshot) => ({ ...snapshot, sync })) }))
  },

  applyOffline: (entry) => {
    set((state) => ({
      ...withSnapshot(state, (snapshot) => {
        const offline = { ...snapshot.offline }
        if (entry.status === 'none') delete offline[entry.key]
        else offline[entry.key] = entry
        return { ...snapshot, offline }
      })
    }))
    if (entry.status === 'ready') {
      const state = get().snapshot
      const album = state?.collection.find((item) => item.key === entry.key) ?? state?.wishlist.find((item) => item.key === entry.key)
      get().pushToast('Saved for offline listening', {
        description: album ? `${album.bandName} — ${album.title}` : undefined,
        tone: 'success'
      })
    }
    if (entry.status === 'error') {
      get().pushToast('Offline download failed', {
        description: entry.error ?? 'Try again in a moment.',
        tone: 'error'
      })
    }
  },

  applyPurchase: (entry) => {
    set((state) => ({
      ...withSnapshot(state, (snapshot) => ({
        ...snapshot,
        purchases: { ...snapshot.purchases, [entry.key]: entry }
      }))
    }))
    if (entry.status === 'done') {
      get().pushToast('Purchase downloaded', {
        description: entry.filePath ? entry.filePath.split('/').pop() : undefined,
        tone: 'success'
      })
    }
    if (entry.status === 'error') {
      get().pushToast('Purchase download failed', {
        description: entry.error ?? 'Try again in a moment.',
        tone: 'error'
      })
    }
  },

  applySettings: (settings) => {
    set((state) => ({ ...withSnapshot(state, (snapshot) => ({ ...snapshot, settings })) }))
  }
}))
