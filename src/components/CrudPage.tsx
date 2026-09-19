import { ReactNode, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useQuery, useOptions, OptionsFrom } from '../lib/hooks'
import { errMsg } from '../lib/util'
import { Card, Empty, Field, Loading, Modal, PageHeader, SearchBox, TableWrap, useToast, confirmAsk } from './ui'

export type Col = { key: string; label: string; render?: (row: any) => ReactNode; className?: string }
export type FieldDef = {
  key: string
  label: string
  type?: 'text' | 'number' | 'date' | 'textarea' | 'select' | 'checkbox' | 'email' | 'tel'
  options?: { value: string; label: string }[]
  optionsFrom?: OptionsFrom
  required?: boolean
  placeholder?: string
  full?: boolean
  hint?: string
  step?: string
  readOnlyOnEdit?: boolean
}

type Props = {
  table: string
  title: string
  subtitle?: string
  select?: string
  columns: Col[]
  fields: FieldDef[]
  searchKeys?: string[]
  orderBy?: { col: string; asc?: boolean }
  canCreate?: boolean
  canEdit?: boolean
  canDelete?: boolean
  defaults?: Record<string, any>
  filter?: (q: any) => any
  rowActions?: (row: any, reload: () => void) => ReactNode
  headerExtra?: ReactNode
  newLabel?: string
  itemName?: string
  beforeSave?: (values: any, isNew: boolean) => any
  modalWide?: boolean
  onRowClick?: (row: any) => void
  afterSave?: (row: any, isNew: boolean) => void | Promise<void>
}

function FieldInput({ f, value, onChange, isNew }: { f: FieldDef; value: any; onChange: (v: any) => void; isNew: boolean }) {
  const dyn = useOptions(f.optionsFrom)
  const options = f.options || dyn
  const dis = !!f.readOnlyOnEdit && !isNew
  if (f.type === 'checkbox')
    return (
      <label className="flex items-center gap-2 pt-5 text-sm font-medium">
        <input type="checkbox" className="h-4 w-4 accent-amber-500" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {f.label}
      </label>
    )
  return (
    <Field label={f.label + (f.required ? ' *' : '')} hint={f.hint} className={f.full || f.type === 'textarea' ? 'sm:col-span-2' : ''}>
      {f.type === 'textarea' ? (
        <textarea className="input min-h-[84px]" value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} />
      ) : f.type === 'select' ? (
        <select className="input" value={value ?? ''} disabled={dis} onChange={(e) => onChange(e.target.value)}>
          <option value="">Seleccionar…</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input className="input" type={f.type || 'text'} step={f.type === 'number' ? f.step || 'any' : undefined} value={value ?? ''}
          disabled={dis} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} />
      )}
    </Field>
  )
}

