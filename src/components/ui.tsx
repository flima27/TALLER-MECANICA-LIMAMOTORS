import { ReactNode, createContext, useContext, useState, useCallback, useEffect } from 'react'
import { X, Loader2, Inbox } from 'lucide-react'
import { ALL_STATUS_LABEL, STATUS_TONE } from '../lib/constants'

// ---------- Avisos (toast) ----------
type ToastFn = (msg: string, type?: 'ok' | 'error') => void
const ToastCtx = createContext<ToastFn>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; type: string }[]>([])
  const push = useCallback<ToastFn>((msg, type = 'ok') => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x, { id, msg, type }])
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4500)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4">
        {items.map((i) => (
          <div key={i.id} role="status"
            className={`pointer-events-auto max-w-md rounded-md px-4 py-2.5 text-sm font-medium shadow-lg ${i.type === 'error' ? 'bg-red-600 text-white' : 'bg-ink text-white'}`}>
            {i.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

// ---------- Piezas básicas ----------
export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className || 'h-5 w-5 text-steel-400'}`} />
}

export function Loading() {
  return <div className="flex justify-center py-16"><Spinner className="h-7 w-7 text-amber-500" /></div>
}

export function Empty({ text = 'No hay registros todavía.', children }: { text?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-steel-500">
      <Inbox className="h-8 w-8 text-steel-300" />
      <p className="text-sm">{text}</p>
      {children}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-semibold leading-none tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-steel-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ children, className = '', title, actions }: { children: ReactNode; className?: string; title?: string; actions?: ReactNode }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-steel-100 px-4 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      {children}
    </section>
  )
}

export function Badge({ children, tone = 'bg-steel-100 text-steel-600' }: { children: ReactNode; tone?: string }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ${tone}`}>{children}</span>
}

export function StatusBadge({ status, label }: { status?: string | null; label?: string }) {
  if (!status) return <span className="text-steel-400">—</span>
  return <Badge tone={STATUS_TONE[status] || ''}>{label || ALL_STATUS_LABEL[status] || status}</Badge>
}

export function Stat({ label, value, tone = 'text-ink', hint }: { label: string; value: ReactNode; tone?: string; hint?: string }) {
  return (
    <div className="card px-4 py-3">
      <div className={`font-display text-3xl font-semibold leading-none ${tone}`}>{value}</div>
      <div className="mt-1.5 text-xs font-medium text-steel-500">{label}</div>
      {hint && <div className="mt-0.5 text-xs text-steel-400">{hint}</div>}
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide, footer }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink/60" onClick={onClose} />
      <div className={`relative flex max-h-[92vh] w-full flex-col rounded-t-xl bg-white shadow-xl sm:rounded-xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-xl'}`}>
        <header className="flex items-center justify-between border-b border-steel-100 px-5 py-3">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-steel-500 hover:bg-steel-100" aria-label="Cerrar"><X className="h-5 w-5" /></button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-steel-100 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  )
}

export function Field({ label, children, hint, className = '' }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold text-steel-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-steel-400">{hint}</span>}
    </label>
  )
}

export function Select({ value, onChange, options, placeholder = 'Seleccionar…', className = '', disabled }: {
  value: any; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string; className?: string; disabled?: boolean
}) {
  return (
    <select className={`input ${className}`} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[560px] divide-y divide-steel-100">{children}</table></div>
}

export function SearchBox({ value, onChange, placeholder = 'Buscar…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input className="input sm:max-w-xs" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
}

export function Tabs({ tabs, value, onChange }: { tabs: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-steel-200">
      {tabs.map((t) => (
        <button key={t.value} onClick={() => onChange(t.value)}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${value === t.value ? 'border-amber-500 text-ink' : 'border-transparent text-steel-500 hover:text-ink'}`}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function KV({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-steel-500">{label}</dt>
      <dd className="mt-0.5 text-sm">{children || <span className="text-steel-400">—</span>}</dd>
    </div>
  )
}

export const confirmAsk = (msg: string) => window.confirm(msg)
