import { useMemo, useRef, type CSSProperties, type MouseEvent, type ReactElement } from 'react'
import {
  Loader2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward
} from 'lucide-react'
import { usePlayer } from '../store/player'
import { clamp, cx, formatDuration } from '../lib/format'

export function PlaybackControls({ size = 'sm' }: { size?: 'sm' | 'lg' }): ReactElement {
  const playing = usePlayer((state) => state.playing)
  const loading = usePlayer((state) => state.loading)
  const shuffle = usePlayer((state) => state.shuffle)
  const repeat = usePlayer((state) => state.repeat)
  const hasQueue = usePlayer((state) => state.queue.length > 0)
  const toggle = usePlayer((state) => state.toggle)
  const next = usePlayer((state) => state.next)
  const prev = usePlayer((state) => state.prev)
  const toggleShuffle = usePlayer((state) => state.toggleShuffle)
  const cycleRepeat = usePlayer((state) => state.cycleRepeat)
  const iconSize = size === 'lg' ? 22 : 17

  return (
    <div className={cx('playback-controls', `is-${size}`)}>
      <button
        type="button"
        className={cx('icon-button subtle', shuffle && 'is-active')}
        onClick={toggleShuffle}
        title={shuffle ? 'Shuffle on' : 'Shuffle'}
        aria-pressed={shuffle}
      >
        <Shuffle size={iconSize} />
      </button>
      <button
        type="button"
        className="icon-button subtle"
        onClick={() => void prev()}
        title="Previous"
        disabled={!hasQueue}
      >
        <SkipBack size={iconSize} fill="currentColor" />
      </button>
      <button
        type="button"
        className={cx('play-toggle', playing && 'is-playing', size === 'lg' && 'is-large')}
        onClick={() => void toggle()}
        title={playing ? 'Pause' : 'Play'}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {loading ? (
          <Loader2 size={size === 'lg' ? 26 : 19} className="spin" />
        ) : playing ? (
          <Pause size={size === 'lg' ? 26 : 19} fill="currentColor" />
        ) : (
          <Play size={size === 'lg' ? 26 : 19} fill="currentColor" className="play-glyph" />
        )}
      </button>
      <button
        type="button"
        className="icon-button subtle"
        onClick={() => void next()}
        title="Next"
        disabled={!hasQueue}
      >
        <SkipForward size={iconSize} fill="currentColor" />
      </button>
      <button
        type="button"
        className={cx('icon-button subtle', repeat !== 'off' && 'is-active')}
        onClick={cycleRepeat}
        title={repeat === 'one' ? 'Repeat one' : repeat === 'all' ? 'Repeat all' : 'Repeat off'}
        aria-pressed={repeat !== 'off'}
      >
        {repeat === 'one' ? <Repeat1 size={iconSize} /> : <Repeat size={iconSize} />}
      </button>
    </div>
  )
}

interface SeekBarProps {
  compact?: boolean
}

export function SeekBar({ compact = false }: SeekBarProps): ReactElement {
  const currentTime = usePlayer((state) => state.currentTime)
  const duration = usePlayer((state) => state.duration)
  const buffered = usePlayer((state) => state.buffered)
  const seek = usePlayer((state) => state.seek)
  const progress = duration > 0 ? clamp((currentTime / duration) * 100, 0, 100) : 0
  const bufferedPercent = duration > 0 ? clamp((buffered / duration) * 100, 0, 100) : 0
  const style = {
    '--seek-progress': `${progress}%`,
    '--seek-buffered': `${bufferedPercent}%`
  } as CSSProperties

  return (
    <div className={cx('seek-row', compact && 'is-compact')}>
      <span className="time-label">{formatDuration(currentTime)}</span>
      <input
        className="seek-bar"
        type="range"
        min={0}
        max={Math.max(duration, 0.1)}
        step={0.1}
        value={Math.min(currentTime, duration || 0)}
        style={style}
        onChange={(event) => seek(Number(event.target.value))}
        aria-label="Seek"
      />
      <span className="time-label">{formatDuration(duration)}</span>
    </div>
  )
}

export function WaveScrubber(): ReactElement {
  const currentTime = usePlayer((state) => state.currentTime)
  const duration = usePlayer((state) => state.duration)
  const track = usePlayer((state) => state.queue[state.index])
  const seek = usePlayer((state) => state.seek)
  const ref = useRef<HTMLDivElement>(null)
  const progress = duration > 0 ? clamp(currentTime / duration, 0, 1) : 0
  const bars = useMemo(() => {
    const seed = track?.id ?? 7
    return Array.from({ length: 76 }, (_, index) => {
      const value = Math.abs(Math.sin(seed * 0.017 + index * 1.73) * Math.cos(index * 0.41 + seed * 0.003))
      return 0.18 + value * 0.82
    })
  }, [track?.id])

  const handleClick = (event: MouseEvent<HTMLDivElement>): void => {
    const bounds = ref.current?.getBoundingClientRect()
    if (!bounds || duration <= 0) return
    const ratio = clamp((event.clientX - bounds.left) / bounds.width, 0, 1)
    seek(ratio * duration)
  }

  return (
    <div className="wave-scrubber" ref={ref} onClick={handleClick} role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(currentTime)} tabIndex={0} onKeyDown={(event) => {
      if (event.key === 'ArrowRight') seek(currentTime + 5)
      if (event.key === 'ArrowLeft') seek(currentTime - 5)
    }}>
      {bars.map((height, index) => (
        <span
          key={index}
          className={cx('wave-bar', index / bars.length <= progress && 'is-played')}
          style={{ height: `${Math.round(height * 100)}%` }}
        />
      ))}
    </div>
  )
}
