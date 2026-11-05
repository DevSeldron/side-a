import { createHash } from 'node:crypto'
import { app, BrowserWindow } from 'electron'
import type { LastfmConfig, LastfmState, ScrobbleInput } from '@shared/types'
import type { Store } from './store'
import { openSecret, sealSecret } from './secrets'

const API = 'https://ws.audioscrobbler.com/2.0/'
const AUTH_URL = 'https://www.last.fm/api/auth/'
const AUTH_PARTITION = 'persist:lastfm'
const CALL_TIMEOUT = 15_000
const MAX_PENDING = 200

/** Last.fm's API uses its own numeric error codes. */
class LastfmError extends Error {
  constructor(
    readonly code: number,
    message: string
  ) {
    super(message)
    this.name = 'LastfmError'
  }
}

function retryable(error: unknown): boolean {
  if (error instanceof LastfmError) {
    return error.code === 8 || error.code === 11 || error.code === 16 || error.code === 29
  }
  // Network failures, aborts and malformed responses are worth retrying.
  return true
}

function text(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, limit)
}

function sanitize(input: ScrobbleInput): ScrobbleInput | null {
  const artist = text(input.artist, 300)
  const title = text(input.title, 300)
  if (!artist || !title) return null
  const now = Date.now()
  const stamp = Number(input.timestamp)
  const seconds =
    Number.isFinite(stamp) && stamp * 1000 > now - 1000 * 60 * 60 * 24 * 14 && stamp * 1000 < now + 60_000
      ? Math.floor(stamp)
      : Math.floor(now / 1000)
  const duration = Number(input.duration)
  const trackNumber = Number(input.trackNumber)
  return {
    artist,
    title,
    album: text(input.album, 300),
    albumArtist: text(input.albumArtist, 300),
    duration: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : undefined,
    trackNumber: Number.isFinite(trackNumber) && trackNumber > 0 ? Math.round(trackNumber) : undefined,
    timestamp: seconds,
    key: text(input.key, 300) ?? `${artist}\u0000${title}\u0000${seconds}`
  }
}

export class LastfmService {
  private authWindow: BrowserWindow | null = null
  private retryTimer: ReturnType<typeof setInterval> | null = null
  private lastNowPlaying = ''
  private lastError?: string

  constructor(
    private readonly store: Store,
    private readonly onChange: (state: LastfmState) => void
  ) {
    this.retryTimer = setInterval(() => {
      void this.flush().catch(() => undefined)
    }, 60_000)
  }

  state(): LastfmState {
    const config = this.config()
    return {
      configured: Boolean(config.apiKey && config.apiSecret),
      connected: Boolean(config.sessionKey),
      username: config.username,
      enabled: config.enabled,
      pending: config.pending.length,
      error: this.lastError
    }
  }

  async update(patch: { enabled?: boolean; apiKey?: string; apiSecret?: string }): Promise<LastfmState> {
    const config = this.config()
    let apiKey = config.apiKey
    let apiSecret = config.apiSecret
    let credentialsChanged = false

    if (typeof patch.apiKey === 'string' && patch.apiKey.trim()) {
      const next = patch.apiKey.trim()
      if (next !== (await openSecret(config.apiKey))) {
        apiKey = await sealSecret(next)
        credentialsChanged = true
      }
    }
    if (typeof patch.apiSecret === 'string' && patch.apiSecret.trim()) {
      const next = patch.apiSecret.trim()
      if (next !== (await openSecret(config.apiSecret))) {
        apiSecret = await sealSecret(next)
        credentialsChanged = true
      }
    }

    this.store.setIntegrations((integrations) => {
      const next = integrations.lastfm
      if (typeof patch.enabled === 'boolean') next.enabled = patch.enabled
      next.apiKey = apiKey
      next.apiSecret = apiSecret
      if (credentialsChanged) {
        next.sessionKey = ''
        next.username = undefined
        next.pending = []
      }
    })
    this.lastError = undefined
    this.emit()
    return this.state()
  }

