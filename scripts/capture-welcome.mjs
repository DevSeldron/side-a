import { _electron as electron } from 'playwright-core'

const shots = '/private/var/folders/kn/h2ngd28d60scrqdf0vvdhqc80000gn/T/opencode/sidea-shots'
const env = { ...process.env }
delete env.SIDEA_DEMO

const app = await electron.launch({ args: ['.'], env })
const page = await app.firstWindow()
page.on('pageerror', (error) => console.log('PAGE ERROR:', error.message))

await page.waitForSelector('.welcome-panel', { timeout: 30000 })
await page.waitForTimeout(800)
await page.screenshot({ path: `${shots}/07-welcome.png` })

await page.getByRole('button', { name: 'Explore the public demo' }).click()
await page.waitForSelector('.album-card', { timeout: 45000 })
await page.waitForTimeout(1200)

await page.keyboard.press('Meta+K')
await page.waitForSelector('.palette', { timeout: 5000 })
await page.waitForTimeout(400)
await page.screenshot({ path: `${shots}/08-palette.png` })

await page.keyboard.press('Escape')
await page.goto(page.url().replace(/#.*$/, '#/offline'))
await page.waitForTimeout(700)
await page.screenshot({ path: `${shots}/09-offline-empty.png` })

console.log('Welcome/palette screenshots saved')
await app.close()
