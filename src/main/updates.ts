import { app } from 'electron'
import type { UpdateInfo } from '@shared/types'
import { isNewerVersion } from '@shared/version'

const REPO = 'DevSeldron/side-a'
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases/latest`
const RELEASE_PAGE = `https://github.com/${REPO}/releases/latest`

/**
 * Asks GitHub for the newest published release. The repository is public, so
 * this works without a token; any failure (offline, rate limit) is treated as
 * "no update" rather than bothering the listener.
 */
export async function checkForUpdate(): Promise<UpdateInfo> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(RELEASES_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `SideA/${app.getVersion()}`
      },
      signal: controller.signal
    })
    if (!response.ok) return { available: false }
    const body = (await response.json()) as { tag_name?: string; html_url?: string; name?: string }
    const tag = body.tag_name?.trim()
    if (!tag) return { available: false }
    const version = tag.replace(/^v/i, '')
    if (!isNewerVersion(version, app.getVersion())) return { available: false }
    return {
      available: true,
      version,
      url: body.html_url ?? RELEASE_PAGE,
      name: body.name ?? undefined
    }
  } catch {
    return { available: false }
  } finally {
    clearTimeout(timer)
  }
}