  async connect(parent?: BrowserWindow | null): Promise<LastfmState> {
    const apiKey = await this.apiKey()
    if (!apiKey || !(await this.apiSecret())) {
      throw new Error('Add your Last.fm API key and secret first')
    }
    if (this.authWindow) throw new Error('Last.fm sign-in is already open')

    let token: string
    try {
      const response = await this.call('auth.getToken')
      token = String(response.token ?? '')
      if (!token) throw new Error('Last.fm did not return an auth token')
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Could not reach Last.fm'
      this.emit()
      throw error
    }

    const win = new BrowserWindow({
      width: 560,
      height: 780,
      parent: parent ?? undefined,
      title: 'Connect Last.fm',
      backgroundColor: '#0b0b0e',
      autoHideMenuBar: true,
      webPreferences: {
        partition: AUTH_PARTITION,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false
      }
    })
    this.authWindow = win
    win.on('closed', () => {
      if (this.authWindow === win) this.authWindow = null
    })
    void win
      .loadURL(`${AUTH_URL}?api_key=${encodeURIComponent(apiKey)}&token=${encodeURIComponent(token)}`)
      .catch(() => undefined)

    try {
      const session = await new Promise<{ name?: string; key: string }>((resolve, reject) => {
        let settled = false
        let interval: ReturnType<typeof setInterval> | null = null
        let timeout: ReturnType<typeof setTimeout> | null = null
        const closed = (): void => finish(() => reject(new Error('Last.fm sign-in was cancelled')))
        const cleanup = (): void => {
          if (interval) clearInterval(interval)
          if (timeout) clearTimeout(timeout)
          win.off('closed', closed)
        }
        const finish = (run: () => void): void => {
          if (settled) return
          settled = true
          cleanup()
          run()
        }
        const check = async (): Promise<void> => {
          if (settled) return
          try {
            const response = await this.call('auth.getSession', { token })
            const key = String(response.session?.key ?? '')
            if (!key) return
            finish(() =>
              resolve({
                name: typeof response.session?.name === 'string' ? response.session.name : undefined,
                key
              })
            )
          } catch (error) {
            if (error instanceof LastfmError && (error.code === 14 || error.code === 15)) return
            finish(() => reject(error))
          }
        }
        interval = setInterval(() => void check(), 2000)
        timeout = setTimeout(() => finish(() => reject(new Error('Last.fm sign-in timed out'))), 5 * 60_000)
        win.once('closed', closed)
        void check()
      })

      const sealedSession = await sealSecret(session.key)
      this.store.setIntegrations((integrations) => {
        integrations.lastfm.sessionKey = sealedSession
        integrations.lastfm.username = session.name
        integrations.lastfm.enabled = true
      })
      this.lastError = undefined
      this.lastNowPlaying = ''
      this.emit()
      void this.flush().catch(() => undefined)
      return this.state()
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Last.fm sign-in failed'
      this.emit()
      throw error
    } finally {
      if (!win.isDestroyed()) win.close()
      if (this.authWindow === win) this.authWindow = null
    }
  }

  disconnect(): LastfmState {
    this.store.setIntegrations((integrations) => {
      integrations.lastfm.sessionKey = ''
      integrations.lastfm.username = undefined
      integrations.lastfm.pending = []
    })
    this.lastNowPlaying = ''
    this.lastError = undefined
    this.emit()
    return this.state()
  }

  async nowPlaying(input: ScrobbleInput): Promise<void> {
    if (!this.config().enabled || !(await this.sessionKey())) return
    const item = sanitize(input)
    if (!item) return
    const stamp = `${item.artist}\u0000${item.title}\u0000${item.timestamp}`
    if (stamp === this.lastNowPlaying) return
    this.lastNowPlaying = stamp
    try {
      await this.call(
        'track.updateNowPlaying',
        {
          artist: item.artist,
          track: item.title,
          album: item.album,
          albumArtist: item.albumArtist,
          duration: item.duration,
          trackNumber: item.trackNumber
        },
        { session: true }
      )
      if (this.lastError) {
        this.lastError = undefined
        this.emit()
      }
    } catch (error) {
      // Now-playing is best effort; scrobbles keep their own queue.
      console.warn('Last.fm now-playing failed', error)
    }
  }

