import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDownToLine,
  Command,
  HardDrive,
  Heart,
  Library,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Settings,
  X
} from 'lucide-react'
import type { Album } from '@shared/types'
import { useApp } from '../store/app'
import { usePlayer } from '../store/player'
import { coverUrl, cx } from '../lib/format'

interface PaletteItem {
  id: string
  label: string
  sub?: string
  icon: ReactElement
  art?: string
  run: () => void | Promise<void>
}

export function CommandPalette(): ReactElement | null {
  const open = useApp((state) => state.paletteOpen)
  const setOpen = useApp((state) => state.setPaletteOpen)
  const snapshot = useApp((state) => state.snapshot)
  const sync = useApp((state) => state.sync)
  const saveAllPurchased = useApp((state) => state.saveAllPurchased)
  const navigate = useNavigate()
  const playAlbum = usePlayer((state) => state.playAlbum)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setActive(0)
      return
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.clearTimeout(timer)
  }, [open])

  const items = useMemo<PaletteItem[]>(() => {
    if (!snapshot) return []
    const term = query.trim().toLowerCase()
    const releases: Album[] = [...snapshot.collection, ...snapshot.wishlist]
    const matches = term
      ? releases.filter(
          (album) =>
            album.title.toLowerCase().includes(term) ||
            album.bandName.toLowerCase().includes(term)
        )
      : snapshot.collection.slice(0, 6)
    const unique = matches.filter((album, index, all) => all.findIndex((entry) => entry.key === album.key) === index).slice(0, 8)

    const releaseItems: PaletteItem[] = unique.map((album) => ({
      id: `album-${album.key}`,
      label: album.title,
      sub: album.bandName,
      art: coverUrl(album, 9),
      icon: <Play size={15} />,
      run: async () => {
        setOpen(false)
        navigate(`/album/${album.key}`)
        await playAlbum(album.key)
      }
    }))

    if (term && releaseItems.length) return releaseItems
    if (term) {
      return [
        ...releaseItems,
        {
          id: 'no-results',
          label: 'No releases found',
          sub: 'Try a different artist or album',
          icon: <Search size={15} />,
          run: () => undefined
        }
      ]
    }

    const actions: PaletteItem[] = [
      {
        id: 'sync',
        label: 'Sync library',
        sub: 'Refresh collection and wishlist from Bandcamp',
        icon: <RefreshCw size={15} />,
        run: () => {
          setOpen(false)
          void sync()
        }
      },
      {
        id: 'offline',
        label: 'Go to Offline',
        sub: 'Everything saved on this device',
        icon: <HardDrive size={15} />,
        run: () => {
          setOpen(false)
          navigate('/offline')
        }
      },
      {
        id: 'save-all',
        label: 'Save all purchases offline',
        sub: 'Queue every purchased release for offline listening',
        icon: <ArrowDownToLine size={15} />,
        run: () => {
          setOpen(false)
          void saveAllPurchased()
        }
      },
      {
        id: 'wishlist',
        label: 'Go to Wishlist',
        sub: `${snapshot.wishlist.length} releases saved for later`,
        icon: <Heart size={15} />,
        run: () => {
          setOpen(false)
          navigate('/wishlist')
        }
      },
      {
        id: 'collection',
        label: 'Go to Collection',
        sub: `${snapshot.collection.length} releases`,
        icon: <Library size={15} />,
        run: () => {
          setOpen(false)
          navigate('/')
        }
      },
      {
        id: 'settings',
        label: 'Open Settings',
        sub: 'Downloads, accent and account',
        icon: <Settings size={15} />,
        run: () => {
          setOpen(false)
          navigate('/settings')
        }
      }
    ]

    return [...releaseItems, ...actions]
  }, [snapshot, query, setOpen, navigate, playAlbum, sync, saveAllPurchased])

  useEffect(() => {
    setActive(0)
  }, [query])

  if (!open) return null

  const runItem = (item: PaletteItem): void => {
    if (item.id === 'no-results') return
    void item.run()
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => (items.length ? (index + 1) % items.length : 0))
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => (items.length ? (index - 1 + items.length) % items.length : 0))
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const item = items[active]
      if (item) runItem(item)
    }
    if (event.key === 'Escape') setOpen(false)
  }

  return (
    <div
      className="palette-layer"
      role="dialog"
      aria-modal="true"
      aria-label="Search Side A"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false)
      }}
    >
      <div className="palette">
        <div className="palette-input-row">
          <Search size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search your collection, or jump to a page…"
            spellCheck={false}
            aria-label="Search"
          />
          <button type="button" className="palette-escape" onClick={() => setOpen(false)} aria-label="Close search">
            <X size={14} />
          </button>
        </div>
        <div className="palette-results" role="listbox">
          {items.map((item, index) => (
            <button
              type="button"
              key={item.id}
              role="option"
              aria-selected={index === active}
              className={cx('palette-row', index === active && 'is-active', item.id === 'no-results' && 'is-muted')}
              onMouseEnter={() => setActive(index)}
              onClick={() => runItem(item)}
            >
              <span className="palette-icon">{item.art ? <img src={item.art} alt="" draggable={false} /> : item.icon}</span>
              <span className="palette-copy">
                <strong>{item.label}</strong>
                {item.sub ? <span>{item.sub}</span> : null}
              </span>
              {index === active && item.id !== 'no-results' ? (
                <span className="palette-hint">
                  <Command size={11} /> ↵
                </span>
              ) : null}
            </button>
          ))}
          {items.length === 0 ? (
            <div className="palette-empty">
              <Loader2 size={18} className="spin" />
              <span>Loading your library…</span>
            </div>
          ) : null}
        </div>
        <footer className="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> to move</span>
          <span><kbd>↵</kbd> to play</span>
          <span><kbd>esc</kbd> to close</span>
        </footer>
      </div>
    </div>
  )
}
