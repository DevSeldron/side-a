import { safeStorage } from 'electron'

/**
 * API secrets and session keys are kept out of plain text when the OS keychain
 * is available. The prefixes make it possible to read data written on a machine
 * where encryption was unavailable.
 */
export async function sealSecret(value: string): Promise<string> {
  if (!value) return ''
  try {
    if (await safeStorage.isAsyncEncryptionAvailable()) {
      return `enc:${(await safeStorage.encryptStringAsync(value)).toString('base64')}`
    }
  } catch {
    // Fall through to the plain-text envelope below.
  }
  return `raw:${Buffer.from(value, 'utf8').toString('base64')}`
}

export async function openSecret(value: string): Promise<string> {
  if (!value) return ''
  try {
    if (value.startsWith('enc:')) {
      const encrypted = Buffer.from(value.slice(4), 'base64')
      let decrypted = await safeStorage.decryptStringAsync(encrypted)
      // A rotated keychain can ask for one more pass so the value is re-encrypted
      // with the current key before it is used.
      if (decrypted.shouldReEncrypt) {
        decrypted = await safeStorage.decryptStringAsync(encrypted)
      }
      return decrypted.result
    }
    if (value.startsWith('raw:')) {
      return Buffer.from(value.slice(4), 'base64').toString('utf8')
    }
    return value
  } catch {
    return ''
  }
}
