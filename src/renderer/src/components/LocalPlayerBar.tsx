import type { CSSProperties, ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { ChevronUp, FolderOpen, Volume1, Volume2, VolumeX } from 'lucide-react'
import { useLocalPlayer } from '../store/localPlayer'
import { Artwork } from './Artwork'
import { LocalPlaybackControls, LocalSeekBar } from './LocalPlayback'

export function LocalPlayerBar(): ReactElement | null {
  const track = useLocalPlayer((state) => state.queue[state.index])
  const volume = useLocalPlayer((state) => state.volume)
  const muted = useLocalPlayer((state) => state.muted)
  const setVolume = useLocalPlayer((state) => state.setVolume)
  const toggleMute = useLocalPlayer((state) => state.toggleMute)
  const setExpanded = useLocalPlayer((state) => state.setExpanded)

  if (!track) return null

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  return (
    <footer className="player-bar local-player-bar">
      <div className="player-track" key={track.id}>
        <Link to="/local" className="player-art">
          <Artwork src={track.coverUrl} alt={track.album} />
          <span className="player-local-dot" title="Playing from this device">
            <FolderOpen size={9} />
          </span>
        </Link>
        <div className="player-copy">
          <Link to="/local" className="player-title">
            {track.title}
          </Link>
          <span className="player-artist">
            {track.artist}
            <span className="player-local-album"> / {track.album}</span>
          </span>
        </div>
      </div>

      <div className="player-center">
        <LocalPlaybackControls />
        <LocalSeekBar compact />
      </div>

      <div className="player-side">
        <span className="player-source-label">Local file</span>
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
            aria-label="Local player volume"
          />
        </div>
        <button type="button" className="icon-button subtle" onClick={() => setExpanded(true)} title="Open local now playing">
          <ChevronUp size={18} />
        </button>
      </div>
    </footer>
  )
}
