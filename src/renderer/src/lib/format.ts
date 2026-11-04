import type { Album, AlbumDetail } from '@shared/types'

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

export function formatDuration(seconds: number, forceHours = false): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0 || forceHours) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

export function formatLongDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.round((seconds % 3600) / 60)
  if (hours > 0) return `${hours} hr ${minutes} min`
  return `${minutes} min`
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  const digits = value >= 100 || index <= 1 ? 0 : 1
  return `${value.toFixed(digits)} ${units[index]}`
}

export function parseBandcampDate(value?: string | number): Date | null {
  if (value === undefined || value === null || value === '') return null
  const raw = String(value).trim()
  if (!raw) return null

  // Bandcamp's tralbum API reports `release_date` as Unix seconds. Older cached
  // details still hold that number, so normalise here as well as in the main
  // process: treating seconds as milliseconds would land in January 1970.
  if (typeof value === 'number' || /^\d+$/.test(raw)) {
    const numeric = Number(raw)
    if (!Number.isFinite(numeric) || numeric <= 0) return null
    const date = new Date(numeric < 1e11 ? numeric * 1000 : numeric)
    if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 1990) return null
    return date
  }

  // A bare four-digit year (some fan pages report only this).
  if (/^\d{4}$/.test(raw)) {
    const date = new Date(`${raw}-01-01T00:00:00Z`)
    return Number.isNaN(date.getTime()) ? null : date
  }

  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(value?: string): string {
  const date = parseBandcampDate(value)
  if (!date) return ''
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatYear(value?: string): string | undefined {
  const date = parseBandcampDate(value)
  return date ? String(date.getFullYear()) : undefined
}

export function relativeDate(value?: string | number): string {
  if (!value) return ''
  const date = typeof value === 'number' ? new Date(value) : parseBandcampDate(value)
  if (!date) return ''
  const diff = Date.now() - date.getTime()
  const minutes = Math.round(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${count === 1 ? singular : pluralForm ?? `${singular}s`}`
}

export function coverUrl(album: Pick<Album, 'artId' | 'artUrl'>, size: 3 | 9 | 10 = 9): string {
  if (album.artId) return `https://f4.bcbits.com/img/a${album.artId}_${size}.jpg`
  return album.artUrl ?? ''
}

export function detailCover(detail: Pick<AlbumDetail, 'artId' | 'artUrl'>, size: 3 | 9 | 10 = 10): string {
  if (detail.artId) return `https://f4.bcbits.com/img/a${detail.artId}_${size}.jpg`
  return detail.artUrl ?? ''
}

export function initials(value?: string): string {
  if (!value) return 'S'
  const parts = value.replace(/[^a-zA-Z0-9 ]/g, ' ').trim().split(/\s+/)
  if (parts.length === 1) return (parts[0]?.slice(0, 2) ?? 'S').toUpperCase()
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function errorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.length) return error
  return fallback
}

export function shortPath(path: string, max = 44): string {
  if (path.length <= max) return path
  const pieces = path.split('/')
  const tail = pieces.slice(-2).join('/')
  return `…/${tail.length > max ? tail.slice(-max) : tail}`
}
