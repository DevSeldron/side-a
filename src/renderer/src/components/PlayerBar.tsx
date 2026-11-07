import type { CSSProperties, ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { ChevronUp, Volume1, Volume2, VolumeX } from 'lucide-react'
import { usePlayer } from '../store/player'
import { useLocalPlayer } from '../store/localPlayer'
import { useAudioFocus } from '../lib/audioFocus'
import { Artwork } from './Artwork'
import { PlaybackControls, SeekBar } from './Playback'
import { LikeButton, likedFromPlayer } from './LikeButton'
import { cx } from '../lib/format'

export function PlayerBar(): ReactElement | null {
  const track = usePlayer((state) => state.queue[state.index])
  const volume = usePlayer((state) => state.volume)
  const muted = usePlayer((state) => state.muted)
  const setVolume = usePlayer((state) => state.setVolume)
  const toggleMute = usePlayer((state) => state.toggleMute)
  const setExpanded = usePlayer((state) => state.setExpanded)

  if (!track) return null

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  return (
    <footer className="player-bar">
      <div className="player-track" key={`${track.albumKey}-${track.id}`}>
        <Link to={`/album/${track.albumKey}`} className="player-art">
          <Artwork src={track.coverUrl} alt={track.albumTitle} />
          {track.offline ? <span className="player-offline-dot" title="Offline copy" /> : null}
        </Link>
        <div className="player-copy">
          <Link to={`/album/${track.albumKey}`} className="player-title">
            {track.title}
          </Link>
          <span className="player-artist">{track.artist}</span>
        </div>
      </div>

      <div className="player-center">
        <PlaybackControls />
        <SeekBar compact />
      </div>

      <div className="player-side">
        <LikeButton track={likedFromPlayer(track)} size={16} className="player-like" />
        <div className="player-volume">
          <button type="button" className="icon-button subtle" onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'}>
            <VolumeIcon size={17} />
          </button>
          <input
            className="volume-bar"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            style={{ '--volume': `${(muted ? 0 : volume) * 100}%` } as CSSProperties}
            onChange={(event) => setVolume(Number(event.target.value))}
            aria-label="Volume"
          />
        </div>
        <button type="button" className="icon-button subtle expand-button" onClick={() => setExpanded(true)} title="Open now playing">
          <ChevronUp size={18} />
        </button>
      </div>
    </footer>
  )
}

export function PlayerSpacer(): ReactElement {
  const source = useAudioFocus((state) => state.source)
  const bandcampTracks = usePlayer((state) => state.queue.length)
  const localTracks = useLocalPlayer((state) => state.queue.length)
  const hasTrack = source === 'local' ? localTracks > 0 : bandcampTracks > 0
  return <div className={cx('player-spacer', hasTrack && 'is-visible')} aria-hidden="true" />
}
