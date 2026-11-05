import { useMemo, useState, type MouseEvent, type ReactElement } from 'react'
import {
  ArrowLeft,
  Clock3,
  Disc3,
  FolderOpen,
  FolderPlus,
  Loader2,
  Music2,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Search,
  Shuffle,
  SlidersHorizontal,
  Trash2,
  X
} from 'lucide-react'
import type { LocalTrack } from '@shared/types'
import { useApp } from '../store/app'
import { useLocalPlayer } from '../store/localPlayer'
import { Artwork } from '../components/Artwork'
import { EmptyState, PageIntro, ProgressBar } from '../components/Page'
import { cx, formatDuration, formatLongDuration, plural, relativeDate, shortPath } from '../lib/format'

type SortKey = 'artist' | 'title' | 'album' | 'recent' | 'duration'
type LocalView = 'songs' | 'albums'

interface LocalAlbum {
  key: string
  title: string
  artist: string
  year?: number
  coverUrl?: string
  tracks: LocalTrack[]
  duration: number
}

interface LocalTrackRowsProps {
  tracks: LocalTrack[]
  currentId?: string
  playing: boolean
  onTrack: (track: LocalTrack) => void
  albumView?: boolean
}

function groupAlbums(tracks: LocalTrack[]): LocalAlbum[] {
  const grouped = new Map<string, LocalAlbum>()
  for (const track of tracks) {
    const existing = grouped.get(track.albumKey)
    if (existing) {
      existing.tracks.push(track)
      existing.duration += track.duration
      continue
    }
    grouped.set(track.albumKey, {
      key: track.albumKey,
      title: track.album,
      artist: track.albumArtist,
      year: track.year,
      coverUrl: track.coverUrl,
      tracks: [track],
      duration: track.duration
    })
  }
  return [...grouped.values()].sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title))
}

function LocalTrackRows({ tracks, currentId, playing, onTrack, albumView = false }: LocalTrackRowsProps): ReactElement {
  return (
    <>
      {tracks.map((track, index) => {
        const isCurrent = currentId === track.id
        return (
          <div
            key={track.id}
            className={cx('local-track-row', albumView && 'is-album', isCurrent && 'is-current', isCurrent && playing && 'is-playing')}
            role="listitem"
            tabIndex={0}
            onClick={() => onTrack(track)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onTrack(track)
              }
            }}
          >
            <span className="local-track-number">
              <em>{String(albumView ? (track.trackNumber ?? index + 1) : index + 1).padStart(2, '0')}</em>
              <span className="local-track-play">
                {isCurrent && playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
              </span>
            </span>
            <span className="local-track-art"><Artwork src={track.coverUrl} alt="" /></span>
            <span className="local-track-name">
              <strong>{track.title}</strong>
              <span>{track.artist}{track.year ? ` / ${track.year}` : ''}</span>
            </span>
            {albumView ? null : <span className="local-track-album">{track.album}</span>}
            <span className="local-track-format">{track.format}{track.lossless ? ' / lossless' : ''}</span>
            <span className="local-track-time">{formatDuration(track.duration)}</span>
          </div>
        )
      })}
    </>
  )
}

