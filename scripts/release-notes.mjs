import { readFile, writeFile } from 'node:fs/promises'

// Writes notes.md for the tag in TAG, from the same changelog the in-app
// What's new popup uses. Exits non-zero when the tag has no entry, so the
// workflow can fall back to commit subjects.
const version = (process.env.TAG ?? '').trim().replace(/^v/i, '')
const file = new URL('../src/shared/changelog.json', import.meta.url)
const entries = JSON.parse(await readFile(file, 'utf8'))
const entry = Array.isArray(entries) ? entries.find((item) => item.version === version) : undefined

if (!entry) {
  console.error(`No changelog entry for ${version || 'this tag'}`)
  process.exit(1)
}

const lines = [`## ${entry.title}`, '', entry.intro, '']
for (const highlight of entry.highlights) {
  lines.push(`- **${highlight.title}** — ${highlight.description}`)
}

await writeFile('notes.md', `${lines.join('\n')}\n`, 'utf8')
console.log(`Wrote notes.md from the ${entry.version} changelog`)
