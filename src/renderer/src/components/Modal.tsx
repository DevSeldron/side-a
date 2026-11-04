import { useEffect, type ReactElement, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cx } from '../lib/format'

interface ModalProps {
  open: boolean
  title: string
  eyebrow?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: 'sm' | 'md' | 'lg'
}

export function Modal({ open, title, eyebrow, onClose, children, footer, width = 'md' }: ModalProps): ReactElement | null {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <div className={cx('modal', `is-${width}`)}>
        <header className="modal-head">
          <div>
            {eyebrow ? <span className="modal-eyebrow">{eyebrow}</span> : null}
            <h2>{title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </div>
    </div>
  )
}
