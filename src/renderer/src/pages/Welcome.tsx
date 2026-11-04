import { useState, type FormEvent, type ReactElement } from 'react'
import { ArrowRight, Disc3, Headphones, Loader2, Lock, ShieldCheck, Sparkles, User } from 'lucide-react'
import { useApp } from '../store/app'
import { cx } from '../lib/format'

export function Welcome(): ReactElement {
  const snapshot = useApp((state) => state.snapshot)
  const login = useApp((state) => state.login)
  const startDemo = useApp((state) => state.startDemo)
  const setUsername = useApp((state) => state.setUsername)
  const [username, setUsernameValue] = useState('')
  const [busy, setBusy] = useState<'login' | 'demo' | 'username' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const needsUsername = snapshot?.auth.status === 'needs-username'

  const run = async (kind: 'login' | 'demo'): Promise<void> => {
    setBusy(kind)
    setError(null)
    try {
      if (kind === 'login') await login()
      else await startDemo()
    } finally {
      setBusy(null)
    }
  }

  const submitUsername = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!username.trim()) return
    setBusy('username')
    setError(null)
    try {
      await setUsername(username.trim())
    } catch {
      setError('That username could not be loaded, check the spelling and try again')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="welcome">
      <div className="welcome-glow" aria-hidden="true" />
      <section className="welcome-editorial">
        <div className="welcome-editorial-body">
          <h1>
            Your Bandcamp collection,
            <br />
            <em>redesigned</em>
          </h1>
          <p>
            A player for the music you already own, with your collection and wishlist in one place and offline
            copies for listening away from the network
          </p>
          <div className="welcome-features">
            <div>
              <Headphones size={17} />
              <span>
                <strong>Full-release streaming</strong>
                Stream complete releases at Bandcamp quality
              </span>
            </div>
            <div>
              <Disc3 size={17} />
              <span>
                <strong>Original downloads</strong>
                Keep the FLAC, WAV or MP3 files you paid for
              </span>
            </div>
            <div>
              <Lock size={17} />
              <span>
                <strong>Stays on your device</strong>
                Sessions and libraries stay on your device
              </span>
            </div>
          </div>
        </div>
        <footer className="welcome-foot">
          <span>Side A {snapshot?.appVersion}</span>
          <span>Not affiliated with Bandcamp</span>
        </footer>
      </section>

      <section className="welcome-panel-wrap">
        <div className="welcome-panel">
          <div className="welcome-panel-head">
            <span className="panel-eyebrow">{needsUsername ? 'One more step' : 'Welcome back'}</span>
            <h2>{needsUsername ? 'Where should we look?' : 'Connect Bandcamp'}</h2>
            <p>
              {needsUsername
                ? 'Bandcamp signed you in, but did not share a profile name, enter your Bandcamp username so Side A can find your collection'
                : 'Sign in with Bandcamp in a secure window, Side A reads your own collection, wishlist and purchases'}
            </p>
          </div>

          {needsUsername ? (
            <form className="welcome-form" onSubmit={(event) => void submitUsername(event)}>
              <label htmlFor="username">Bandcamp username</label>
              <div className="input-with-icon">
                <User size={16} />
                <input
                  id="username"
                  value={username}
                  onChange={(event) => setUsernameValue(event.target.value)}
                  placeholder="your-bandcamp-name"
                  autoFocus
                  spellCheck={false}
                />
              </div>
              {error ? <p className="form-error">{error}</p> : null}
              <button type="submit" className="button primary wide" disabled={busy !== null || !username.trim()}>
                {busy === 'username' ? <Loader2 size={16} className="spin" /> : <ArrowRight size={16} />}
                Load my library
              </button>
              <button type="button" className="text-button centered" onClick={() => void run('login')} disabled={busy !== null}>
                Use a different account
              </button>
            </form>
          ) : (
            <div className="welcome-actions">
              <button type="button" className={cx('button primary wide', busy === 'login' && 'is-busy')} onClick={() => void run('login')} disabled={busy !== null}>
                {busy === 'login' ? <Loader2 size={17} className="spin" /> : <BandcampGlyph />}
                Continue with Bandcamp
              </button>
              <div className="welcome-divider">
                <span>or</span>
              </div>
              <button type="button" className="button ghost wide" onClick={() => void run('demo')} disabled={busy !== null}>
                {busy === 'demo' ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
                Explore the public demo
              </button>
              <p className="welcome-demo-note">The demo loads a public Bandcamp fan collection so you can try the player without an account</p>
            </div>
          )}

          <div className="welcome-trust">
            <ShieldCheck size={15} />
            <span>Bandcamp credentials are handled by Bandcamp itself, Side A only stores your session cookie locally</span>
          </div>
        </div>
      </section>
    </div>
  )
}

function BandcampGlyph(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
      <path d="M0 18.75 14.03 1.5H24L9.97 18.75z" />
    </svg>
  )
}
