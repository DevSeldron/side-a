import type { ReactElement } from 'react'
import { Heart } from 'lucide-react'
import type { LikedTrack } from '@shared/types'
import type { PlayerTrack } from '../store/player'
import { useApp } from '../store/app'
import { cx } from '../lib/format'

/** Turns a player queue entry into the shape liked songs are stored in. */
export function likedFromPlayer(track: PlayerTrack): LikedTrack {
  return {
    key: `${track.albumKey}:${track.id}`,
    albumKey: track.albumKey,
    id: track.id,
    title: track.title,
    artist: track.artist,
    bandName: track.bandName,
    albumTitle: track.albumTitle,
    coverUrl: track.coverUrl,
    itemUrl: track.itemUrl,
    duration: track.duration,
    likedAt: 0
  }
}

interface LikeButtonProps {
  track: LikedTrack
  size?: number
  className?: string
  /** Keeps the heart for liked songs whose release is no longer in the collection. */
  always?: boolean
}

/** Heart that adds the song to liked songs, or takes it out again. */
export function LikeButton({ track, size = 14, className, always }: LikeButtonProps): ReactElement | null {
  const liked = useApp((state) => Boolean(state.snapshot?.liked[track.key]))
  // Only owned releases can be liked, wishlist and unowned streams have no heart.
  const owned = useApp(
    (state) => state.snapshot?.collection.some((entry) => entry.key === track.albumKey) ?? false
  )
  const applyLikes = useApp((state) => state.applyLikes)
  const pushToast = useApp((state) => state.pushToast)

  const toggle = async (): Promise<void> => {
    try {
      applyLikes(await window.sideA.likes.toggle(track))
    } catch {
      pushToast(liked ? 'Could not unlike this song' : 'Could not like this song', { tone: 'error' })
    }
  }

  if (!owned && !always) return null

  return (
    <button
      type="button"
      className={cx('track-like', liked && 'is-liked', className)}
      title={liked ? `Unlike ${track.title}` : `Like ${track.title}`}
      aria-label={liked ? `Unlike ${track.title}` : `Like ${track.title}`}
      aria-pressed={liked}
      onClick={(event) => {
        event.stopPropagation()
        event.preventDefault()
        void toggle()
      }}
    >
      <Heart size={size} fill={liked ? 'currentColor' : 'none'} />
    </button>
  )
}
