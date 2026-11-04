import { session } from 'electron'
import type { Session } from 'electron'
import type {
  Album,
  AlbumDetail,
  DiscoverAlbum,
  DiscoverArtist,
  DiscoverKind,
  DiscoverResult,
  PurchaseFormat,
  Track,
  TralbumType
} from '@shared/types'
import { findRedownload } from './redownloads'

export const BANDCAMP_PARTITION = 'persist:bandcamp'
export const BANDCAMP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'

const API = 'https://bandcamp.com'

interface RawCollectionItem {
  item_id?: number
  item_type?: string
  tralbum_id?: number
  tralbum_type?: string
  album_id?: number
  album_title?: string
  track_title?: string
  item_title?: string
  band_id?: number
  band_name?: string
  band_url?: string
  item_url?: string
  item_art_id?: number
  item_art_url?: string
  added?: string
  updated?: string
  purchased?: string
  sale_item_id?: number
  sale_item_type?: string
  featured_track?: number
  featured_track_title?: string
  featured_track_duration?: number
  num_streamable_tracks?: number
  is_private?: boolean
  hidden?: unknown
  genre_id?: number
  download_available?: boolean
  token?: string
  why?: string | null
}

interface FanData {
  fan_id?: number
  username?: string
  name?: string
  trackpipe_url?: string
  is_own_page?: boolean | null
  photo?: { image_id?: number } | null
}

interface CollectionPageData {
  fan_data?: FanData
  collection_data?: {
    item_count?: number
    batch_size?: number
    last_token?: string
    sequence?: string[]
    redownload_urls?: Record<string, string>
  }
  wishlist_data?: {
    item_count?: number
    batch_size?: number
    last_token?: string
    sequence?: string[]
  }
  item_cache?: {
    collection?: Record<string, RawCollectionItem>
    wishlist?: Record<string, RawCollectionItem>
  }
  tracklists?: Record<string, Record<string, RawTrack[]>>
}

interface RawSearchResult {
  type?: string
  id?: number
  name?: string
  band_id?: number
  band_name?: string
  art_id?: number
  img?: string
  item_url_root?: string
  item_url_path?: string
  location?: string
  tag_names?: string[]
}

interface BandDetails {
  id?: number
  name?: string
  bio?: string
  bio_image_id?: number
  bandcamp_url?: string
  discography?: Array<{
    item_id?: number
    item_type?: string
    band_name?: string
    title?: string
    art_id?: number
    release_date?: string
  }>
}

interface RawTrack {
  id?: number
  track_id?: number
  title?: string
  artist?: string
  band_name?: string
  track_num?: number
  track_number?: number
  duration?: number
  streaming_url?: Record<string, string>
  file?: Record<string, string>
  is_streamable?: boolean
}

interface MobileTralbum {
  id?: number
  type?: string
  title?: string
  bandcamp_url?: string
  art_id?: number
  band?: { band_id?: number; name?: string }
  tralbum_artist?: string
  tracks?: RawTrack[]
  about?: string
  credits?: string
  release_date?: string | number
  error?: boolean
  error_message?: string
}

/**
 * Bandcamp reports `release_date` as Unix seconds on the mobile tralbum API but
 * as a date string elsewhere. Normalise both to ISO so the renderer only ever
 * deals with real dates.
 */
function normalizeReleaseDate(value: unknown): string | undefined {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return undefined
    const date = new Date(value < 1e11 ? value * 1000 : value)
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
  }
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed)
    if (!Number.isFinite(numeric) || numeric <= 0) return undefined
    const date = new Date(numeric < 1e11 ? numeric * 1000 : numeric)
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
  }
  const date = new Date(trimmed)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

interface CollectionApiPage {
  items?: RawCollectionItem[]
  redownload_urls?: Record<string, string>
  more_available?: boolean
  last_token?: string
  error?: boolean
  error_message?: string
}

export interface IdentityHint {
  url: string
  blob?: string
  links?: Array<{ href: string; text?: string }>
}

export interface DiscoveredIdentity {
  username: string
  fanId: number
  displayName?: string
  isOwnPage?: boolean
}

export interface FanPage {
  username: string
  fanId: number
  displayName?: string
  collection: Album[]
  wishlist: Album[]
  redownloads: Record<string, string>
}