export function Local(): ReactElement {
  const snapshot = useApp((state) => state.snapshot)
  const chooseLocalFolder = useApp((state) => state.chooseLocalFolder)
  const removeLocalFolder = useApp((state) => state.removeLocalFolder)
  const rescanLocal = useApp((state) => state.rescanLocal)
  const playTracks = useLocalPlayer((state) => state.playTracks)
  const current = useLocalPlayer((state) => state.queue[state.index])
  const playing = useLocalPlayer((state) => state.playing)
  const toggle = useLocalPlayer((state) => state.toggle)
  const shuffle = useLocalPlayer((state) => state.shuffle)
  const toggleShuffle = useLocalPlayer((state) => state.toggleShuffle)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('artist')
  const [view, setView] = useState<LocalView>('songs')
  const [selectedAlbumKey, setSelectedAlbumKey] = useState<string | null>(null)

  const local = snapshot?.local
  const tracks = local?.tracks ?? []
  const folders = local?.folders ?? []
  const scan = local?.scan ?? { status: 'idle' as const, scanned: 0, total: 0, message: '' }

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    const matches = term
      ? tracks.filter((track) => {
          return (
            track.title.toLowerCase().includes(term) ||
            track.artist.toLowerCase().includes(term) ||
            track.album.toLowerCase().includes(term) ||
            track.genre?.toLowerCase().includes(term)
          )
        })
      : tracks
    return [...matches].sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title)
      if (sort === 'album') return a.album.localeCompare(b.album) || (a.trackNumber ?? 0) - (b.trackNumber ?? 0)
      if (sort === 'recent') return b.addedAt - a.addedAt
      if (sort === 'duration') return b.duration - a.duration
      return a.artist.localeCompare(b.artist) || a.album.localeCompare(b.album) || (a.trackNumber ?? 0) - (b.trackNumber ?? 0)
    })
  }, [tracks, query, sort])

  const allAlbums = useMemo(() => groupAlbums(tracks), [tracks])
  const albums = useMemo(() => groupAlbums(filtered), [filtered])
  const selectedAlbum = selectedAlbumKey ? allAlbums.find((album) => album.key === selectedAlbumKey) : undefined

  if (!snapshot || !local) return <div className="page" />

  const artists = new Set(tracks.map((track) => track.albumArtist)).size
  const albumCount = new Set(tracks.map((track) => track.albumKey)).size
  const hours = local.totalDuration / 3600
  const scanning = scan.status === 'scanning'
  const activeFilter = Boolean(query.trim())
  const selectedAlbumPlaying = Boolean(
    selectedAlbum && playing && current && selectedAlbum.tracks.some((track) => track.id === current.id)
  )

  const startTracks = (list: LocalTrack[], startTrackId?: string): void => {
    if (!list.length) return
    void playTracks(list, startTrackId)
  }

  const onTrack = (track: LocalTrack): void => {
    if (current?.id === track.id) {
      void toggle()
      return
    }
    startTracks(filtered, track.id)
  }

  const playAll = (): void => startTracks(filtered)

  const shuffleAll = (): void => {
    if (!filtered.length) return
    if (!shuffle) toggleShuffle()
    startTracks(filtered)
  }

  const onAlbum = (event: MouseEvent, album: LocalAlbum): void => {
    event.stopPropagation()
    startTracks(album.tracks)
  }

  const scrollToTop = (): void => {
    const main = document.querySelector<HTMLElement>('.app-main')
    // Assign directly: scrollTo would inherit the smooth scroll and leave the
    // new view half-scrolled under the topbar while the animation catches up.
    if (main) main.scrollTop = 0
  }

  const openAlbum = (album: LocalAlbum): void => {
    setSelectedAlbumKey(album.key)
    scrollToTop()
  }

  const closeAlbum = (): void => {
    setSelectedAlbumKey(null)
    scrollToTop()
  }

  const changeView = (next: LocalView): void => {
    setView(next)
    setSelectedAlbumKey(null)
    scrollToTop()
  }

  const playAlbum = (album: LocalAlbum): void => {
    if (current && album.tracks.some((track) => track.id === current.id)) {
      void toggle()
      return
    }
    startTracks(album.tracks)
  }

  const shuffleAlbum = (album: LocalAlbum): void => {
    if (!shuffle) toggleShuffle()
    startTracks(album.tracks)
  }

  return (
    <div className="page local-page">
      <PageIntro
        kicker="On this device"
        title="Local"
        description={
          tracks.length
            ? `${plural(tracks.length, 'track')} from ${plural(artists, 'artist')} across ${plural(albumCount, 'album')}, ${formatLongDuration(local.totalDuration)} of music`
            : 'Play the music you already own, then add any folder of MP3, FLAC, WAV, Ogg, AAC, AIFF, ALAC or other supported audio files'
        }
        actions={
          <>
            <button type="button" className="button ghost" onClick={() => void rescanLocal()} disabled={scanning || !folders.length}>
              {scanning ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
              Rescan
            </button>
            <button type="button" className="button primary" onClick={() => void chooseLocalFolder()} disabled={scanning}>
              <FolderPlus size={16} />
              Add folder
            </button>
          </>
        }
      >
        <div className="stat-row">
          <div className="stat"><strong>{tracks.length}</strong><span>Tracks</span></div>
          <div className="stat"><strong>{albumCount}</strong><span>Albums</span></div>
          <div className="stat"><strong>{artists}</strong><span>Artists</span></div>
          <div className="stat"><strong>{hours > 0 ? hours.toFixed(hours >= 10 ? 0 : 1) : '0'}</strong><span>Hours</span></div>
        </div>
      </PageIntro>

      {scanning ? (
        <div className="local-scan-card" role="status">
          <Loader2 size={18} className="spin" />
          <div className="local-scan-copy">
            <strong>{scan.message || 'Scanning your music folders'}</strong>
            <span>
              {scan.total > 0 ? `${scan.scanned} of ${scan.total} files` : 'Finding audio files'}
              {scan.currentFile ? ` / ${scan.currentFile}` : ''}
            </span>
            {scan.total > 0 ? <ProgressBar value={scan.total ? scan.scanned / scan.total : 0} /> : null}
          </div>
        </div>
      ) : scan.status === 'error' ? (
        <div className="inline-panel is-error local-scan-error">
          <span className="local-scan-error-icon"><X size={16} /></span>
          <div>
            <strong>Scan interrupted</strong>
            <p>{scan.error ?? scan.message}</p>
          </div>
          <button type="button" className="button ghost" onClick={() => void rescanLocal()}>Try again</button>
        </div>
      ) : null}

      {folders.length ? (
        <section className="local-folders">
          <div className="local-section-head">
            <span>Music folders</span>
            <em>{local.lastScannedAt ? `Last scan ${relativeDate(local.lastScannedAt)}` : 'Not scanned yet'}</em>
          </div>
          <div className="local-folder-list">
            {folders.map((folder) => (
              <div className="local-folder-row" key={folder.path}>
                <span className="local-folder-icon"><FolderOpen size={17} /></span>
                <div className="local-folder-copy">
                  <strong>{folder.path.split(/[\\/]/).filter(Boolean).pop() ?? folder.path}</strong>
                  <span>{shortPath(folder.path, 72)}</span>
                </div>
                <span className="local-folder-count">{plural(folder.trackCount, 'track')}</span>
                <span className="local-folder-date">
                  {folder.lastScannedAt ? relativeDate(folder.lastScannedAt) : 'Waiting for scan'}
                </span>
                <button
                  type="button"
                  className="icon-button subtle local-folder-remove"
                  title="Remove folder from Local"
                  aria-label={`Remove ${folder.path}`}
                  onClick={() => void removeLocalFolder(folder.path)}
                  disabled={scanning}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {tracks.length === 0 && !scanning ? (
        <EmptyState
          icon={<Music2 size={26} />}
          title={folders.length ? 'No supported audio files yet' : 'Bring your own library'}
          description={
            folders.length
              ? 'Side A could not find supported audio files in these folders, add another folder or check that the files have an audio extension'
              : 'Choose a folder containing your music, Side A reads tags, embedded artwork, sample rate and bitrate without moving or changing your files'
          }
          action={
            <div className="local-empty-actions">
              <button type="button" className="button primary" onClick={() => void chooseLocalFolder()}>
                <FolderPlus size={16} />
                Choose a folder
              </button>
              {folders.length ? (
                <button type="button" className="button ghost" onClick={() => void rescanLocal()}>
                  <RefreshCw size={16} />
                  Scan again
                </button>
              ) : null}
            </div>
          }
        />
      ) : tracks.length > 0 ? (
        selectedAlbum && view === 'albums' ? (
          <section className="local-album-detail">
            <button type="button" className="button ghost local-album-back" onClick={closeAlbum}>
              <ArrowLeft size={15} />
              All albums
            </button>

            <div className="album-hero local-album-hero">
              <div className="album-hero-art">
                <Artwork src={selectedAlbum.coverUrl} alt={`${selectedAlbum.artist}, ${selectedAlbum.title}`} eager />
              </div>
              <div className="album-hero-copy">
                <div className="album-badges">
                  <span className="pill">Local album</span>
                  {selectedAlbum.year ? <span className="pill is-quiet">{selectedAlbum.year}</span> : null}
                  <span className="pill is-quiet">{plural(selectedAlbum.tracks.length, 'track')}</span>
                </div>
                <h1>{selectedAlbum.title}</h1>
                <p className="album-hero-band">{selectedAlbum.artist}</p>
                <div className="album-facts">
                  <span><Clock3 size={14} /> {formatLongDuration(selectedAlbum.duration)}</span>
                  <span><Disc3 size={14} /> Album</span>
                </div>
                <div className="album-actions">
                  <button type="button" className="button primary" onClick={() => playAlbum(selectedAlbum)}>
                    {selectedAlbumPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
                    {selectedAlbumPlaying ? 'Pause album' : 'Play album'}
                  </button>
                  <button type="button" className="button ghost" onClick={() => shuffleAlbum(selectedAlbum)}>
                    <Shuffle size={16} />
                    Shuffle album
                  </button>
                </div>
              </div>
            </div>

            <div className="local-tracklist local-album-tracklist" role="list" aria-label={`${selectedAlbum.title} tracklist`}>
              <div className="local-track-head is-album" aria-hidden="true">
                <span>#</span>
                <span />
                <span>Title</span>
                <span>Format</span>
                <span>Length</span>
              </div>
              <LocalTrackRows
                tracks={selectedAlbum.tracks}
                currentId={current?.id}
                playing={playing}
                onTrack={(track) => {
                  if (current?.id === track.id) {
                    void toggle()
                    return
                  }
                  startTracks(selectedAlbum.tracks, track.id)
                }}
                albumView
              />
            </div>
          </section>
        ) : (
        <>
          <div className="local-toolbar">
            <div className="local-toolbar-left">
              <button type="button" className="button primary" onClick={playAll}>
                <Play size={15} fill="currentColor" />
                Play all
              </button>
              <button type="button" className="button ghost" onClick={shuffleAll}>
                <Shuffle size={15} />
                Shuffle
              </button>
            </div>
            <div className="local-toolbar-right">
              <div className="local-view-toggle" role="group" aria-label="Local library view">
                <button
                  type="button"
                  className={cx('chip-toggle', view === 'songs' && 'is-on')}
                  onClick={() => changeView('songs')}
                  aria-pressed={view === 'songs'}
                >
                  <Music2 size={14} />
                  Songs
                </button>
                <button
                  type="button"
                  className={cx('chip-toggle', view === 'albums' && 'is-on')}
                  onClick={() => changeView('albums')}
                  aria-pressed={view === 'albums'}
                >
                  <Disc3 size={14} />
                  Albums
                </button>
              </div>
              <label className="select-wrap">
                <SlidersHorizontal size={14} />
                <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} aria-label="Sort local tracks">
                  <option value="artist">Artist A–Z</option>
                  <option value="title">Title A–Z</option>
                  <option value="album">Album</option>
                  <option value="recent">Recently added</option>
                  <option value="duration">Longest first</option>
                </select>
              </label>
            </div>
          </div>

          <div className="library-toolbar local-search-row">
            <div className="toolbar-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by title, artist, album or genre"
                spellCheck={false}
                aria-label="Filter local music"
              />
              {query ? (
                <button type="button" className="toolbar-clear" onClick={() => setQuery('')} aria-label="Clear filter">
                  <X size={14} />
                </button>
              ) : null}
            </div>
            <span className="local-result-count">
              {activeFilter ? `${filtered.length} of ${tracks.length} tracks` : `${tracks.length} tracks`}
            </span>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<Search size={24} />}
              title="Nothing matches that search"
              description="Try another artist, album or genre, or clear the filter to see your whole local library"
              action={<button type="button" className="button ghost" onClick={() => setQuery('')}>Clear search</button>}
            />
          ) : view === 'songs' ? (
            <div className="local-tracklist" role="list" aria-label="Local songs">
              <div className="local-track-head" aria-hidden="true">
                <span>#</span>
                <span />
                <span>Title</span>
                <span>Album</span>
                <span>Format</span>
                <span>Length</span>
              </div>
              <LocalTrackRows
                tracks={filtered}
                currentId={current?.id}
                playing={playing}
                onTrack={onTrack}
              />
            </div>
          ) : (
            <div className="local-album-grid">
              {albums.map((album, index) => {
                const isCurrent = Boolean(current && album.tracks.some((track) => track.id === current.id))
                return (
                  <article
                    className={cx('local-album-card', isCurrent && 'is-current')}
                    key={album.key}
                    style={{ animationDelay: `${Math.min(index, 12) * 32}ms` }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${album.title}`}
                    onClick={() => openAlbum(album)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openAlbum(album)
                      }
                    }}
                  >
                    <div className="local-album-art">
                      <Artwork src={album.coverUrl} alt={`${album.artist}, ${album.title}`} />
                      <button
                        type="button"
                        className={cx('album-play', isCurrent && playing && 'is-playing')}
                        onClick={(event) => onAlbum(event, album)}
                        aria-label={`Play ${album.title}`}
                      >
                        {isCurrent && playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" className="play-glyph" />}
                      </button>
                    </div>
                    <div className="local-album-meta">
                      <span>{album.artist}</span>
                      <strong>{album.title}</strong>
                      <em>{album.year ? `${album.year} / ` : ''}{plural(album.tracks.length, 'track')} / {formatLongDuration(album.duration)}</em>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </>
        )
      ) : null}

      {tracks.length > 0 ? (
        <div className="local-note">
          <Radio size={16} />
          <div>
            <strong>Plays join your listening history</strong>
            <span>
              Local tracks use the same Last.fm scrobbling and Discord Rich Presence settings as Bandcamp, and a play counts after half
              the track or four minutes, whichever comes first
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
