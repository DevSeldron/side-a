import { Client } from '@xhayper/discord-rpc'
import type { DiscordActivityType, DiscordConfig, DiscordState, PresenceInput } from '@shared/types'
import type { Store } from './store'

const RETRY_MS = 20_000
const CONNECT_TIMEOUT = 12_000
const TEMPLATE_LIMIT = 160

/** ActivityType: Playing = 0, Listening = 2, Watching = 3. */
const ACTIVITY_TYPES: Record<DiscordActivityType, 0 | 2 | 3> = {
  playing: 0,
  listening: 2,
  watching: 3
}

export interface DiscordUpdate {
  enabled?: boolean
  clientId?: string
  detailsTemplate?: string
  stateTemplate?: string
  showTimestamps?: boolean
  showButton?: boolean
  activityType?: DiscordActivityType
}

function truncate(value: string, limit: number): string {
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed.length > limit ? `${trimmed.slice(0, limit - 1)}…` : trimmed
}

function httpsUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function activityTypeFor(value: string): DiscordActivityType {
  return value === 'playing' || value === 'watching' ? value : 'listening'
}

/**
 * Renders a user template such as `{artist} / {album}`. Unknown tokens are left
 * alone so a typo is visible instead of silently disappearing.
 */
function renderTemplate(template: string, input: PresenceInput): string {
  const values: Record<string, string> = {
    title: input.title,
    artist: input.artist,
    album: input.album ?? '',
    band: input.band ?? input.artist
  }
  return template
    .replace(/\{(\w+)\}/g, (match, key: string) => {
      const value = values[key.toLowerCase()]
      return value === undefined ? match : value
    })
    .replace(/\s+/g, ' ')
    .replace(/\s*[—–-]\s*$/, '')
    .replace(/^\s*[—–-]\s*/, '')
    .trim()
}

export class DiscordService {
  private client: Client | null = null
  private connecting = false
  private connected = false
  private current: PresenceInput | null = null
  private lastError?: string
  private retryTimer: ReturnType<typeof setInterval> | null = null
  private disposed = false

  constructor(
    private readonly store: Store,
    private readonly onChange: (state: DiscordState) => void
  ) {
    this.retryTimer = setInterval(() => {
      if (this.retryTimer) void this.ensureConnected()
    }, RETRY_MS)
  }

  state(): DiscordState {
    const config = this.config()
    return {
      configured: Boolean(config.clientId),
      enabled: config.enabled,
      connected: this.connected,
      clientId: config.clientId || undefined,
      error: this.lastError,
      detailsTemplate: config.detailsTemplate,
      stateTemplate: config.stateTemplate,
      showTimestamps: config.showTimestamps,
      showButton: config.showButton,
      activityType: activityTypeFor(config.activityType)
    }
  }

  update(patch: DiscordUpdate): DiscordState {
    let idChanged = false
    let appearanceChanged = false
    this.store.setIntegrations((integrations) => {
      const config = integrations.discord
      if (typeof patch.enabled === 'boolean') config.enabled = patch.enabled
      if (typeof patch.clientId === 'string') {
        const next = patch.clientId.trim()
        if (next !== config.clientId) {
          config.clientId = next
          idChanged = true
        }
      }
      if (typeof patch.detailsTemplate === 'string') {
        const next = patch.detailsTemplate.trim().slice(0, TEMPLATE_LIMIT)
        if (next !== config.detailsTemplate) {
          config.detailsTemplate = next
          appearanceChanged = true
        }
      }
      if (typeof patch.stateTemplate === 'string') {
        const next = patch.stateTemplate.trim().slice(0, TEMPLATE_LIMIT)
        if (next !== config.stateTemplate) {
          config.stateTemplate = next
          appearanceChanged = true
        }
      }
      if (typeof patch.showTimestamps === 'boolean' && patch.showTimestamps !== config.showTimestamps) {
        config.showTimestamps = patch.showTimestamps
        appearanceChanged = true
      }
      if (typeof patch.showButton === 'boolean' && patch.showButton !== config.showButton) {
        config.showButton = patch.showButton
        appearanceChanged = true
      }
      if (patch.activityType && patch.activityType !== config.activityType) {
        config.activityType = patch.activityType
        appearanceChanged = true
      }
    })
    if (idChanged) {
      this.lastError = undefined
      void this.reset()
    }
    const config = this.config()
    if (!config.enabled) {
      this.lastError = undefined
      this.current = null
      void this.reset()
      this.emit()
      return this.state()
    }
    if (config.clientId) void this.ensureConnected()
    if (appearanceChanged) void this.applyPresence()
    this.emit()
    return this.state()
  }