export interface SyncProgress {
  progress: number
  message: string
  collectionCount: number
  wishlistCount: number
}

export interface PurchaseInfo {
  title: string
  artist: string
  formats: PurchaseFormat[]
  digitalItem: Record<string, unknown>
  downloads: Record<string, { url: string; size?: number }>
}

export interface PurchaseDownloadLink {
  url: string
  suggestedName?: string
  info: PurchaseInfo
}

const RESERVED_PATHS = new Set([
  'about',
  'album',
  'articles',
  'artist',
  'campaign',
  'cart',
  'collection',
  'cookies',
  'daily',
  'discover',
  'download',
  'edit_profile',
  'fan',
  'feed',
  'gift',
  'gifts',
  'help',
  'home',
  'jobs',
  'label',
  'login',
  'logout',
  'merch',
  'messages',
  'my_collection',
  'notifications',
  'podcasts',
  'privacy',
  'profile',
  'radio',
  'search',
  'settings',
  'signup',
  'subscriptions',
  'support',
  'terms',
  'tools',
  'track',
  'wishlist'
])

export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|quot|amp|lt|gt|apos|nbsp|hellip|mdash|ndash|rsquo|lsquo|ldquo|rdquo);/gi, (full, entity: string) => {
    const lower = entity.toLowerCase()
    if (lower.startsWith('#x')) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16))
    if (lower.startsWith('#')) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10))
    const map: Record<string, string> = {
      quot: '"',
      amp: '&',
      lt: '<',
      gt: '>',
      apos: "'",
      nbsp: ' ',
      hellip: '…',
      mdash: '—',
      ndash: '–',
      rsquo: '’',
      lsquo: '‘',
      ldquo: '“',
      rdquo: '”'
    }
    return map[lower] ?? full
  })
}

function findAttribute(tag: string, attribute: string): string | undefined {
  const regex = new RegExp(`${attribute}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i')
  const match = tag.match(regex)
  if (!match) return undefined
  return match[2] ?? match[3]
}

export function extractPageBlob(html: string): unknown | null {
  const tags = html.match(/<[^>]*\bid=["']pagedata["'][^>]*>/i)
  const candidates: string[] = []
  if (tags) {
    for (const tag of tags) {
      const value = findAttribute(tag, 'data-blob')
      if (value) candidates.push(value)
    }
  }
  if (candidates.length === 0) {
    const fallback = html.match(/data-blob=("([^"]*)"|'([^']*)')[^>]*\bid=["']pagedata["']/i)
    if (fallback) candidates.push(fallback[2] ?? fallback[3] ?? '')
  }
  if (candidates.length === 0) return null
  const raw = decodeHtmlEntities(candidates[0] ?? '')
  try {
    return JSON.parse(raw)
  } catch (error) {
    console.error('Could not parse Bandcamp page data', error)
    return null
  }
}

export function extractScriptJson(html: string): unknown | null {
  const script = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i)
  if (!script) return null
  try {
    return JSON.parse(script[1] ?? '')
  } catch {
    return null
  }
}

export function stripHtml(input: string | undefined): string | undefined {
  if (!input) return undefined
  const stripped = input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
  return decodeHtmlEntities(stripped).replace(/\n{3,}/g, '\n\n').trim() || undefined
}

function artUrl(artId: number | undefined, size: 9 | 10 | 3 = 9): string | undefined {
  if (!artId) return undefined
  return `https://f4.bcbits.com/img/a${artId}_${size}.jpg`
}

function imageUrl(imageId: number | undefined, size: 9 | 10 | 3 = 9): string | undefined {
  if (!imageId) return undefined
  return `https://f4.bcbits.com/img/${imageId}_${size}.jpg`
}

function toDiscoverResult(raw: RawSearchResult): DiscoverResult | null {
  if (!raw.id || !raw.name) return null
  const kind: DiscoverKind | null = raw.type === 'b' ? 'artist' : raw.type === 'a' ? 'album' : raw.type === 't' ? 'track' : null
  if (!kind) return null
  const art = raw.img ?? artUrl(raw.art_id, 9)
  if (kind === 'artist') {
    return {
      kind,
      id: raw.id,
      title: raw.name,
      url: raw.item_url_root ?? '',
      artUrl: art,
      location: raw.location ?? undefined,
      tags: raw.tag_names?.slice(0, 4)
    }
  }
  return {
    kind,
    id: raw.id,
    bandId: raw.band_id,
    bandName: raw.band_name,
    title: raw.name,
    url: raw.item_url_path ?? raw.item_url_root ?? '',
    artUrl: art,
    tags: raw.tag_names?.slice(0, 4)
  }
}

function toAlbum(item: RawCollectionItem, redownloads: Record<string, string>): Album | null {
  if (!item.item_id || !item.band_id) return null
  const tralbumType: TralbumType = item.tralbum_type === 't' ? 't' : 'a'
  const itemType = item.item_type ?? (tralbumType === 't' ? 'track' : 'album')
  const key = `${itemType === 'track' ? 't' : 'p'}${item.item_id}`
  const artId = item.item_art_id
  const title = item.item_title ?? item.album_title ?? item.track_title ?? 'Untitled'
  const redownload = findRedownload(redownloads, item.sale_item_id, item.sale_item_type)
  return {
    key,
    itemId: item.item_id,
    itemType,
    tralbumId: item.tralbum_id ?? item.album_id ?? item.item_id,
    tralbumType,
    bandId: item.band_id,
    bandName: item.band_name ?? 'Unknown artist',
    bandUrl: item.band_url,
    title,
    itemUrl: item.item_url ?? '',
    artId,
    artUrl: item.item_art_url ?? artUrl(artId, 9),
    added: item.added,
    purchased: item.purchased,
    downloadAvailable: Boolean(item.download_available),
    purchaseDownloadable: Boolean(redownload),
    saleItemId: item.sale_item_id,
    saleItemType: item.sale_item_type,
    featuredTrackId: item.featured_track,
    featuredTrackTitle: item.featured_track_title,
    featuredTrackDuration: item.featured_track_duration,
    numTracks: item.num_streamable_tracks,
    isPrivate: Boolean(item.is_private),
    hidden: Boolean(item.hidden),
    genreId: item.genre_id
  }
}

function findFanData(value: unknown, depth = 0): FanData | null {
  if (!value || depth > 6) return null
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findFanData(entry, depth + 1)
      if (found) return found
    }
    return null
  }
  if (typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.fan_id === 'number' && typeof record.username === 'string') {
    return record as unknown as FanData
  }
  for (const entry of Object.values(record)) {
    const found = findFanData(entry, depth + 1)
    if (found) return found
  }
  return null
}

function usernameFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'bandcamp.com' && parsed.hostname !== 'www.bandcamp.com') return undefined
    const segment = parsed.pathname.split('/').filter(Boolean)[0]
    if (!segment) return undefined
    if (!/^[A-Za-z0-9_-]+$/.test(segment)) return undefined
    if (RESERVED_PATHS.has(segment.toLowerCase())) return undefined
    return segment
  } catch {
    return undefined
  }
}

export class BandcampClient {
  readonly session: Session
  private detailCache = new Map<number, AlbumDetail>()
  private purchaseInfoCache = new Map<string, PurchaseInfo>()

  constructor() {
    this.session = session.fromPartition(BANDCAMP_PARTITION)
    this.session.setUserAgent(BANDCAMP_UA)
    this.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers)
    if (!headers.has('User-Agent')) headers.set('User-Agent', BANDCAMP_UA)
    if (!headers.has('Accept')) headers.set('Accept', 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8')
    if (!headers.has('Accept-Language')) headers.set('Accept-Language', 'en-US,en;q=0.9')
    return this.session.fetch(url, { ...init, headers, redirect: 'follow' })
  }

  /** Binary/HTML fetch with the Bandcamp session (used by media and downloads). */
  async fetchRaw(url: string, init: RequestInit = {}): Promise<Response> {
    return this.request(url, init)
  }

  async hasIdentityCookie(): Promise<boolean> {
    const cookies = await this.session.cookies.get({ name: 'identity' })
    return cookies.some((cookie) => cookie.value.length > 0)
  }

  async getHomepageBlob(): Promise<Record<string, unknown> | null> {
    const response = await this.request(`${API}/`)
    if (!response.ok) return null
    const html = await response.text()
    const blob = extractPageBlob(html)
    return blob && typeof blob === 'object' ? (blob as Record<string, unknown>) : null
  }

