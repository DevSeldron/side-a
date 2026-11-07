import { _electron as electron } from 'playwright-core'
import { mkdir, rm } from 'node:fs/promises'

const out = 'site/assets/screens'
await mkdir(out, { recursive: true })
await rm('/tmp/sidea-site-capture', { recursive: true, force: true })

const app = await electron.launch({
  args: ['.', '--user-data-dir=/tmp/sidea-site-capture'],
  env: { ...process.env, SIDEA_DEMO: '1' }
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

await page.waitForSelector('.app-shell', { timeout: 30000 })
await page.waitForSelector('.album-card', { timeout: 60000 })
await page.waitForTimeout(2600)
await page.mouse.move(1200, 120)

await page.screenshot({ path: `${out}/collection.png` })
console.log('collection.png')

await page.locator('.album-card').first().click()
await page.waitForSelector('.track-row', { timeout: 20000 })
await page.waitForTimeout(900)
await page.mouse.move(1200, 120)
await page.screenshot({ path: `${out}/album.png` })
console.log('album.png')

await page.locator('.album-actions .button.primary').first().click()
await page.waitForTimeout(3200)
await page.mouse.move(1200, 120)
await page.screenshot({ path: `${out}/playing.png` })
console.log('playing.png')

const nowButton = page.locator('.player-side .icon-button[title="Open now playing"]')
if (await nowButton.count()) {
  await nowButton.click()
  await page.waitForSelector('.now-playing', { timeout: 8000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${out}/now-playing.png` })
  console.log('now-playing.png')
  await page.locator('.now-playing .now-close').click()
  await page.waitForTimeout(400)
}

await page.locator('.nav-item', { hasText: 'Discover' }).click()
await page.waitForSelector('.discover-search input', { timeout: 10000 })
await page.locator('.discover-search input').fill('Nils Frahm')
await page.waitForSelector('.discover-card-art img', { timeout: 20000 })
await page.waitForTimeout(1800)
await page.mouse.move(1200, 120)
await page.screenshot({ path: `${out}/discover.png` })
console.log('discover.png')

await page.locator('.nav-item', { hasText: 'Settings' }).click()
await page.waitForSelector('.settings-page', { timeout: 10000 })
await page.waitForTimeout(900)
await page.mouse.move(1200, 120)
await page.screenshot({ path: `${out}/settings.png` })
console.log('settings.png')

await app.close()
console.log('Saved app screenshots to', out)