  async setPresence(input: PresenceInput | null): Promise<void> {
    this.current = input
    const config = this.config()
    if (!config.enabled || !config.clientId) return
    if (!input) {
      if (this.client?.user) {
        try {
          await this.client.user.clearActivity()
        } catch {
          // Discord may have just closed.
        }
      }
      return
    }
    await this.ensureConnected()
    await this.applyPresence()
  }

  async ensureConnected(): Promise<void> {
    if (this.disposed) return
    const config = this.config()
    if (!config.enabled || !config.clientId || this.connected || this.connecting) return
    this.connecting = true
    const client = new Client({ clientId: config.clientId })
    this.client = client
    client.on('ready', () => {
      if (this.client !== client) return
      this.connected = true
      this.lastError = undefined
      this.emit()
      void this.applyPresence()
    })
    client.on('disconnected', () => {
      if (this.client !== client) return
      this.connected = false
      this.emit()
      void this.reset()
    })
    try {
      await Promise.race([
        client.login(),
        new Promise((_resolve, reject) => setTimeout(() => reject(new Error('timeout')), CONNECT_TIMEOUT))
      ])
    } catch (error) {
      if (this.client === client) {
        this.lastError =
          error instanceof Error && /timeout|connect|ENOENT|socket/i.test(error.message)
            ? 'Discord is not running. Start it to show Rich Presence.'
            : 'Could not connect to Discord.'
        this.connected = false
        this.client = null
        this.emit()
        void client.destroy().catch(() => undefined)
      }
    } finally {
      this.connecting = false
    }
  }

  dispose(): void {
    this.disposed = true
    if (this.retryTimer) clearInterval(this.retryTimer)
    this.retryTimer = null
    void this.reset()
  }

  private config(): DiscordConfig {
    return this.store.get().integrations.discord
  }

  private emit(): void {
    this.onChange(this.state())
  }

  private async reset(): Promise<void> {
    const client = this.client
    this.client = null
    this.connected = false
    if (!client) return
    try {
      await client.user?.clearActivity()
    } catch {
      // Ignore: the socket may already be gone.
    }
    try {
      await client.destroy()
    } catch {
      // Ignore.
    }
  }

  private async applyPresence(): Promise<void> {
    const client = this.client
    const input = this.current
    if (!client?.user || !input) return
    const config = this.config()
    const duration = Number(input.duration)
    const position = Math.max(
      0,
      Math.min(Number(input.position) || 0, Number.isFinite(duration) && duration > 0 ? duration : Infinity)
    )
    const now = Date.now()
    const cover = httpsUrl(input.coverUrl)
    const link = httpsUrl(input.itemUrl)

    const details = truncate(renderTemplate(config.detailsTemplate || '{title}', input) || input.title, 128)
    const stateText = truncate(
      renderTemplate(config.stateTemplate || '{artist} / {album}', input) || input.artist,
      128
    )
    const pausedPrefix = input.playing ? '' : 'Paused · '

    const activity = {
      type: ACTIVITY_TYPES[activityTypeFor(config.activityType)],
      details,
      ...(stateText ? { state: truncate(`${pausedPrefix}${stateText}`, 128) } : pausedPrefix ? { state: 'Paused' } : {}),
      // Discord proxies external images only when the URL is sent as the asset
      // key; `largeUrl` is kept for newer clients that read it directly.
      ...(cover ? { largeImageKey: cover, largeImageUrl: cover, largeImageText: truncate(input.album ?? input.title, 128) } : {}),
      instance: false,
      ...(config.showButton && link
        ? { buttons: [{ label: 'Listen on Bandcamp', url: link }] }
        : {}),
      ...(config.showTimestamps && input.playing
        ? {
            startTimestamp: now - position * 1000,
            ...(Number.isFinite(duration) && duration > position
              ? { endTimestamp: now + (duration - position) * 1000 }
              : {})
          }
        : {})
    }
    try {
      await client.user.setActivity(activity)
    } catch (error) {
      this.lastError = 'Discord rejected the presence update.'
      this.emit()
      console.warn('Discord presence failed', error)
    }
  }
}
