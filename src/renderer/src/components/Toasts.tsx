import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { useApp } from '../store/app'
import { cx } from '../lib/format'

function ToastRow({ id, title, description, tone }: { id: number; title: string; description?: string; tone: string }): ReactElement {
  const dismiss = useApp((state) => state.dismissToast)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setLeaving(true), 6200)
    return () => window.clearTimeout(timer)
  }, [id])

  useEffect(() => {
    if (!leaving) return
    const timer = window.setTimeout(() => dismiss(id), 220)
    return () => window.clearTimeout(timer)
  }, [dismiss, id, leaving])

  return (
    <div className={cx('toast', `is-${tone}`, leaving && 'is-leaving')} role="status">
      <span className="toast-icon">
        {tone === 'success' ? <CheckCircle2 size={18} /> : tone === 'error' ? <AlertTriangle size={18} /> : <Info size={18} />}
      </span>
      <div className="toast-copy">
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
      </div>
      <button type="button" className="toast-close" onClick={() => setLeaving(true)} aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  )
}

export function Toasts(): ReactElement {
  const toasts = useApp((state) => state.toasts)
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <ToastRow key={toast.id} {...toast} />
      ))}
    </div>
  )
}
