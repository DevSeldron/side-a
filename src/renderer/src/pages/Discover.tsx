import { useEffect, useRef, useState, type ReactElement } from 'react'
import { ArrowLeft, ExternalLink, Loader2, Pause, Play, Search, UserRound } from 'lucide-react'
import type { DiscoverAlbum, DiscoverArtist, DiscoverResult, TralbumType, Track } from '@shared/types'
import { useApp } from '../store/app'
import { usePlayer } from '../store/player'
import { Artwork } from '../components/Artwork'
import { PageIntro } from '../components/Page'
import { cx, errorMessage } from '../lib/format'

function clock(seconds: number): string {
  if (!seconds) return ''
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

export function Discover(): ReactElement {
  const pushToast = useApp((state) => state.pushToast)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DiscoverResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [artist, setArtist] = useState<DiscoverArtist | null>(null)
  const [artistLoading, setArtistLoading] = useState(false)
  const [album, setAlbum] = useState<DiscoverAlbum | null>(null)
  const [albumLoading, setAlbumLoading] = useState(false)
  const [playingId, setPlayingId] = useState<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playToken = useRef(0)
  const playerPlaying = usePlayer((state) => state.playing)

  useEffect(() => {
    const text = query.trim()
    if (text.length < 2) {
      setResults([])
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const timer = window.setTimeout(() => {
      window.sideA.discover
        .search(text)
        .then((found) => {
          if (cancelled) return
          setResults(found)
          setLoading(false)
        })
        .catch((reason) => {
          if (cancelled) return
          setError(errorMessage(reason, 'Bandcamp search failed.'))
          setLoading(false)
        })
    }, 320)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query])

  useEffect(
    () => () => {
      playToken.current += 1
      audioRef.current?.pause()
    },
    []
  )

  const stopAudio = (): void => {
    playToken.current += 1
    audioRef.current?.pause()
    audioRef.current = null
    setPlayingId(null)
  }

  const playTrack = async (track: Track): Promise<void> => {
    if (!track.streamUrl) {
      pushToast('Bandcamp is not streaming this track.', { tone: 'error' })
      return
    }
    if (playingId === track.id) {
      stopAudio()
      return
    }
    stopAudio()
    // Only one track at a time: the library player and Discover share the
    // speakers, so starting either pauses the other.
    usePlayer.getState().pause()
    const token = playToken.current
    try {
      // Stream renditions need the Bandcamp session and Referer, so the main
      // process proxies them over bcmedia:// rather than the page playing the
      // remote URL directly.
      const ticket = await window.sideA.discover.stream(track.streamUrl)
      if (playToken.current !== token) return
      const audio = new Audio(ticket.url)
      audioRef.current = audio
      setPlayingId(track.id)
      audio.onended = () => setPlayingId(null)
      audio.onerror = () => {
        setPlayingId(null)
        pushToast('This stream stopped early.', { tone: 'error' })
      }
      await audio.play()
    } catch (reason) {
      if (playToken.current !== token) return
      setPlayingId(null)
      pushToast('Could not play this track', { description: errorMessage(reason), tone: 'error' })
    }
  }

  useEffect(() => {
    if (!playerPlaying) return
    playToken.current += 1
    audioRef.current?.pause()
    audioRef.current = null
    setPlayingId(null)
  }, [playerPlaying])

  const openArtist = async (bandId: number): Promise<void> => {
    stopAudio()
    setAlbum(null)
    setArtistLoading(true)
    try {
      setArtist(await window.sideA.discover.artist(bandId))
    } catch (reason) {
      pushToast('Could not load that artist', { description: errorMessage(reason), tone: 'error' })
    } finally {
      setArtistLoading(false)
    }
  }

  const openAlbum = async (bandId: number | undefined, tralbumId: number, tralbumType: TralbumType): Promise<void> => {
    if (!bandId) {
      pushToast('This release needs a Bandcamp artist id.', { tone: 'error' })
      return
    }
    stopAudio()
    setAlbumLoading(true)
    try {
      setAlbum(await window.sideA.discover.album(bandId, tralbumId, tralbumType))
    } catch (reason) {
      pushToast('Could not load that release', { description: errorMessage(reason), tone: 'error' })
    } finally {
      setAlbumLoading(false)
    }
  }

  const back = (): void => {
    stopAudio()
    if (album) {
      setAlbum(null)
      return
    }
    setArtist(null)
  }

  const artists = results.filter((entry) => entry.kind === 'artist')
  const albums = results.filter((entry) => entry.kind === 'album')
  const tracks = results.filter((entry) => entry.kind === 'track')

  return (
    <div className="page discover-page">
      <PageIntro
        kicker="Browse"
        title="Discover"
        description="Search all of Bandcamp, open an artist's discography, and listen to anything with a stream, no purchase needed."
      />

      <form className="discover-search" onSubmit={(event) => event.preventDefault()}>
        <Search size={17} />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search artists, albums and tracks"
          aria-label="Search Bandcamp"
          spellCheck={false}
        />
        {loading ? <Loader2 size={16} className="spin" /> : null}
      </form>

      {artist || album ? (
        <button type="button" className="button ghost quiet discover-back" onClick={back}>
          <ArrowLeft size={15} />
          Back
        </button>
      ) : null}

      {albumLoading ? (
        <div className="discover-loading">
          <Loader2 size={18} className="spin" />
          <span>Loading release…</span>
        </div>
      ) : album ? (
        <section className="discover-album">
          <div className="discover-album-head">
            <div className="discover-album-art">
              <Artwork src={album.artUrl} alt={`${album.bandName}, ${album.title}`} eager />
            </div>
            <div className="discover-album-copy">
              <span className="discover-kicker">Release</span>
              <h2>{album.title}</h2>
              {album.bandId ? (
                <button type="button" className="discover-band-link" onClick={() => void openArtist(album.bandId)}>
                  <UserRound size={14} />
                  {album.bandName}
                </button>
              ) : (
                <p className="discover-band">{album.bandName}</p>
              )}
              {album.about ? <p className="discover-about">{album.about}</p> : null}
              <button type="button" className="button ghost quiet" onClick={() => album.url && void window.sideA.library.openExternal(album.url)}>
                <ExternalLink size={15} />
                Open on Bandcamp
              </button>
            </div>
          </div>

          <div className="discover-tracklist">
            {album.tracks.map((track) => (
              <div key={track.id} className={cx('discover-track', playingId === track.id && 'is-playing')}>
                <button
                  type="button"
                  className="discover-track-play"
                  onClick={() => void playTrack(track)}
                  aria-label={playingId === track.id ? `Pause ${track.title}` : `Play ${track.title}`}
                  disabled={!track.isStreamable}
                >
                  {playingId === track.id ? (
                    <Pause size={15} fill="currentColor" className="pause-glyph" />
                  ) : (
                    <Play size={15} fill="currentColor" className="play-glyph" />
                  )}
                </button>
                <span className="discover-track-number">{String(track.number).padStart(2, '0')}</span>
                <strong className="discover-track-title">{track.title}</strong>
                <span className="discover-track-time">{clock(track.duration)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : artistLoading ? (
        <div className="discover-loading">
          <Loader2 size={18} className="spin" />
          <span>Loading artist…</span>
        </div>
      ) : artist ? (
        <section className="discover-artist">
          <header className="discover-artist-head">
            <div className="discover-artist-art">
              <Artwork src={artist.image} alt={artist.name} eager />
            </div>
            <div>
              <span className="discover-kicker">Artist</span>
              <h2>{artist.name}</h2>
              {artist.bio ? <p className="discover-about">{artist.bio}</p> : null}
              <button type="button" className="button ghost quiet" onClick={() => artist.url && void window.sideA.library.openExternal(artist.url)}>
                <ExternalLink size={15} />
                Open on Bandcamp
              </button>
            </div>
          </header>

          <div className="discover-grid">
            {artist.releases.map((release) => (
              <button
                type="button"
                key={`${release.kind}-${release.id}`}
                className="discover-card"
                onClick={() => void openAlbum(release.bandId, release.id, release.kind === 'track' ? 't' : 'a')}
              >
                <div className="discover-card-art">
                  <Artwork src={release.artUrl} alt={release.title} />
                </div>
                <strong>{release.title}</strong>
                <span>{release.kind === 'track' ? 'Track' : 'Album'}</span>
              </button>
            ))}
            {artist.releases.length === 0 ? <p className="discover-empty">No releases listed for this artist.</p> : null}
          </div>
        </section>
      ) : error ? (
        <p className="discover-empty">{error}</p>
      ) : query.trim().length >= 2 && !loading && results.length === 0 ? (
        <p className="discover-empty">Nothing on Bandcamp matched “{query.trim()}”.</p>
      ) : (
        <div className="discover-results">
          {artists.length > 0 ? (
            <section>
              <h3 className="discover-section-title">Artists</h3>
              <div className="discover-artist-list">
                {artists.map((entry) => (
                  <button type="button" key={entry.id} className="discover-artist-row" onClick={() => void openArtist(entry.id)}>
                    <span className="discover-artist-thumb">
                      <Artwork src={entry.artUrl} alt={entry.title} />
                    </span>
                    <span className="discover-row-copy">
                      <strong>{entry.title}</strong>
                      <span>{entry.location ?? 'Bandcamp artist'}</span>
                    </span>
                    {entry.tags?.length ? <span className="discover-tags">{entry.tags.slice(0, 3).join(' · ')}</span> : null}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {albums.length > 0 ? (
            <section>
              <h3 className="discover-section-title">Albums</h3>
              <div className="discover-grid">
                {albums.map((entry) => (
                  <button
                    type="button"
                    key={entry.id}
                    className="discover-card"
                    onClick={() => void openAlbum(entry.bandId, entry.id, 'a')}
                  >
                    <div className="discover-card-art">
                      <Artwork src={entry.artUrl} alt={entry.title} />
                    </div>
                    <strong>{entry.title}</strong>
                    <span>{entry.bandName ?? 'Album'}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {tracks.length > 0 ? (
            <section>
              <h3 className="discover-section-title">Tracks</h3>
              <div className="discover-artist-list">
                {tracks.map((entry) => (
                  <button
                    type="button"
                    key={entry.id}
                    className="discover-artist-row"
                    onClick={() => void openAlbum(entry.bandId, entry.id, 't')}
                  >
                    <span className="discover-artist-thumb">
                      <Artwork src={entry.artUrl} alt={entry.title} />
                    </span>
                    <span className="discover-row-copy">
                      <strong>{entry.title}</strong>
                      <span>{entry.bandName ?? 'Track'}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {query.trim().length < 2 ? (
            <div className="discover-hint">
              <Search size={18} />
              <p>Type at least two characters to search artists, albums and tracks across Bandcamp.</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
