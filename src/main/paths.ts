import { app } from 'electron'
import { join } from 'node:path'

export interface AppPaths {
  userData: string
  dataFile: string
  offlineRoot: string
  mediaRoot: string
  logsRoot: string
}

let cached: AppPaths | null = null

export function getAppPaths(): AppPaths {
  if (cached) return cached
  const userData = app.getPath('userData')
  cached = {
    userData,
    dataFile: join(userData, 'side-a.json'),
    offlineRoot: join(userData, 'offline'),
    mediaRoot: join(userData, 'media'),
    logsRoot: join(userData, 'logs')
  }
  return cached
}
