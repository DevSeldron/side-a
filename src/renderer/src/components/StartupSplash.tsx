import type { ReactElement } from 'react'
import { BrandMark } from './Brand'
import { cx } from '../lib/format'

const STARS = [
  { left: 12, top: 24, delay: 0, size: 2 },
  { left: 21, top: 68, delay: -900, size: 1 },
  { left: 32, top: 16, delay: -1600, size: 1 },
  { left: 42, top: 78, delay: -400, size: 2 },
  { left: 57, top: 20, delay: -1200, size: 1 },
  { left: 68, top: 72, delay: -700, size: 2 },
  { left: 76, top: 30, delay: -2000, size: 1 },
  { left: 86, top: 58, delay: -300, size: 2 },
  { left: 17, top: 44, delay: -1400, size: 1 },
  { left: 49, top: 40, delay: -2200, size: 1 },
  { left: 63, top: 86, delay: -1000, size: 1 },
  { left: 91, top: 14, delay: -1800, size: 1 }
]

export function StartupSplash({ leaving }: { leaving: boolean }): ReactElement {
  return (
    <div
      className={cx('startup-splash', leaving && 'is-leaving')}
      role="status"
      aria-live="polite"
      aria-label="Side A is starting"
    >
      <div className="startup-aura" aria-hidden="true" />
      <div className="startup-horizon" aria-hidden="true" />
      <div className="startup-sky" aria-hidden="true">
        {STARS.map((star, index) => (
          <span
            key={`${star.left}-${star.top}-${index}`}
            className="startup-star"
            style={{
              left: `${star.left}%`,
              top: `${star.top}%`,
              width: star.size,
              height: star.size,
              animationDelay: `${star.delay}ms`
            }}
          />
        ))}
      </div>

      <div className="startup-stage">
        <div className="startup-mark-wrap" aria-hidden="true">
          <span className="startup-ring is-one" />
          <span className="startup-ring is-two" />
          <BrandMark className="startup-mark" />
        </div>

        <div className="startup-wordmark" aria-hidden="true">
          {['S', 'I', 'D', 'E'].map((letter, index) => (
            <span key={letter} style={{ animationDelay: `${260 + index * 70}ms` }}>
              {letter}
            </span>
          ))}
          <span className="startup-wordmark-gap" />
          <span style={{ animationDelay: '560ms' }}>A</span>
        </div>

        <p className="startup-caption">Finding your records</p>
        <div className="startup-progress" aria-hidden="true">
          <span />
        </div>
      </div>
    </div>
  )
}
