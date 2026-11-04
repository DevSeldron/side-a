import { useMemo, useState, type ReactElement } from 'react'
import { ArrowDownToLine, BadgeCheck, Library, Search, Shuffle, SlidersHorizontal, X } from 'lucide-react'
import { useApp } from '../store/app'
import { usePlayer } from '../store/player'
import { AlbumCard } from '../components/AlbumCard'
import { EmptyState, PageIntro } from '../components/Page'
import { cx, plural } from '../lib/format'

type SortKey = 'recent' | 'artist' | 'title' | 'year'

export function Collection(): ReactElement {
  const snapshot = useApp((state) => state.snapshot)
  const sync = useApp((state) => state.sync)
  const saveAllPurchased = useApp((state) => state.saveAllPurchased)
  const playAlbum = usePlayer((state) => state.playAlbum)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')
  const [purchasedOnly, setPurchasedOnly] = useState(false)

  const collection = snapshot?.collection ?? []

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    const list = collection.filter((album) => {
      if (purchasedOnly && !album.purchased) return false
      if (!term) return true
      return album.title.toLowerCase().includes(term) || album.bandName.toLowerCase().includes(term)
    })
    return [...list].sort((a, b) => {
      if (sort === 'artist') return a.bandName.localeCompare(b.bandName)
      if (sort === 'title') return a.title.localeCompare(b.title)
      if (sort === 'year') return (b.purchased ?? b.added ?? '').localeCompare(a.purchased ?? a.added ?? '')
      return (b.added ?? '').localeCompare(a.added ?? '')
    })
  }, [collection, query, sort, purchasedOnly])

  const purchased = collection.filter((album) => album.purchased).length
  const artists = new Set(collection.map((album) => album.bandName)).size
  const offline = Object.values(snapshot?.offline ?? {}).filter((entry) => entry.status === 'ready').length

  const shufflePlay = (): void => {
    if (!filtered.length) return
    const pick = filtered[Math.floor(Math.random() * filtered.length)]
    if (pick) void playAlbum(pick.key)
  }

  if (!snapshot) return <div className="page" />

  return (
    <div className="page">
      <PageIntro
        kicker="Your library"
        title="Collection"
        description={
          collection.length
            ? `${plural(collection.length, 'release')} from ${plural(artists, 'artist')}, everything you have bought or added on Bandcamp`
            : 'Everything you own on Bandcamp will appear here once you sync'
        }
        actions={
          <>
            <button type="button" className="button ghost" onClick={() => void saveAllPurchased()} disabled={!purchased}>
              <ArrowDownToLine size={16} />
              Save purchases offline
            </button>
            <button type="button" className="button primary" onClick={shufflePlay} disabled={!filtered.length}>
              <Shuffle size={16} />
              Shuffle play
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
            <strong>{purchased}</strong>
            <span>Purchased</span>
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
              <button
                type="button"
                className={cx('chip-toggle', purchasedOnly && 'is-on')}
                onClick={() => setPurchasedOnly((value) => !value)}
                aria-pressed={purchasedOnly}
              >
                <BadgeCheck size={14} />
                Purchased only
              </button>
              <label className="select-wrap">
                <SlidersHorizontal size={14} />
                <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} aria-label="Sort collection">
                  <option value="recent">Recently added</option>
                  <option value="artist">Artist A–Z</option>
                  <option value="title">Release A–Z</option>
                  <option value="year">Purchase date</option>
                </select>
              </label>
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<Search size={24} />}
              title="Nothing matches that filter"
              description="Try a different artist or release name, or turn off the purchased filter"
              action={
                <button type="button" className="button ghost" onClick={() => { setQuery(''); setPurchasedOnly(false) }}>
                  Clear filters
                </button>
              }
            />
          ) : (
            <>
              <div className="grid-heading">
                <span>{query ? `${plural(filtered.length, 'result')}` : 'All releases'}</span>
                <em>{sort === 'recent' ? 'Newest first' : sort === 'artist' ? 'By artist' : sort === 'title' ? 'By title' : 'By purchase date'}</em>
              </div>
              <div className="album-grid">
                {filtered.map((album, index) => (
                  <AlbumCard key={album.key} album={album} priority={index < 8} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
