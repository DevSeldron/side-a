import { app, dialog, shell } from 'electron'
import { execFile } from 'node:child_process'
import { autoUpdater } from 'electron-updater'

const RELEASE_PAGE = 'https://github.com/DevSeldron/side-a/releases/latest'
const FIRST_CHECK_DELAY = 5000
const CHECK_INTERVAL = 6 * 60 * 60 * 1000

/**
 * Squirrel can only swap a bundle that carries a valid signature, so an
 * unsigned macOS build has to fall back to a manual download. Windows
 * installers update without signing.
 */
function macBundleSigned(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('codesign', ['-dv', '--verbose=2', app.getPath('exe')], (error, _stdout, stderr) => {
      resolve(!error && /Authority=/.test(String(stderr)))
    })
  })
}

async function configure(): Promise<void> {
  const installable = process.platform !== 'darwin' || (await macBundleSigned())

  autoUpdater.autoDownload = installable
  autoUpdater.autoInstallOnAppQuit = installable
  autoUpdater.allowPrerelease = false
  autoUpdater.setFeedURL({ provider: 'github', owner: 'DevSeldron', repo: 'side-a' })

  autoUpdater.on('error', (error) => {
    console.warn('Auto update failed', error.message)
  })

  let notified = false
  autoUpdater.on('update-available', (info) => {
    if (installable || notified) return
    notified = true
    void dialog
      .showMessageBox({
        type: 'info',
        buttons: ['Download update', 'Not now'],
        defaultId: 0,
        cancelId: 1,
        title: 'Side A update',
        message: `Side A ${info.version} is available`,
        detail:
          'This macOS build is not code signed, so it cannot install itself in place. Download the release and replace the app to update.'
      })
      .then((result) => {
        if (result.response === 0) void shell.openExternal(RELEASE_PAGE)
      })
      .catch(() => undefined)
  })

  // Download first, then restart straight into the new build so the update is
  // applied the moment it is ready. The store flushes on before-quit.
  autoUpdater.on('update-downloaded', () => {
    autoUpdater.quitAndInstall(true, true)
  })

  const check = (): void => {
    void autoUpdater.checkForUpdates().catch((error: unknown) => {
      console.warn('Auto update check failed', error instanceof Error ? error.message : error)
    })
  }

  setTimeout(check, FIRST_CHECK_DELAY)
  setInterval(check, CHECK_INTERVAL).unref()
}

/** Silent updates from the latest GitHub release; a no-op outside packages. */
export function startAutoUpdater(): void {
  if (!app.isPackaged) return
  void configure()
}
