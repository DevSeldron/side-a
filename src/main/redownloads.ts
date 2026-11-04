import type { Album } from '@shared/types'

export type RedownloadMap = Record<string, string>

/**
 * Bandcamp keys its redownload map by `sale_item_type + sale_item_id`
 * (for example `p1234567`), not by the bare sale item id. Older captures of
 * this map used the bare id, so both shapes are accepted when looking up.
 */
export function redownloadKeys(saleItemId?: number, saleItemType?: string): string[] {
  if (!saleItemId) return []
  const keys: string[] = []
  if (saleItemType) keys.push(`${saleItemType}${saleItemId}`)
  keys.push(String(saleItemId))
  return keys
}

export function findRedownload(
  map: RedownloadMap | undefined,
  saleItemId?: number,
  saleItemType?: string
): string | undefined {
  if (!map) return undefined
  for (const key of redownloadKeys(saleItemId, saleItemType)) {
    const url = map[key]
    if (url) return url
  }
  // Some collection records omit `sale_item_type`, so match on the type prefix
  // plus the exact id when the direct lookups miss.
  const suffix = String(saleItemId ?? '')
  if (suffix) {
    for (const [key, url] of Object.entries(map)) {
      if (!url || !key.endsWith(suffix)) continue
      const prefix = key.slice(0, key.length - suffix.length)
      if (/^[a-z]{1,2}$/i.test(prefix)) return url
    }
  }
  return undefined
}

/** Recomputes `purchaseDownloadable` from the stored map. */
export function withPurchaseLink(album: Album, map: RedownloadMap): Album {
  const available = Boolean(findRedownload(map, album.saleItemId, album.saleItemType))
  if (album.purchaseDownloadable === available) return album
  return { ...album, purchaseDownloadable: available }
}