  async discoverFromBlob(blob: unknown): Promise<DiscoveredIdentity | null> {
    const fan = findFanData(blob)
    if (!fan?.username || !fan.fan_id) return null
    return {
      username: fan.username,
      fanId: fan.fan_id,
      displayName: fan.name,
      isOwnPage: fan.is_own_page === true
    }
  }

  async discoverFromPage(url: string): Promise<{ identity: DiscoveredIdentity | null; finalUrl: string; blob: unknown | null }> {
    const response = await this.request(url)
    const finalUrl = response.url
    const html = await response.text()
    const blob = extractPageBlob(html)
    const identity = await this.discoverFromBlob(blob)
    return { identity, finalUrl, blob }
  }

  async discoverIdentity(hint?: IdentityHint): Promise<DiscoveredIdentity | null> {
    // 1. The page that is open at the moment the login cookie appears is often
    // the fan's own profile and already contains their fan data.
    if (hint) {
      if (hint.blob) {
        try {
          const parsed = JSON.parse(hint.blob)
          const found = await this.discoverFromBlob(parsed)
          if (found) return found
        } catch {
          // Ignore malformed hints from the page.
        }
      }
      const fromHintUrl = usernameFromUrl(hint.url)
      if (fromHintUrl) {
        const validated = await this.validateUsername(fromHintUrl)
        if (validated) return validated
      }
      for (const link of hint.links ?? []) {
        const candidate = usernameFromUrl(link.href)
        if (!candidate) continue
        if (!/profile|collection|fan page|my music/i.test(link.text ?? '')) continue
        const validated = await this.validateUsername(candidate)
        if (validated) return validated
      }
    }

    // 2. Homepage blob. Logged-in Bandcamp pages usually expose the fan through
    // one of several config branches.
    try {
      const homepage = await this.getHomepageBlob()
      const found = await this.discoverFromBlob(homepage)
      if (found) return found
    } catch (error) {
      console.warn('Could not inspect Bandcamp homepage for identity', error)
    }

    // 3. /profile redirects to the fan's page (or to login when the cookie is stale).
    try {
      const profile = await this.discoverFromPage(`${API}/profile`)
      if (profile.identity) return profile.identity
      const candidate = usernameFromUrl(profile.finalUrl)
      if (candidate) {
        const validated = await this.validateUsername(candidate)
        if (validated) return validated
      }
    } catch (error) {
      console.warn('Could not inspect Bandcamp profile for identity', error)
    }

    return null
  }

  async validateUsername(username: string): Promise<DiscoveredIdentity | null> {
    if (!/^[A-Za-z0-9_-]+$/.test(username)) return null
    try {
      const response = await this.request(`${API}/${encodeURIComponent(username)}`)
      if (!response.ok) return null
      const html = await response.text()
      const blob = extractPageBlob(html)
      const fan = findFanData(blob)
      if (!fan?.fan_id || !fan.username) return null
      if (fan.username.toLowerCase() !== username.toLowerCase()) return null
      return {
        username: fan.username,
        fanId: fan.fan_id,
        displayName: fan.name,
        isOwnPage: fan.is_own_page === true
      }
    } catch {
      return null
    }
  }

