import { app } from 'electron'
import { execFile, spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { autoUpdater } from 'electron-updater'
import type { UpdateInfo } from '@shared/types'
import { isNewerVersion } from '@shared/version'

const FIRST_CHECK_DELAY = 8000
const CHECK_INTERVAL = 6 * 60 * 60 * 1000

/**
 * Waits for Side A to exit, swaps the bundle with the downloaded one and opens
 * it again. macOS will not install an unsigned build through Squirrel, so an
 * unsigned copy replaces itself after quitting instead of sending the listener
 * to the releases page.
 */
const MAC_SWAP_SCRIPT = `#!/bin/bash
pid="$1"
archive="$2"
bundle="$3"
while kill -0 "$pid" 2>/dev/null; do sleep 0.4; done
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
if ! ditto -x -k "$archive" "$tmp"; then open "$bundle"; exit 1; fi
new="$(/usr/bin/find "$tmp" -maxdepth 1 -name '*.app' -print -quit)"
if [ ! -x "$new/Contents/MacOS/Side A" ]; then open "$bundle"; exit 1; fi
staged="$bundle.new"
rm -rf "$staged"
if ! ditto "$new" "$staged"; then open "$bundle"; exit 1; fi
rm -rf "$bundle"
if ! mv "$staged" "$bundle"; then open "$staged"; exit 1; fi
open "$bundle"
`

let current: UpdateInfo = { available: false, status: 'idle' }
let notify: ((info: UpdateInfo) => void) | null = null
let configuring: Promise<void> | null = null
let canInstallInPlace = process.platform !== 'darwin'
let checking = false
let downloadedFile: string | null = null

function publish(patch: Partial<UpdateInfo>): UpdateInfo {
  current = { ...current, ...patch }
  notify?.(current)
  return current
}

/** A bundle without a Developer ID cannot be swapped by Squirrel.Mac. */
function macBundleSigned(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('codesign', ['-dv', '--verbose=2', app.getPath('exe')], (error, _stdout, stderr) => {
      resolve(!error && /Authority=/.test(String(stderr)))
    })
  })
}

function configure(): Promise<void> {
  if (configuring) return configuring
  configuring = (async () => {
    canInstallInPlace = process.platform !== 'darwin' || (await macBundleSigned())
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = canInstallInPlace
    autoUpdater.allowPrerelease = false
    autoUpdater.allowDowngrade = false
    autoUpdater.setFeedURL({ provider: 'github', owner: 'DevSeldron', repo: 'side-a' })

    autoUpdater.on('checking-for-update', () => {
      if (current.status !== 'ready') publish({ status: 'checking' })
    })
    autoUpdater.on('update-available', (info) => {
      publish({
        available: true,
        version: info.version,
        name: info.releaseName ?? undefined,
        status: 'downloading',
        percent: 0,
        message: undefined
      })
    })
    autoUpdater.on('update-not-available', () => {
      publish({ available: false, status: 'idle', version: undefined, percent: undefined, message: undefined })
    })
    autoUpdater.on('download-progress', (progress) => {
      publish({ status: 'downloading', percent: Math.max(0, Math.min(1, progress.percent / 100)) })
    })
    autoUpdater.on('update-downloaded', (info) => {
      downloadedFile = info.downloadedFile ?? null
      publish({ available: true, version: info.version, status: 'ready', percent: 1, message: undefined })
    })
    autoUpdater.on('error', (error) => {
      publish({ message: error.message })
    })

    const check = (): void => {
      void checkForUpdates()
    }
    setTimeout(check, FIRST_CHECK_DELAY)
    setInterval(check, CHECK_INTERVAL).unref()
  })()
  return configuring
}

/** Checks, and downloads in the background when there is something newer. */
export async function checkForUpdates(): Promise<UpdateInfo> {
  if (!app.isPackaged) return current
  await configure()
  if (checking) return current
  checking = true
  publish({ status: current.status === 'ready' ? 'ready' : 'checking' })
  try {
    const result = await autoUpdater.checkForUpdates()
    const version = result?.updateInfo.version
    if (!version || !isNewerVersion(version, app.getVersion())) {
      publish({ available: false, status: 'idle', version: undefined, percent: undefined, message: undefined })
    } else {
      publish({ available: true, version })
    }
  } catch (error) {
    publish({ message: error instanceof Error ? error.message : 'Could not check for updates' })
    if (!current.available) publish({ status: 'idle' })
  } finally {
    checking = false
  }
  return current
}

export function updateState(): UpdateInfo {
  return current
}

/**
 * Installs the release that has already downloaded. Windows and signed macOS
 * builds hand off to Squirrel; an unsigned macOS build swaps its own bundle
 * with a detached script once this process exits.
 */
export async function installUpdate(): Promise<void> {
  if (current.status !== 'ready') return
  publish({ status: 'installing' })
  if (process.platform === 'darwin' && !canInstallInPlace) {
    await installOnMac()
    return
  }
  autoUpdater.quitAndInstall(false, true)
}

async function installOnMac(): Promise<void> {
  if (!downloadedFile) throw new Error('The update has not finished downloading')
  const exe = app.getPath('exe')
  const marker = exe.indexOf('.app/')
  if (marker < 0) throw new Error('Side A is not running from an application bundle')
  const bundle = exe.slice(0, marker + 4)
  try {
    await access(dirname(bundle), constants.W_OK)
  } catch {
    throw new Error('Side A cannot replace itself in this folder')
  }
  const script = join(tmpdir(), `sidea-update-${process.pid}.sh`)
  await writeFile(script, MAC_SWAP_SCRIPT, { mode: 0o755 })
  spawn('/bin/bash', [script, String(process.pid), downloadedFile, bundle], {
    detached: true,
    stdio: 'ignore'
  }).unref()
  app.quit()
}

/** Starts the background updater and streams its state to the renderer. */
export function startAutoUpdater(emit: (info: UpdateInfo) => void): void {
  notify = emit
  if (!app.isPackaged) return
  void configure()
}
