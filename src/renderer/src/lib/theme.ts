import type { ThemeMode } from '@shared/types'

export interface AccentPreset {
  name: string
  value: string
}

export const FALLBACK_ACCENT = '#2ad4c0'

export const ACCENT_PRESETS: AccentPreset[] = [
  { name: 'Teal', value: '#2ad4c0' },
  { name: 'Ember', value: '#ff8a5c' },
  { name: 'Violet', value: '#b39cff' },
  { name: 'Sky', value: '#7bb7ff' },
  { name: 'Rose', value: '#ff84ab' },
  { name: 'Lime', value: '#c8f06a' }
]

export function parseHex(value: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim())
  if (!match?.[1]) return null
  const numeric = Number.parseInt(match[1], 16)
  return [(numeric >> 16) & 255, (numeric >> 8) & 255, numeric & 255]
}

export function normalizeAccent(value: string | undefined): string {
  const rgb = value ? parseHex(value) : null
  if (!rgb) return FALLBACK_ACCENT
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

/** Dark text on bright accents, white on deep ones. */
export function accentInk(value: string): string {
  const [r, g, b] = parseHex(value) ?? [102, 224, 204]
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.62 ? '#0d0d10' : '#ffffff'
}

/**
 * Accent colours are derived at runtime instead of being baked into the
 * stylesheet, so any hex the user picks gets matching soft/line/glow tints.
 */
export function applyTheme(accent: string, theme: ThemeMode): void {
  const root = document.documentElement
  const hex = normalizeAccent(accent)
  const [r, g, b] = parseHex(hex) ?? [102, 224, 204]
  root.dataset.theme = theme === 'light' ? 'light' : 'dark'
  root.style.setProperty('--accent', hex)
  root.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`)
  root.style.setProperty('--accent-ink', accentInk(hex))
  root.style.setProperty('--accent-soft', `rgba(${r}, ${g}, ${b}, 0.14)`)
  root.style.setProperty('--accent-line', `rgba(${r}, ${g}, ${b}, 0.36)`)
  root.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.22)`)
}
