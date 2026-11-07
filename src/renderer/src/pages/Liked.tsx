import type { ReactElement } from 'react'
import { Heart, Play, Shuffle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useApp } from '../store/app'
import { usePlayer } from '../store/player'
import { Artwork } from '../components/Artwork'
import { LikeButton } from '../components/LikeButton'
import { EmptyState, PageIntro } from '../components/Page'
import { formatDuration } from '../lib/format'

export function Liked(): ReactElement {
  const liked = useApp((state) => state.snapshot?.liked)
  const playLiked = usePlayer((state) => state.playLiked)

  if (!liked) return <div className="page" />

  const tracks = Object.values(liked).sort((a, b) => b.likedAt - a.likedAt)
  const releases = new Set(tracks.map((track) => track.albumKey))
  const runtime = tracks.reduce((total, track) => total + track.duration, 0)

  const shufflePlay = (): void => {
    const shuffled = [...tracks]
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1))
      const first = shuffled[index]
      const second = shuffled[swap]
      if (!first || !second) continue
      shuffled[index] = second
      shuffled[swap] = first
    }
    void playLiked(shuffled)
  }

  return (
    <div className="page">
      <PageIntro
        title="Liked songs"
        actions={
          tracks.length ? (
            <>
              <button type="button" className="button ghost" onClick={shufflePlay} disabled={tracks.length < 2}>
                <Shuffle size={16} />
                Shuffle
              </button>
              <button type="button" className="button primary" onClick={() => void playLiked(tracks)}>
                <Play size={16} fill="currentColor" />
                Play all
              </button>
            </>
          ) : null
        }
      >
        {tracks.length ? (
          <div className="stat-row">
            <div className="stat">
              <strong>{tracks.length}</strong>
              <span>Songs</span>
            </div>
            <div className="stat">
              <strong>{releases.size}</strong>
              <span>Releases</span>
            </div>
            <div className="stat">
              <strong>{formatDuration(runtime)}</strong>
              <span>Runtime</span>
            </div>
          </div>
        ) : null}
      </PageIntro>

      {tracks.length === 0 ? (
        <EmptyState
          icon={<Heart size={26} />}
          title="No liked songs yet"
          description="The heart next to a track, or in the player bar, saves it here, liked songs keep their artwork and album so you can jump back to the release"
          action={
            <Link to="/" className="button primary">
              Browse collection
            </Link>
          }
        />
      ) : (
        <div className="offline-list liked-list">
          {tracks.map((track, position) => (
            <div
              key={track.key}
              className="offline-row liked-row"
              role="button"
              tabIndex={0}
              onClick={() => void playLiked(tracks, position)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  void playLiked(tracks, position)
                }
              }}
            >
              <span className="offline-art">
                <Artwork src={track.coverUrl} alt={track.albumTitle} />
              </span>
              <div className="offline-copy">
                <span className="offline-band">{track.artist}</span>
                <span className="offline-title">{track.title}</span>
                <div className="offline-status-line">
                  <span>
                    <Link
                      to={`/album/${track.albumKey}`}
                      className="liked-album"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {track.albumTitle}
                    </Link>{' '}
                    / {formatDuration(track.duration)}
                  </span>
                </div>
              </div>
              <div className="offline-actions">
                <LikeButton track={track} size={16} always />
                <button
                  type="button"
                  className="icon-button"
                  title={`Play ${track.title}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    void playLiked(tracks, position)
                  }}
                >
                  <Play size={16} fill="currentColor" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