  async fetchFanPage(username: string): Promise<{
    fan: DiscoveredIdentity
    collection: Album[]
    wishlist: Album[]
    redownloads: Record<string, string>
    collectionToken?: string
    wishlistToken?: string
    collectionMore: boolean
    wishlistMore: boolean
  }> {
    const response = await this.request(`${API}/${encodeURIComponent(username)}`)
    if (!response.ok) throw new Error(`Bandcamp returned ${response.status} for @${username}`)
    const html = await response.text()
    const blob = extractPageBlob(html) as CollectionPageData | null
    if (!blob?.fan_data?.fan_id || !blob.fan_data.username) {
      throw new Error('That Bandcamp profile could not be read. Make sure the username is correct.')
    }
    const redownloads = { ...(blob.collection_data?.redownload_urls ?? {}) }
    const collectionCache = blob.item_cache?.collection ?? {}
    const sequence = blob.collection_data?.sequence ?? Object.keys(collectionCache)
    const collection: Album[] = []
    for (const key of sequence) {
      const raw = collectionCache[key]
      if (!raw) continue
      const album = toAlbum(raw, redownloads)
      if (album) collection.push(album)
    }

    const wishlistCache = blob.item_cache?.wishlist ?? {}
    const wishlistSequence = blob.wishlist_data?.sequence ?? Object.keys(wishlistCache)
    const wishlist: Album[] = []
    for (const key of wishlistSequence) {
      const raw = wishlistCache[key]
      if (!raw) continue
      const album = toAlbum(raw, redownloads)
      if (album) wishlist.push(album)
    }

    return {
      fan: {
        username: blob.fan_data.username,
        fanId: blob.fan_data.fan_id,
        displayName: blob.fan_data.name,
        isOwnPage: blob.fan_data.is_own_page === true
      },
      collection,
      wishlist,
      redownloads,
      collectionToken: blob.collection_data?.last_token,
      wishlistToken: blob.wishlist_data?.last_token,
      collectionMore:
        (blob.collection_data?.item_count ?? 0) > (blob.collection_data?.batch_size ?? 20),
      wishlistMore: (blob.wishlist_data?.item_count ?? 0) > (blob.wishlist_data?.batch_size ?? 20)
    }
  }

