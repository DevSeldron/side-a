import { useMemo, useState, type ReactElement } from 'react'
import { Heart, Search, Shuffle, X } from 'lucide-react'
import { useApp } from '../store/app'
import { usePlayer } from '../store/player'
import { AlbumCard } from '../components/AlbumCard'
import { EmptyState, PageIntro } from '../components/Page'
import { cx, plural } from '../lib/format'

export function Wishlist(): ReactElement {
  const snapshot = useApp((state) => state.snapshot)
  const sync = useApp((state) => state.sync)
  const playAlbum = usePlayer((state) => state.playAlbum)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'recent' | 'artist' | 'title'>('recent')

  const wishlist = snapshot?.wishlist ?? []
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    const list = wishlist.filter(
      (album) => !term || album.title.toLowerCase().includes(term) || album.bandName.toLowerCase().includes(term)
    )
    return [...list].sort((a, b) => {
      if (sort === 'artist') return a.bandName.localeCompare(b.bandName)
      if (sort === 'title') return a.title.localeCompare(b.title)
      return (b.added ?? '').localeCompare(a.added ?? '')
    })
  }, [wishlist, query, sort])

  if (!snapshot) return <div className="page" />

  const shufflePlay = (): void => {
    if (!filtered.length) return
    const pick = filtered[Math.floor(Math.random() * filtered.length)]
    if (pick) void playAlbum(pick.key)
  }

  return (
    <div className="page">
      <PageIntro
        kicker="Saved for later"
        title="Wishlist"
        description={
          wishlist.length
            ? `${plural(wishlist.length, 'release')} on your Bandcamp wishlist. Preview them here, then buy on Bandcamp when the moment is right.`
            : 'Releases you add to your Bandcamp wishlist will show up here.'
        }
        actions={
          <button type="button" className="button primary" onClick={shufflePlay} disabled={!filtered.length}>
            <Shuffle size={16} />
            Play something
          </button>
        }
      />

      {wishlist.length === 0 ? (
        <EmptyState
          icon={<Heart size={26} />}
          title="The wishlist is empty"
          description={
            snapshot.demo
              ? 'The demo fan has no public wishlist. Connect your account to see yours.'
              : 'Add a release to your wishlist on Bandcamp and it will appear here after the next sync.'
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
                placeholder="Filter the wishlist"
                spellCheck={false}
                aria-label="Filter wishlist"
              />
              {query ? (
                <button type="button" className="toolbar-clear" onClick={() => setQuery('')} aria-label="Clear filter">
                  <X size={14} />
                </button>
              ) : null}
            </div>
            <div className="toolbar-right">
              <label className="select-wrap">
                <span className="select-label">Sort</span>
                <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Sort wishlist">
                  <option value="recent">Recently added</option>
                  <option value="artist">Artist A–Z</option>
                  <option value="title">Release A–Z</option>
                </select>
              </label>
            </div>
          </div>
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Search size={24} />}
              title="No wishlist matches"
              description="Try a different artist or release name."
              action={<button type="button" className="button ghost" onClick={() => setQuery('')}>Clear filter</button>}
            />
          ) : (
            <div className={cx('album-grid', 'is-wishlist')}>
              {filtered.map((album, index) => (
                <AlbumCard key={album.key} album={album} priority={index < 8} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
