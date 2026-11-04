import { safeStorage } from 'electron'

/**
 * API secrets and session keys are kept out of plain text when the OS keychain
 * is available. The prefixes make it possible to read data written on a machine
 * where encryption was unavailable.
 */
export function sealSecret(value: string): string {
  if (!value) return ''
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return `enc:${safeStorage.encryptString(value).toString('base64')}`
    }
  } catch {
    // Fall through to the plain-text envelope below.
  }
  return `raw:${Buffer.from(value, 'utf8').toString('base64')}`
}

export function openSecret(value: string): string {
  if (!value) return ''
  try {
    if (value.startsWith('enc:')) {
      return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'))
    }
    if (value.startsWith('raw:')) {
      return Buffer.from(value.slice(4), 'base64').toString('utf8')
    }
    return value
  } catch {
    return ''
  }
}