  private async fetchCollectionPage(
    fanId: number,
    token: string,
    kind: 'collection_items' | 'wishlist_items'
  ): Promise<CollectionApiPage> {
    const response = await this.request(`${API}/api/fancollection/1/${kind}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Origin: API,
        Referer: `${API}/`
      },
      body: JSON.stringify({ fan_id: fanId, older_than_token: token, count: 100 })
    })
    if (!response.ok) throw new Error(`Bandcamp collection request failed (${response.status})`)
    const text = await response.text()
    try {
      return JSON.parse(text) as CollectionApiPage
    } catch {
      throw new Error('Bandcamp returned an unexpected collection response.')
    }
  }

  async syncLibrary(
    username: string,
    expectedFanId: number | undefined,
    onProgress: (progress: SyncProgress) => void
  ): Promise<{ collection: Album[]; wishlist: Album[]; redownloads: Record<string, string>; fan: DiscoveredIdentity }> {
    onProgress({ progress: 0.05, message: 'Reading your collection…', collectionCount: 0, wishlistCount: 0 })
    const page = await this.fetchFanPage(username)
    if (expectedFanId && page.fan.fanId !== expectedFanId) {
      throw new Error('The signed-in Bandcamp account does not match the cached profile.')
    }
    const fanId = page.fan.fanId
    const redownloads = { ...page.redownloads }
    const collection = [...page.collection]
    const wishlist = [...page.wishlist]
    const seenCollection = new Set(collection.map((album) => album.key))
    const seenWishlist = new Set(wishlist.map((album) => album.key))

    onProgress({
      progress: 0.2,
      message: `Loading collection · ${collection.length} found`,
      collectionCount: collection.length,
      wishlistCount: wishlist.length
    })

    // The fan page blob can omit its redownload map, so keep paging through the
    // collection API while purchases are still missing a download link.
    const needsPurchaseLinks = collection.some(
      (album) => album.saleItemId && !findRedownload(redownloads, album.saleItemId, album.saleItemType)
    )
    if (page.collectionToken && (page.collectionMore || needsPurchaseLinks)) {
      let token: string | undefined = page.collectionToken
      let pages = 0
      while (token && pages < 200) {
        const result = await this.fetchCollectionPage(fanId, token, 'collection_items')
        if (result.error) {
          // A repair pass that only looks for download links must not fail the sync.
          if (page.collectionMore) {
            throw new Error(result.error_message || 'Bandcamp rejected the collection request.')
          }
          break
        }
        for (const [saleId, url] of Object.entries(result.redownload_urls ?? {})) redownloads[saleId] = url
        for (const raw of result.items ?? []) {
          const album = toAlbum(raw, redownloads)
          if (album && !seenCollection.has(album.key)) {
            seenCollection.add(album.key)
            collection.push(album)
          }
        }
        pages += 1
        token = result.more_available ? result.last_token : undefined
        onProgress({
          progress: Math.min(0.75, 0.2 + pages * 0.055),
          message: `Loading collection · ${collection.length} found`,
          collectionCount: collection.length,
          wishlistCount: wishlist.length
        })
      }
    }

    if (page.wishlistMore && page.wishlistToken) {
      let token: string | undefined = page.wishlistToken
      let pages = 0
      while (token && pages < 200) {
        const result = await this.fetchCollectionPage(fanId, token, 'wishlist_items')
        if (result.error) break
        for (const raw of result.items ?? []) {
          const album = toAlbum(raw, redownloads)
          if (album && !seenWishlist.has(album.key)) {
            seenWishlist.add(album.key)
            wishlist.push(album)
          }
        }
        pages += 1
        token = result.more_available ? result.last_token : undefined
        onProgress({
          progress: Math.min(0.9, 0.76 + pages * 0.03),
          message: `Loading wishlist · ${wishlist.length} found`,
          collectionCount: collection.length,
          wishlistCount: wishlist.length
        })
      }
    }

    // Purchase URLs are only present when signed in. Recompute availability now
    // that every page has contributed its redownload links.
    const finalize = (album: Album): Album => {
      const available = Boolean(findRedownload(redownloads, album.saleItemId, album.saleItemType))
      return { ...album, purchaseDownloadable: available }
    }

    onProgress({
      progress: 0.95,
      message: 'Finishing up…',
      collectionCount: collection.length,
      wishlistCount: wishlist.length
    })

    return {
      collection: collection.map(finalize),
      wishlist: wishlist.map(finalize),
      redownloads,
      fan: page.fan
    }
  }

  async fetchAlbumDetail(album: Album, force = false): Promise<AlbumDetail> {
    const cached = this.detailCache.get(album.itemId)
    if (!force && cached && Date.now() - cached.fetchedAt < 1000 * 60 * 10) return cached

    const url = new URL(`${API}/api/mobile/24/tralbum_details`)
    url.searchParams.set('band_id', String(album.bandId))
    url.searchParams.set('tralbum_id', String(album.tralbumId))
    url.searchParams.set('tralbum_type', album.tralbumType)
    const response = await this.request(url.toString(), {
      headers: { Accept: 'application/json', Referer: `${API}/` }
    })
    if (!response.ok) throw new Error(`Could not load ${album.title} (${response.status})`)
    const data = (await response.json()) as MobileTralbum
    if (data.error) throw new Error(data.error_message || 'Bandcamp could not load this release.')
    const tracks: Track[] = (data.tracks ?? []).map((raw, index) => {
      const stream = raw.streaming_url?.['mp3-128'] ?? raw.streaming_url?.['mp3-320'] ?? raw.file?.['mp3-128']
      const streamUrls: Record<string, string> = { ...(raw.file ?? {}), ...(raw.streaming_url ?? {}) }
      return {
        id: raw.track_id ?? raw.id ?? index + 1,
        title: raw.title ?? 'Untitled',
        artist: raw.band_name ?? raw.artist ?? data.band?.name ?? album.bandName,
        number: raw.track_num ?? raw.track_number ?? index + 1,
        duration: raw.duration ?? 0,
        streamUrl: stream,
        streamUrls: Object.keys(streamUrls).length ? streamUrls : undefined,
        isStreamable: raw.is_streamable !== false
      }
    })
    const artId = data.art_id ?? album.artId
    const detail: AlbumDetail = {
      key: album.key,
      tralbumId: album.tralbumId,
      tralbumType: album.tralbumType,
      bandId: data.band?.band_id ?? album.bandId,
      bandName: data.band?.name ?? album.bandName,
      title: data.title ?? album.title,
      artId,
      artUrl: artUrl(artId, 10) ?? album.artUrl,
      about: stripHtml(data.about),
      credits: stripHtml(data.credits),
      releaseDate: normalizeReleaseDate(data.release_date),
      itemUrl: data.bandcamp_url ?? album.itemUrl,
      tracks,
      fetchedAt: Date.now()
    }
    this.detailCache.set(album.itemId, detail)
    if (tracks.length === 0) throw new Error('This release has no streamable tracks.')
    return detail
  }

  async getStreamUrl(album: Album, trackId: number, current?: AlbumDetail): Promise<{ url: string; detail: AlbumDetail }> {
    let detail = current ?? this.detailCache.get(album.itemId)
    const stale = !detail || Date.now() - detail.fetchedAt > 1000 * 60 * 20
    if (stale) detail = await this.fetchAlbumDetail(album, true)
    if (!detail) throw new Error('Release details are unavailable.')
    let track = detail.tracks.find((entry) => entry.id === trackId)
    if (!track?.streamUrl) {
      detail = await this.fetchAlbumDetail(album, true)
      track = detail.tracks.find((entry) => entry.id === trackId)
    }
    if (!track?.streamUrl) throw new Error('This track cannot be streamed right now.')
    return { url: track.streamUrl, detail }
  }

  async searchDiscover(query: string): Promise<DiscoverResult[]> {
    const response = await this.request(`${API}/api/bcsearch_public_api/1/autocomplete_elastic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ search_text: query, search_filter: '', full_page: true, fan_id: null })
    })
    if (!response.ok) throw new Error(`Bandcamp search failed (${response.status}).`)
    const data = (await response.json()) as { auto?: { results?: RawSearchResult[] } }
    return (data.auto?.results ?? [])
      .map((raw) => toDiscoverResult(raw))
      .filter((entry): entry is DiscoverResult => Boolean(entry))
  }

  async fetchArtist(bandId: number): Promise<DiscoverArtist> {
    const response = await this.request(`${API}/api/mobile/24/band_details?band_id=${bandId}`, {
      headers: { Accept: 'application/json', Referer: `${API}/` }
    })
    if (!response.ok) throw new Error(`Could not load this artist (${response.status}).`)
    const data = (await response.json()) as BandDetails
    if (!data.name) throw new Error('Bandcamp did not return that artist.')
    const releases: DiscoverResult[] = (data.discography ?? [])
      .filter((entry) => entry.item_id && entry.title)
      .map((entry) => ({
        kind: entry.item_type === 'track' ? 'track' : 'album',
        id: entry.item_id as number,
        bandId,
        bandName: entry.band_name ?? data.name,
        title: entry.title as string,
        url: data.bandcamp_url ?? '',
        artUrl: artUrl(entry.art_id, 9),
        releaseDate: entry.release_date
      }))
    return {
      bandId,
      name: data.name,
      url: data.bandcamp_url ?? '',
      image: imageUrl(data.bio_image_id, 10),
      bio: stripHtml(data.bio),
      releases
    }
  }

  async fetchDiscoveredAlbum(bandId: number, tralbumId: number, tralbumType: TralbumType): Promise<DiscoverAlbum> {
    const url = new URL(`${API}/api/mobile/24/tralbum_details`)
    url.searchParams.set('band_id', String(bandId))
    url.searchParams.set('tralbum_id', String(tralbumId))
    url.searchParams.set('tralbum_type', tralbumType)
    const response = await this.request(url.toString(), {
      headers: { Accept: 'application/json', Referer: `${API}/` }
    })
    if (!response.ok) throw new Error(`Could not load this release (${response.status}).`)
    const data = (await response.json()) as MobileTralbum
    if (data.error) throw new Error(data.error_message || 'Bandcamp could not load this release.')
    const tracks: Track[] = (data.tracks ?? []).map((raw, index) => {
      const stream = raw.streaming_url?.['mp3-128'] ?? raw.streaming_url?.['mp3-320'] ?? raw.file?.['mp3-128']
      return {
        id: raw.track_id ?? raw.id ?? index + 1,
        title: raw.title ?? 'Untitled',
        artist: raw.band_name ?? data.band?.name ?? 'Unknown artist',
        number: raw.track_num ?? raw.track_number ?? index + 1,
        duration: raw.duration ?? 0,
        streamUrl: stream,
        isStreamable: raw.is_streamable !== false
      }
    })
    return {
      bandId,
      tralbumId,
      tralbumType,
      title: data.title ?? 'Untitled',
      bandName: data.band?.name ?? 'Unknown artist',
      url: data.bandcamp_url ?? '',
      artUrl: artUrl(data.art_id, 10),
      about: stripHtml(data.about),
      tracks
    }
  }

  clearMemoryCache(): void {
    this.detailCache.clear()
    this.purchaseInfoCache.clear()
  }

  async fetchPurchaseInfo(redownloadUrl: string): Promise<PurchaseInfo> {
    const cached = this.purchaseInfoCache.get(redownloadUrl)
    if (cached) return cached
    const response = await this.request(redownloadUrl, { headers: { Referer: `${API}/` } })
    if (!response.ok) throw new Error(`The download page returned ${response.status}.`)
    const html = await response.text()
    const blob = extractPageBlob(html) as Record<string, unknown> | null
    const items = (blob?.digital_items ?? blob?.download_items) as Array<Record<string, unknown>> | undefined
    const digitalItem = items?.[0]
    if (!digitalItem) throw new Error('This purchase has no digital download attached.')
    const rawDownloads = (digitalItem.downloads ?? {}) as Record<string, unknown>
    const downloads: Record<string, { url: string; size?: number }> = {}
    for (const [format, value] of Object.entries(rawDownloads)) {
      if (typeof value === 'string') {
        downloads[format] = { url: value }
      } else if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>
        if (typeof record.url === 'string') {
          downloads[format] = {
            url: record.url,
            size: typeof record.size === 'number' ? record.size : undefined
          }
        }
      }
    }
    if (Object.keys(downloads).length === 0) throw new Error('No downloadable formats were found for this purchase.')
    const formats = Object.entries(downloads).map(([id, value]) => ({
      id,
      label: formatLabel(id),
      size: value.size
    }))
    const info: PurchaseInfo = {
      title: typeof digitalItem.title === 'string' ? digitalItem.title : 'Untitled',
      artist: typeof digitalItem.artist === 'string' ? digitalItem.artist : 'Unknown artist',
      formats,
      digitalItem,
      downloads
    }
    this.purchaseInfoCache.set(redownloadUrl, info)
    return info
  }

  async resolvePurchaseDownload(redownloadUrl: string, format: string): Promise<PurchaseDownloadLink> {
    const info = await this.fetchPurchaseInfo(redownloadUrl)
    const chosen = info.downloads[format] ?? info.downloads[info.formats[0]?.id ?? '']
    if (!chosen) throw new Error('That download format is not available.')
    let finalUrl = chosen.url
    try {
      const stat = new URL(chosen.url, API)
      stat.pathname = stat.pathname.replace(/\/download(\/|$)/, '/statdownload$1')
      stat.searchParams.set('.vrs', '1')
      stat.searchParams.set('.rand', String(Math.floor(Math.random() * 1_000_000_000)))
      const response = await this.request(stat.toString(), {
        headers: { Accept: 'text/html,application/json;q=0.9,*/*;q=0.8', Referer: redownloadUrl }
      })
      if (response.ok) {
        const text = await response.text()
        const parsed = parseStatResult(text)
        if (parsed?.download_url) finalUrl = parsed.download_url
      }
    } catch (error) {
      console.warn('Could not resolve the final download URL, using the original link', error)
    }
    return {
      url: finalUrl,
      suggestedName: typeof info.digitalItem.download_type_str === 'string' ? `${info.title} (${info.digitalItem.download_type_str})` : undefined,
      info
    }
  }
}

