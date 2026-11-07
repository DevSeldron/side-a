import { useEffect, useState, type ReactElement } from 'react'
import { Sparkles } from 'lucide-react'
import { useApp } from '../store/app'
import { changelogFor, type ChangelogEntry } from '@shared/changelog'

const SEEN_KEY = 'sidea.changelogSeen'

/** One-time release notes, shown after an update until dismissed. */
export function WhatsNew(): ReactElement | null {
  const version = useApp((state) => state.snapshot?.appVersion)
  const [entry, setEntry] = useState<ChangelogEntry | null>(null)
  const [closing, setClosing] = useState(false)

  // Mark it seen straight away, then let the exit animation finish before the
  // popup unmounts so closing never snaps.
  const dismiss = (): void => {
    if (closing) return
    try {
      if (version) localStorage.setItem(SEEN_KEY, version)
    } catch {
      // Without storage the popup simply shows once per launch.
    }
    setClosing(true)
  }

  useEffect(() => {
    if (!version) return
    const match = changelogFor(version)
    if (!match) return
    try {
      if (localStorage.getItem(SEEN_KEY) === version) return
    } catch {
      // Fall through and show it this time.
    }
    setEntry(match)
  }, [version])

  useEffect(() => {
    if (!entry) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [entry, closing])

  useEffect(() => {
    if (!closing) return
    const timer = window.setTimeout(() => {
      setEntry(null)
      setClosing(false)
    }, 200)
    return () => window.clearTimeout(timer)
  }, [closing])

  if (!entry) return null

  return (
    <div
      className={closing ? 'whatsnew-overlay is-closing' : 'whatsnew-overlay'}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) dismiss()
      }}
    >
      <section className="whatsnew-card" role="dialog" aria-modal="true" aria-labelledby="whatsnew-title">
        <header className="whatsnew-head">
          <span className="whatsnew-icon">
            <Sparkles size={18} />
          </span>
          <div>
            <h2 id="whatsnew-title">{entry.title}</h2>
            <p>{entry.intro}</p>
          </div>
        </header>

        <ul className="whatsnew-list">
          {entry.highlights.map((highlight) => (
            <li key={highlight.title}>
              <strong>{highlight.title}</strong>
              <span>{highlight.description}</span>
            </li>
          ))}
        </ul>

        <div className="whatsnew-foot">
          <button type="button" className="button primary" onClick={dismiss} autoFocus>
            Got it
          </button>
        </div>
      </section>
    </div>
  )
}