export default function CrudPage(p: Props) {
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<any | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const canCreate = p.canCreate ?? true
  const canEdit = p.canEdit ?? true
  const canDelete = p.canDelete ?? false

  const { data, loading, error, reload } = useQuery(async () => {
    let q: any = supabase.from(p.table).select(p.select || '*').limit(1000)
    if (p.filter) q = p.filter(q)
    q = q.order(p.orderBy?.col || 'created_at', { ascending: p.orderBy?.asc ?? false })
    const { data, error } = await q
    if (error) throw error
    return data as any[]
  }, [p.table])

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase()
    if (!s) return data || []
    const keys = p.searchKeys || p.columns.map((c) => c.key)
    return (data || []).filter((r) => keys.some((k) => String(k.split('.').reduce((a: any, x) => a?.[x], r) ?? '').toLowerCase().includes(s)))
  }, [data, search])

  const openNew = () => {
    const init: any = { ...(p.defaults || {}) }
    p.fields.forEach((f) => { if (f.type === 'checkbox' && init[f.key] === undefined) init[f.key] = true })
    setEditing(init); setIsNew(true)
  }
  const openEdit = (r: any) => { setEditing({ ...r }); setIsNew(false) }

  const save = async () => {
    for (const f of p.fields) {
      if (f.required && (editing[f.key] === undefined || editing[f.key] === null || editing[f.key] === '')) {
        toast(`Falta completar: ${f.label}`, 'error'); return
      }
    }
    let payload: any = {}
    p.fields.forEach((f) => {
      let v = editing[f.key]
      if (f.type === 'number') v = v === '' || v === undefined || v === null ? null : Number(v)
      else if (f.type === 'checkbox') v = !!v
      else if (v === '' || v === undefined) v = null
      payload[f.key] = v
    })
    // Valores por defecto no editables (p.ej. claves fijas) al crear
    if (isNew) Object.entries(p.defaults || {}).forEach(([k, v]) => { if (!(k in payload)) payload[k] = v })
    if (p.beforeSave) payload = p.beforeSave(payload, isNew)
    setSaving(true)
    try {
      const res: any = isNew
        ? await supabase.from(p.table).insert(payload).select().single()
        : await supabase.from(p.table).update(payload).eq('id', editing.id).select().single()
      if (res.error) throw res.error
      if (p.afterSave) await p.afterSave(res.data, isNew)
      toast(isNew ? 'Registro creado' : 'Cambios guardados')
      setEditing(null); reload()
    } catch (e) { toast(errMsg(e), 'error') }
    setSaving(false)
  }

  const remove = async (r: any) => {
    if (!confirmAsk('¿Eliminar este registro? Esta acción no se puede deshacer.')) return
    const { error } = await supabase.from(p.table).delete().eq('id', r.id)
    if (error) toast(errMsg(error), 'error'); else { toast('Registro eliminado'); reload() }
  }

  return (
    <div>
      <PageHeader title={p.title} subtitle={p.subtitle}
        actions={<>
          {p.headerExtra}
          {canCreate && <button className="btn-primary" onClick={openNew}><Plus className="h-4 w-4" /> {p.newLabel || 'Nuevo'}</button>}
        </>} />
      <Card>
        <div className="border-b border-steel-100 p-3"><SearchBox value={search} onChange={setSearch} /></div>
        {loading ? <Loading /> : error ? <p className="p-4 text-sm text-red-600">{error}</p> : rows.length === 0 ? <Empty text={search ? 'Sin resultados para tu búsqueda.' : undefined} /> : (
          <TableWrap>
            <thead><tr>{p.columns.map((c) => <th key={c.key} className="th">{c.label}</th>)}<th className="th w-1" /></tr></thead>
            <tbody className="divide-y divide-steel-100">
              {rows.map((r) => (
                <tr key={r.id} className={p.onRowClick ? 'cursor-pointer hover:bg-steel-50' : ''} onClick={() => p.onRowClick?.(r)}>
                  {p.columns.map((c) => (
                    <td key={c.key} className={`td ${c.className || ''}`}>
                      {c.render ? c.render(r) : (r[c.key] ?? <span className="text-steel-400">—</span>)}
                    </td>
                  ))}
                  <td className="td" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {p.rowActions?.(r, reload)}
                      {canEdit && <button className="btn-ghost btn-sm" onClick={() => openEdit(r)} aria-label="Editar"><Pencil className="h-4 w-4" /></button>}
                      {canDelete && <button className="btn-ghost btn-sm text-red-600" onClick={() => remove(r)} aria-label="Eliminar"><Trash2 className="h-4 w-4" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} wide={p.modalWide}
        title={(isNew ? 'Nuevo · ' : 'Editar · ') + (p.itemName || p.title)}
        footer={<>
          <button className="btn-secondary" onClick={() => setEditing(null)}>Cancelar</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </>}>
        {editing && (
          <div className="grid gap-3 sm:grid-cols-2">
            {p.fields.map((f) => (
              <FieldInput key={f.key} f={f} isNew={isNew} value={editing[f.key]} onChange={(v) => setEditing((e: any) => ({ ...e, [f.key]: v }))} />
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
