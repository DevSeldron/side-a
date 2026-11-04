import { _electron as electron } from 'playwright-core'
import { mkdir, rm } from 'node:fs/promises'

const out = 'site/assets/screens'
await mkdir(out, { recursive: true })
await rm('/tmp/sidea-welcome-capture', { recursive: true, force: true })

const env = { ...process.env }
delete env.SIDEA_DEMO

const app = await electron.launch({
  args: ['.', '--user-data-dir=/tmp/sidea-welcome-capture'],
  env
})

const page = await app.firstWindow()
page.on('pageerror', (error) => console.log('PAGE ERROR:', error.message))

try {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.setSize(1440, 900)
    win.center()
  })
} catch (error) {
  console.log('Could not resize window:', error.message)
}

await page.waitForSelector('.welcome-panel', { timeout: 30000 })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${out}/welcome.png` })
console.log('welcome.png')

await app.close()
