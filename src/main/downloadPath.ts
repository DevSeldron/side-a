import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/**
 * A saved file counts as available only when it sits in the folder downloads go
 * to right now. Files from an older folder stay on disk untouched, but the row
 * offers Download again instead of opening something outside the chosen folder.
 */
export function savedFileMissing(directory: string, filePath: string | undefined): boolean {
  if (!filePath) return true
  if (resolve(dirname(filePath)) !== resolve(directory)) return true
  return !existsSync(filePath)
}
