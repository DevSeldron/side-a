import type { ReactElement } from 'react'
import { useEffect } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { useApp } from '../store/app'
import { cx } from '../lib/format'

function ToastRow({ id, title, description, tone }: { id: number; title: string; description?: string; tone: string }): ReactElement {
  const dismiss = useApp((state) => state.dismissToast)
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(id), 6200)
    return () => window.clearTimeout(timer)
  }, [id, dismiss])

  return (
    <div className={cx('toast', `is-${tone}`)} role="status">
      <span className="toast-icon">
        {tone === 'success' ? <CheckCircle2 size={18} /> : tone === 'error' ? <AlertTriangle size={18} /> : <Info size={18} />}
      </span>
      <div className="toast-copy">
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
      </div>
      <button type="button" className="toast-close" onClick={() => dismiss(id)} aria-label="Dismiss">
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
