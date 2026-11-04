import { BrowserWindow, shell } from 'electron'
import type { AuthState } from '@shared/types'
import { BANDCAMP_PARTITION, BandcampClient } from './bandcamp'
import type { DiscoveredIdentity, IdentityHint } from './bandcamp'
import type { Store } from './store'

const DEMO_USERNAME = 'collection'
const DEMO_FAN_ID = 1171577

export interface AuthEvents {
  onAuthChanged: (auth: AuthState) => void
  onSignedIn: (auth: AuthState, demo: boolean) => void
}

export class AuthManager {
  private loginWindow: BrowserWindow | null = null
  private loginResolve: ((auth: AuthState) => void) | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private discovered = false
  private waitingForUsername = false
  private demo = false

  constructor(
    private readonly client: BandcampClient,
    private readonly store: Store,
    private readonly events: AuthEvents
  ) {}

  isDemo(): boolean {
    return this.demo
  }

  demoIdentity(): { username: string; fanId: number } {
    return { username: DEMO_USERNAME, fanId: DEMO_FAN_ID }
  }

  async getState(): Promise<AuthState> {
    if (this.demo) {
      return {
        status: 'demo',
        username: DEMO_USERNAME,
        fanId: DEMO_FAN_ID,
        displayName: 'Public demo collection'
      }
    }
    const stored = this.store.get().auth
    const hasCookie = await this.client.hasIdentityCookie()
    if (stored.username) {
      if (!hasCookie) return { status: 'signed-out', error: 'Your Bandcamp session has expired.' }
      return {
        status: 'signed-in',
        username: stored.username,
        fanId: stored.fanId,
        displayName: stored.displayName
      }
    }
    if (this.waitingForUsername && hasCookie) return { status: 'needs-username' }
    return { status: 'signed-out' }
  }

  private emit(auth: AuthState): void {
    this.events.onAuthChanged(auth)
  }

