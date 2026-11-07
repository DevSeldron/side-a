import type { ReactElement, ReactNode } from 'react'
import { Disc3 } from 'lucide-react'
import { cx } from '../lib/format'

export function PageIntro({
  kicker,
  title,
  description,
  actions,
  children
}: {
  kicker?: string
  title: string
  description?: string
  actions?: ReactNode
  children?: ReactNode
}): ReactElement {
  return (
    <section className="page-intro">
      <div className="page-intro-copy">
        {kicker ? <span className="page-kicker">{kicker}</span> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="page-intro-actions">{actions}</div> : null}
    </section>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action
}: {
  icon?: ReactNode
  title: string
  description: string
  action?: ReactNode
}): ReactElement {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon ?? <Disc3 size={26} />}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  )
}

export function ProgressBar({ value, tone = 'teal' }: { value: number; tone?: 'teal' | 'muted' }): ReactElement {
  return (
    <span className={cx('progress-bar', `is-${tone}`)}>
      <span style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </span>
  )
}