  async scrobble(input: ScrobbleInput): Promise<void> {
    if (!this.config().enabled || !(await this.sessionKey())) return
    const item = sanitize(input)
    if (!item) return
    const sent = await this.send(item)
    if (!sent) this.enqueue(item)
    this.emit()
  }

  async flush(): Promise<void> {
    const config = this.config()
    if (!config.enabled || !(await this.sessionKey()) || config.pending.length === 0) return
    const batch = config.pending.slice(0, 25)
    let sent = 0
    for (const item of batch) {
      const ok = await this.send(item)
      if (!ok) break
      this.store.setIntegrations((integrations) => {
        integrations.lastfm.pending = integrations.lastfm.pending.filter((entry) => entry.key !== item.key)
      })
      sent += 1
    }
    if (sent > 0 || this.lastError) this.emit()
  }

  dispose(): void {
    if (this.retryTimer) clearInterval(this.retryTimer)
    this.retryTimer = null
    if (this.authWindow && !this.authWindow.isDestroyed()) this.authWindow.close()
    this.authWindow = null
  }

  private config(): LastfmConfig {
    return this.store.get().integrations.lastfm
  }

  private async apiKey(): Promise<string> {
    return openSecret(this.config().apiKey)
  }

  private async apiSecret(): Promise<string> {
    return openSecret(this.config().apiSecret)
  }

  private async sessionKey(): Promise<string> {
    return openSecret(this.config().sessionKey)
  }

  private emit(): void {
    this.onChange(this.state())
  }

  private enqueue(item: ScrobbleInput): void {
    this.store.setIntegrations((integrations) => {
      const pending = integrations.lastfm.pending
      if (pending.some((entry) => entry.key === item.key)) return
      pending.push(item)
      if (pending.length > MAX_PENDING) pending.splice(0, pending.length - MAX_PENDING)
    })
  }

  private async send(item: ScrobbleInput): Promise<boolean> {
    try {
      await this.call(
        'track.scrobble',
        {
          artist: item.artist,
          track: item.title,
          album: item.album,
          albumArtist: item.albumArtist,
          duration: item.duration,
          trackNumber: item.trackNumber,
          timestamp: item.timestamp
        },
        { session: true }
      )
      this.lastError = undefined
      return true
    } catch (error) {
      if (retryable(error)) {
        this.lastError = 'Last.fm is unreachable, scrobbles will be sent when it is back'
        return false
      }
      // Permanent rejections are dropped so the queue cannot get stuck.
      this.lastError = error instanceof Error ? error.message : 'Last.fm rejected a scrobble'
      return true
    }
  }

  private async call(
    method: string,
    params: Record<string, string | number | undefined> = {},
    options: { session?: boolean } = {}
  ): Promise<Record<string, any>> {
    const apiKey = await this.apiKey()
    const apiSecret = await this.apiSecret()
    if (!apiKey || !apiSecret) throw new Error('Last.fm is not configured')

    const signed: Record<string, string> = { method, api_key: apiKey }
    if (options.session) {
      const session = await this.sessionKey()
      if (!session) throw new Error('Connect Last.fm first')
      signed.sk = session
    }
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === '') continue
      signed[key] = String(value)
    }
    const signature = createHash('md5')
      .update(
        Object.keys(signed)
          .sort()
          .map((key) => `${key}${signed[key]}`)
          .join('') + apiSecret
      )
      .digest('hex')

    const body = new URLSearchParams(signed)
    body.set('api_sig', signature)
    body.set('format', 'json')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT)
    try {
      const response = await fetch(API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': `SideA/${app.getVersion()}`
        },
        body,
        signal: controller.signal
      })
      const raw = await response.text()
      let data: Record<string, any>
      try {
        data = JSON.parse(raw) as Record<string, any>
      } catch {
        throw new Error(`Last.fm returned an unexpected response (${response.status})`)
      }
      if (data?.error) {
        throw new LastfmError(Number(data.error), String(data.message ?? 'Last.fm rejected the request'))
      }
      if (!response.ok) throw new Error(`Last.fm returned ${response.status}.`)
      return data
    } finally {
      clearTimeout(timer)
    }
  }
}
