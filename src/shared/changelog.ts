import entries from './changelog.json'

export interface ChangelogHighlight {
  title: string
  description: string
}

export interface ChangelogEntry {
  /** App version this entry belongs to, used to show it once per release. */
  version: string
  title: string
  intro: string
  highlights: ChangelogHighlight[]
}

/**
 * Release highlights, the same copy used for the GitHub release notes.
 * The data lives in changelog.json so scripts/release-notes.mjs can read it
 * without a build step.
 */
export const CHANGELOG = entries as ChangelogEntry[]

export function changelogFor(version: string | undefined): ChangelogEntry | undefined {
  if (!version) return undefined
  return CHANGELOG.find((entry) => entry.version === version)
}

/** Markdown for a GitHub release body, generated from the same entry. */
export function changelogMarkdown(entry: ChangelogEntry): string {
  const lines = [`## ${entry.title}`, '', entry.intro, '']
  for (const highlight of entry.highlights) {
    lines.push(`- **${highlight.title}** — ${highlight.description}`)
  }
  return lines.join('\n')
}
