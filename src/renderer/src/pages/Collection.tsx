import { useMemo, useState, type ReactElement } from 'react'
import { ArrowDownToLine, Library, Loader2, Search, Shuffle, SlidersHorizontal, X } from 'lucide-react'
import { useApp } from '../store/app'
import { usePlayer } from '../store/player'
import { AlbumCard } from '../components/AlbumCard'
import { EmptyState, PageIntro } from '../components/Page'
import { parseBandcampDate, plural } from '../lib/format'

type SortKey = 'purchased' | 'added' | 'artist' | 'title'

export function Collection(): ReactElement {
  const snapshot = useApp((state) => state.snapshot)
  const sync = useApp((state) => state.sync)
  const saveAllPurchased = useApp((state) => state.saveAllPurchased)
  const playShuffle = usePlayer((state) => state.playShuffle)
  const shuffleLoading = usePlayer((state) => state.shuffleLoading)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('purchased')

  const collection = snapshot?.collection ?? []

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    const list = collection.filter((album) => {
      if (!term) return true
      return album.title.toLowerCase().includes(term) || album.bandName.toLowerCase().includes(term)
    })
    const dated = list.map((album) => ({
      album,
      addedAt: parseBandcampDate(album.added)?.getTime() ?? 0,
      purchasedAt: parseBandcampDate(album.purchased ?? album.added)?.getTime() ?? 0
    }))
    dated.sort((a, b) => {
      if (sort === 'artist') return a.album.bandName.localeCompare(b.album.bandName)
      if (sort === 'title') return a.album.title.localeCompare(b.album.title)
      const difference = sort === 'added' ? b.addedAt - a.addedAt : b.purchasedAt - a.purchasedAt
      if (difference !== 0) return difference
      return a.album.bandName.localeCompare(b.album.bandName) || a.album.title.localeCompare(b.album.title)
    })
    return dated.map(({ album }) => album)
  }, [collection, query, sort])

  const purchased = collection.filter((album) => album.purchased).length
  const artists = new Set(collection.map((album) => album.bandName)).size
  const offline = Object.values(snapshot?.offline ?? {}).filter((entry) => entry.status === 'ready').length

  const shufflePlay = (): void => {
    if (!filtered.length) return
    void playShuffle(filtered.map((album) => album.key))
  }

  if (!snapshot) return <div className="page" />

  return (
    <div className="page">
      <PageIntro
        title="Collection"
        actions={
          <>
            <button type="button" className="button ghost" onClick={() => void saveAllPurchased()} disabled={!purchased}>
              <ArrowDownToLine size={16} />
              Save purchases offline
            </button>
            <button
              type="button"
              className="button primary"
              onClick={shufflePlay}
              disabled={!filtered.length || shuffleLoading}
            >
              {shuffleLoading ? <Loader2 size={16} className="spin" /> : <Shuffle size={16} />}
              {shuffleLoading ? 'Building mix' : 'Shuffle play'}
            </button>
          </>
        }
      >
        <div className="stat-row">
          <div className="stat">
            <strong>{collection.length}</strong>
            <span>Releases</span>
          </div>
          <div className="stat">
            <strong>{artists}</strong>
            <span>Artists</span>
          </div>
          <div className="stat">
            <strong>{offline}</strong>
            <span>Offline</span>
          </div>
        </div>
      </PageIntro>

      {collection.length === 0 ? (
        <EmptyState
          icon={<Library size={26} />}
          title={snapshot.sync.status === 'error' ? 'The library could not sync' : 'Your collection is waiting'}
          description={
            snapshot.sync.status === 'error'
              ? snapshot.sync.error ?? 'Check your connection and try again'
              : snapshot.demo
                ? 'This public demo collection is empty, try connecting your own Bandcamp account'
                : 'Side A has not found any releases yet, sync to pull your Bandcamp collection into the app'
          }
          action={
            <button type="button" className="button primary" onClick={() => void sync()}>
              Sync library
            </button>
          }
        />
      ) : (
        <>
          <div className="library-toolbar">
            <div className="toolbar-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by artist or release"
                spellCheck={false}
                aria-label="Filter collection"
              />
              {query ? (
                <button type="button" className="toolbar-clear" onClick={() => setQuery('')} aria-label="Clear filter">
                  <X size={14} />
                </button>
              ) : null}
            </div>
            <div className="toolbar-right">
              <label className="select-wrap">
                <SlidersHorizontal size={14} />
                <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} aria-label="Sort collection">
                  <option value="purchased">Recently purchased</option>
                  <option value="added">Recently added</option>
                  <option value="artist">Artist A–Z</option>
                  <option value="title">Release A–Z</option>
                </select>
              </label>
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<Search size={24} />}
              title="Nothing matches that filter"
              description="Try a different artist or release name"
              action={
                <button type="button" className="button ghost" onClick={() => setQuery('')}>
                  Clear filter
                </button>
              }
            />
          ) : (
            <>
              <div className="grid-heading">
                <span>{query ? `${plural(filtered.length, 'result')}` : 'All releases'}</span>
                <em>{sort === 'purchased' ? 'Newest purchases' : sort === 'added' ? 'Newest additions' : sort === 'artist' ? 'By artist' : 'By title'}</em>
              </div>
              <div className="album-grid">
                {filtered.map((album, index) => (
                  <AlbumCard key={album.key} album={album} priority={index < 8} index={index} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
