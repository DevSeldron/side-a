import { _electron as electron } from 'playwright-core'

const shots = '/private/var/folders/kn/h2ngd28d60scrqdf0vvdhqc80000gn/T/opencode/sidea-shots'
const app = await electron.launch({ args: ['.'], env: { ...process.env, SIDEA_DEMO: '1' } })
const page = await app.firstWindow()
page.on('pageerror', (error) => console.log('PAGE ERROR:', error.message))
app.process().stderr?.on('data', (data) => {
  const text = String(data)
  if (/error/i.test(text)) process.stderr.write(`MAINERR ${text}`)
})

await page.waitForSelector('.album-card', { timeout: 45000 })
await page.locator('.album-card').first().click()
await page.waitForSelector('.track-row', { timeout: 20000 })

const title = await page.locator('.album-hero-copy h1').textContent()
console.log('Saving offline:', title)
await page.getByRole('button', { name: 'Save offline' }).click()

await page.waitForSelector('.album-hero-offline', { timeout: 180000 })
console.log('Offline save complete')
await page.waitForTimeout(800)
await page.screenshot({ path: `${shots}/10-album-offline.png` })

await page.getByRole('button', { name: 'Play release' }).click()
await page.waitForTimeout(2500)
const hasOfflineDot = await page.locator('.player-offline-dot').count()
console.log('Playing from offline copy (dot present):', hasOfflineDot === 1)

await page.goto(page.url().replace(/#.*$/, '#/offline'))
await page.waitForTimeout(900)
console.log('Offline rows:', await page.locator('.offline-row').count())
console.log('Offline stat text:', (await page.locator('.stat-row').first().innerText()).replace(/\n/g, ' | '))
await page.screenshot({ path: `${shots}/11-offline.png` })

await app.close()
