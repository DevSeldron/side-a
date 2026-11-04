/** Parses "v1.2.3" or "1.2" into numeric parts. */
export function parseVersion(value: string): number[] {
  const match = /(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(value.replace(/^v/i, ''))
  if (!match) return [0, 0, 0]
  return [Number(match[1] ?? 0), Number(match[2] ?? 0), Number(match[3] ?? 0)]
}

/** True when `latest` is a strictly newer release than `current`. */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] ?? 0) > (b[index] ?? 0)) return true
    if ((a[index] ?? 0) < (b[index] ?? 0)) return false
  }
  return false
}
