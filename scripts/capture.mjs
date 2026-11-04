import { _electron as electron } from 'playwright-core'
import { mkdir } from 'node:fs/promises'

const shots = '/private/var/folders/kn/h2ngd28d60scrqdf0vvdhqc80000gn/T/opencode/sidea-shots'
await mkdir(shots, { recursive: true })

const app = await electron.launch({
  args: ['.'],
  env: { ...process.env, SIDEA_DEMO: '1' }
})

const page = await app.firstWindow()
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text())
})
page.on('pageerror', (error) => console.log('PAGE ERROR:', error.message))

await page.waitForSelector('.app-shell', { timeout: 30000 })
await page.waitForSelector('.album-card', { timeout: 45000 })
await page.waitForTimeout(1500)

console.log('Auth:', await page.locator('.user-copy strong').first().textContent())
console.log('Albums:', await page.locator('.album-card').count())
await page.screenshot({ path: `${shots}/01-collection.png` })

await page.locator('.album-card').first().click()
await page.waitForSelector('.track-row', { timeout: 20000 })
await page.waitForTimeout(600)
await page.screenshot({ path: `${shots}/02-album.png` })

await page.locator('.album-actions .button.primary').first().click()
await page.waitForTimeout(3500)
await page.screenshot({ path: `${shots}/03-playing.png` })

await page.locator('.player-side .icon-button[title="Now playing"]').click()
await page.waitForTimeout(700)
await page.screenshot({ path: `${shots}/04-now-playing.png` })

await page.locator('.now-playing .now-close').click()
await page.waitForTimeout(400)
await page.goto(page.url().replace(/#.*$/, '#/downloads'))
await page.waitForTimeout(800)
await page.screenshot({ path: `${shots}/05-downloads.png` })

await page.goto(page.url().replace(/#.*$/, '#/settings'))
await page.waitForTimeout(800)
await page.screenshot({ path: `${shots}/06-settings.png` })

console.log('Screenshots saved to', shots)
await app.close()