export function formatLabel(id: string): string {
  const labels: Record<string, string> = {
    'mp3-v0': 'MP3 V0',
    'mp3-320': 'MP3 320',
    'mp3-128': 'MP3 128',
    flac: 'FLAC',
    'flac-16': 'FLAC 16-bit',
    'flac-24': 'FLAC 24-bit',
    wav: 'WAV',
    aiff: 'AIFF',
    alac: 'ALAC',
    ogg: 'OGG',
    zip: 'ZIP'
  }
  return labels[id] ?? id.replace(/[-_]/g, ' ').toUpperCase()
}

function parseStatResult(text: string): { download_url?: string; url?: string } | null {
  const direct = text.trim()
  if (direct.startsWith('{')) {
    try {
      return JSON.parse(direct) as { download_url?: string; url?: string }
    } catch {
      // Fall through to the script wrapper.
    }
  }
  const marker = 'Downloads.statResult'
  const index = text.indexOf(marker)
  if (index === -1) return null
  const open = text.indexOf('(', index + marker.length)
  if (open === -1) return null
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false
  for (let i = open; i < text.length; i += 1) {
    const char = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') {
      if (depth === 0) start = i
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0 && start !== -1) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as { download_url?: string; url?: string }
        } catch {
          return null
        }
      }
    }
  }
  return null
}

export function absoluteArt(album: Album, size: 9 | 10 | 3 = 9): string | undefined {
  return artUrl(album.artId, size) ?? album.artUrl
}
