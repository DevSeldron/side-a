import { _electron as electron } from 'playwright-core'
import { rm } from 'node:fs/promises'

await rm('/tmp/sidea-shuffle-test', { recursive: true, force: true })
const app = await electron.launch({
  args: ['.', '--user-data-dir=/tmp/sidea-shuffle-test'],
  env: { ...process.env, SIDEA_DEMO: '1' }
})
const page = await app.firstWindow()
page.on('pageerror', (error) => console.log('PAGE ERROR:', error.message))

await page.waitForSelector('.app-shell', { timeout: 30000 })
await page.waitForSelector('.album-card', { timeout: 60000 })
await page.locator('.album-card').first().click()
await page.waitForSelector('.track-row', { timeout: 20000 })
await page.locator('.album-actions .button.primary').first().click()
await page.waitForSelector('.player-bar', { timeout: 20000 })
await page.waitForTimeout(1200)

const title = () => page.locator('.player-title').first().textContent()
const shuffleButton = page.locator('.playback-controls button[title="Shuffle"]').first()
if (await shuffleButton.count()) await shuffleButton.click()
await page.waitForTimeout(300)

const sequence = [await title()]
for (let index = 0; index < 4; index += 1) {
  await page.locator('.playback-controls button[title="Next"]').first().click()
  await page.waitForTimeout(900)
  sequence.push(await title())
}

await page.locator('.playback-controls button[title="Previous"]').first().click()
await page.waitForTimeout(900)
const previous = await title()

console.log(JSON.stringify({ sequence, previous, uniqueFirstFour: new Set(sequence.slice(0, 4)).size }, null, 2))
await app.close()
