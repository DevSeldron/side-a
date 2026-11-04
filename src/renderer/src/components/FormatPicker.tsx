import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { DownloadCloud, Loader2 } from 'lucide-react'
import type { Album, PurchaseFormat } from '@shared/types'
import { useApp } from '../store/app'
import { Modal } from './Modal'
import { cx, errorMessage, formatBytes } from '../lib/format'

interface FormatPickerProps {
  album: Album | null
  open: boolean
  onClose: () => void
}

export function FormatPicker({ album, open, onClose }: FormatPickerProps): ReactElement {
  const settings = useApp((state) => state.snapshot?.settings)
  const purchases = useApp((state) => state.snapshot?.purchases)
  const downloadPurchase = useApp((state) => state.downloadPurchase)
  const [formats, setFormats] = useState<PurchaseFormat[]>([])
  const [selected, setSelected] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  const existing = album ? purchases?.[album.key] : undefined

  useEffect(() => {
    if (!open || !album) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setFormats([])
    window.sideA.purchases
      .formats(album.key)
      .then((result) => {
        if (cancelled) return
        setFormats(result)
        const preferred = result.find((entry) => entry.id === settings?.purchaseFormat)
        setSelected(preferred?.id ?? result[0]?.id ?? '')
        setLoading(false)
      })
      .catch((reason) => {
        if (cancelled) return
        setError(errorMessage(reason, 'Bandcamp did not return any download formats.'))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, album, settings?.purchaseFormat])

  const best = useMemo(() => formats.find((entry) => entry.id === (settings?.purchaseFormat ?? '')), [formats, settings?.purchaseFormat])
  const canDownload = Boolean(selected) && !starting && !loading

  const start = async (): Promise<void> => {
    if (!album || !selected) return
    setStarting(true)
    try {
      await downloadPurchase(album.key, selected)
      onClose()
    } catch {
      setStarting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="Original purchase"
      title={album ? `Download ${album.title}` : 'Download purchase'}
      width="md"
      footer={
        <>
          <span className="modal-note">
            {best && settings?.purchaseFormat === best.id ? 'Matches your preferred format' : 'Saved to your downloads folder'}
          </span>
          <button type="button" className="button primary" onClick={() => void start()} disabled={!canDownload}>
            {starting ? <Loader2 size={16} className="spin" /> : <DownloadCloud size={16} />}
            {existing?.status === 'done' ? 'Download again' : 'Download'}
          </button>
        </>
      }
    >
      {loading ? (
        <div className="format-loading">
          <Loader2 size={20} className="spin" />
          <span>Asking Bandcamp for your formats…</span>
        </div>
      ) : error ? (
        <p className="format-error">{error}</p>
      ) : (
        <div className="format-list">
          {formats.map((format) => (
            <button
              type="button"
              key={format.id}
              className={cx('format-row', selected === format.id && 'is-selected')}
              onClick={() => setSelected(format.id)}
            >
              <span className="format-radio" aria-hidden="true" />
              <span className="format-copy">
                <strong>{format.label}</strong>
                <span>{format.description ?? format.id.toUpperCase()}</span>
              </span>
              <span className="format-size">{format.size ? formatBytes(format.size) : ''}</span>
            </button>
          ))}
          {formats.length === 0 ? <p className="format-error">No downloadable formats were listed for this purchase.</p> : null}
        </div>
      )}
      {existing?.status === 'done' && existing.filePath ? (
        <p className="format-existing">
          Already saved to <code>{existing.filePath.split('/').pop()}</code>
        </p>
      ) : null}
    </Modal>
  )
}