  async login(parent: BrowserWindow | null): Promise<AuthState> {
    this.demo = false
    if (this.loginWindow && !this.loginWindow.isDestroyed()) {
      this.loginWindow.focus()
      return this.getState()
    }
    this.discovered = false
    const win = new BrowserWindow({
      width: 1020,
      height: 780,
      minWidth: 820,
      minHeight: 620,
      parent: parent ?? undefined,
      show: false,
      title: 'Sign in to Bandcamp',
      backgroundColor: '#f7f4ee',
      ...(process.platform === 'darwin'
        ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 18, y: 18 } }
        : {}),
      autoHideMenuBar: true,
      webPreferences: {
        partition: BANDCAMP_PARTITION,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false
      }
    })
    this.loginWindow = win
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (!url.startsWith('https://')) return { action: 'deny' }
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          parent: win,
          autoHideMenuBar: true,
          width: 520,
          height: 700,
          webPreferences: {
            partition: BANDCAMP_PARTITION,
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false
          }
        }
      }
    })
    win.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith('https://')) {
        event.preventDefault()
        void shell.openExternal(url).catch(() => undefined)
      }
    })
    win.once('ready-to-show', () => {
      win.show()
      win.focus()
    })

    const result = new Promise<AuthState>((resolve) => {
      this.loginResolve = resolve
    })

    const finishIfSignedIn = async (): Promise<void> => {
      if (this.discovered || win.isDestroyed()) return
      if (!(await this.client.hasIdentityCookie())) return
      this.discovered = true
      if (this.pollTimer) {
        clearInterval(this.pollTimer)
        this.pollTimer = null
      }
      try {
        await this.waitForReady(win)
        let hint = await this.readHint(win)
        let identity = await this.client.discoverIdentity(hint)
        if (!identity) {
          await win.loadURL('https://bandcamp.com/profile').catch(() => undefined)
          await this.waitForReady(win)
          hint = await this.readHint(win)
          identity = await this.client.discoverIdentity(hint)
        }
        if (identity) {
          this.complete(identity)
          return
        }
        // The identity cookie is present but Bandcamp hasn't told us who we are.
        // Keep the session and let the app ask for the username.
        this.waitingForUsername = true
        const auth: AuthState = { status: 'needs-username' }
        this.emit(auth)
        this.closeLoginWindow()
        this.resolveLogin(auth)
      } catch (error) {
        console.error('Could not finish Bandcamp login', error)
        this.waitingForUsername = true
        const auth: AuthState = {
          status: 'needs-username',
          error: error instanceof Error ? error.message : 'Could not read your Bandcamp profile.'
        }
        this.emit(auth)
        this.closeLoginWindow()
        this.resolveLogin(auth)
      }
    }

    this.pollTimer = setInterval(() => {
      void finishIfSignedIn()
    }, 900)
    win.webContents.on('did-finish-load', () => {
      void finishIfSignedIn()
    })
    win.on('closed', () => {
      this.loginWindow = null
      if (this.pollTimer) {
        clearInterval(this.pollTimer)
        this.pollTimer = null
      }
      void this.getState().then((auth) => {
        if (auth.status === 'signed-out') this.emit(auth)
        this.resolveLogin(auth)
      })
    })

    await win.loadURL('https://bandcamp.com/profile').catch((error) => {
      console.warn('Could not open Bandcamp login page', error)
    })
    if (!win.isDestroyed() && !win.isVisible()) win.show()
    if (this.loginWindow === win && win.isVisible()) {
      win.webContents.focus()
    }
    return result
  }

  private async readHint(win: BrowserWindow): Promise<IdentityHint | undefined> {
    if (win.isDestroyed()) return undefined
    try {
      return (await win.webContents.executeJavaScript(
        `(() => {
          const el = document.getElementById('pagedata');
          const blob = el ? el.getAttribute('data-blob') : undefined;
          const links = Array.from(document.querySelectorAll('a[href]')).slice(0, 600).map((a) => ({
            href: a.href,
            text: (a.textContent || '').trim().slice(0, 80)
          }));
          return { url: location.href, blob: blob || undefined, links };
        })()`,
        true
      )) as IdentityHint
    } catch {
      return undefined
    }
  }

  private waitForReady(win: BrowserWindow): Promise<void> {
    if (win.isDestroyed()) return Promise.resolve()
    if (!win.webContents.isLoading()) return Promise.resolve()
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        win.webContents.removeListener('did-finish-load', onLoad)
        resolve()
      }, 15_000)
      const onLoad = (): void => {
        clearTimeout(timer)
        win.webContents.removeListener('did-finish-load', onLoad)
        resolve()
      }
      win.webContents.once('did-finish-load', onLoad)
    })
  }

  private complete(identity: DiscoveredIdentity): void {
    this.waitingForUsername = false
    this.store.setAuth({
      username: identity.username,
      fanId: identity.fanId,
      displayName: identity.displayName
    })
    const auth: AuthState = {
      status: 'signed-in',
      username: identity.username,
      fanId: identity.fanId,
      displayName: identity.displayName
    }
    this.emit(auth)
    this.closeLoginWindow()
    this.resolveLogin(auth)
    this.events.onSignedIn(auth, false)
  }

  private resolveLogin(auth: AuthState): void {
    if (!this.loginResolve) return
    const resolve = this.loginResolve
    this.loginResolve = null
    resolve(auth)
  }

  private closeLoginWindow(): void {
    if (this.loginWindow && !this.loginWindow.isDestroyed()) {
      this.loginWindow.close()
    }
    this.loginWindow = null
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  async setUsername(usernameInput: string): Promise<AuthState> {
    const username = usernameInput.trim().replace(/^@/, '')
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(username)) {
      throw new Error('Enter a valid Bandcamp username.')
    }
    if (!(await this.client.hasIdentityCookie())) {
      throw new Error('Your Bandcamp session expired. Please sign in again.')
    }
    // The typed name is usually the fan URL, but artist accounts often sign in
    // with a different fan page, so fall back to the identity the session itself
    // reports before giving up.
    const identity = (await this.client.validateUsername(username)) ?? (await this.client.discoverIdentity())
    if (!identity) throw new Error(`We couldn't find a Bandcamp profile named @${username}.`)
    this.waitingForUsername = false
    this.store.setAuth({
      username: identity.username,
      fanId: identity.fanId,
      displayName: identity.displayName
    })
    const auth: AuthState = {
      status: 'signed-in',
      username: identity.username,
      fanId: identity.fanId,
      displayName: identity.displayName
    }
    this.emit(auth)
    this.events.onSignedIn(auth, false)
    return auth
  }

  async startDemo(): Promise<AuthState> {
    this.demo = true
    this.waitingForUsername = false
    const auth: AuthState = {
      status: 'demo',
      username: DEMO_USERNAME,
      fanId: DEMO_FAN_ID,
      displayName: 'Public demo collection'
    }
    this.emit(auth)
    this.events.onSignedIn(auth, true)
    return auth
  }

  async logout(): Promise<void> {
    this.demo = false
    this.waitingForUsername = false
    this.closeLoginWindow()
    this.store.clearAuth()
    try {
      await this.client.session.clearStorageData({
        storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage']
      })
    } catch (error) {
      console.warn('Could not clear Bandcamp session', error)
    }
    this.emit({ status: 'signed-out' })
  }

  dispose(): void {
    this.closeLoginWindow()
  }
}
