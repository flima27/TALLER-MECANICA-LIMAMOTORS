import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeftRight, Paperclip, Plus, PackagePlus, PackageMinus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useQuery, useOptions } from '../lib/hooks'
import { MOVE_REASON, PRODUCT_KIND, opts } from '../lib/constants'
import { downloadCSV, errMsg, fmtDate, fmtDateTime, fmtMoney, fmtNum } from '../lib/util'
import { uploadFilesTo } from '../lib/upload'
import CrudPage from '../components/CrudPage'
import FileManager from '../components/Files'
import { Badge, Card, Empty, Field, Loading, Modal, PageHeader, SearchBox, TableWrap, useToast } from '../components/ui'

const stockBadge = (qty: number, min: number) =>
  qty <= 0 ? <Badge tone="bg-red-100 text-red-700">Sin stock</Badge>
    : qty <= min ? <Badge tone="bg-orange-100 text-orange-800">Stock bajo</Badge>
      : <Badge tone="bg-emerald-100 text-emerald-800">Disponible</Badge>

/* ------------------------------ PRODUCTOS ------------------------------ */
export function Products() {
  const { role } = useAuth()
  const can = role === 'admin' || role === 'almacenero'
  const total = (r: any) => (r.stock || []).reduce((a: number, s: any) => a + Number(s.qty), 0)
  return (
    <CrudPage table="products" title="Productos" subtitle="Repuestos, lubricantes, filtros y materiales" itemName="producto"
      select="*, supplier:suppliers(name), stock:warehouse_stock(qty)" canCreate={can} canEdit={can} canDelete={role === 'admin'} modalWide
      orderBy={{ col: 'name', asc: true }} searchKeys={['code', 'barcode', 'name', 'brand', 'part_number', 'category', 'compatibility']}
      columns={[
        { key: 'code', label: 'Código' }, { key: 'name', label: 'Producto', render: (r) => <span className="font-semibold">{r.name}</span> },
        { key: 'kind', label: 'Tipo', render: (r) => PRODUCT_KIND[r.kind] }, { key: 'brand', label: 'Marca' },
        { key: 'stock', label: 'Stock', render: (r) => <span className="font-semibold">{fmtNum(total(r))} <span className="font-normal text-steel-500">{r.unit}</span></span> },
        { key: 'st', label: 'Estado', render: (r) => stockBadge(total(r), Number(r.min_stock)) },
        ...(role === 'almacenero' || role === 'admin' ? [{ key: 'purchase_price', label: 'Costo', render: (r: any) => fmtMoney(r.purchase_price) }] : []),
        { key: 'sale_price', label: 'Precio venta', render: (r) => fmtMoney(r.sale_price) },
      ]}
      fields={[
        { key: 'name', label: 'Nombre', required: true, full: true }, { key: 'code', label: 'Código interno' }, { key: 'barcode', label: 'Código de barras' },
        { key: 'kind', label: 'Tipo', type: 'select', options: opts(PRODUCT_KIND), required: true }, { key: 'category', label: 'Categoría' },
        { key: 'brand', label: 'Marca' }, { key: 'model', label: 'Modelo' }, { key: 'part_number', label: 'N° de parte' },
        { key: 'supplier_id', label: 'Proveedor', type: 'select', optionsFrom: { table: 'suppliers', label: 'name' } },
        { key: 'purchase_price', label: 'Precio de compra (Bs)', type: 'number' }, { key: 'sale_price', label: 'Precio de venta (Bs)', type: 'number', required: true },
        { key: 'min_stock', label: 'Stock mínimo (alerta)', type: 'number' }, { key: 'unit', label: 'Unidad', placeholder: 'unidad, litro, kit…' },
        { key: 'location', label: 'Ubicación (estante)' }, { key: 'compatibility', label: 'Compatibilidad con vehículos', full: true },
        { key: 'description', label: 'Descripción', type: 'textarea' }, { key: 'active', label: 'Producto activo', type: 'checkbox' },
      ]}
      beforeSave={(v) => ({ ...v, unit: v.unit || 'unidad', min_stock: v.min_stock ?? 0, purchase_price: v.purchase_price ?? 0, code: v.code || null })} />
  )
}

/* ------------------------------ INVENTARIO ------------------------------ */
export function Inventory() {
  const { role } = useAuth()
  const can = role === 'admin' || role === 'almacenero'
  const [search, setSearch] = useState('')
  const [wh, setWh] = useState('')
  const [move, setMove] = useState<null | 'entrada' | 'salida' | 'transferencia'>(null)
  const { data, loading, error, reload } = useQuery(async () => {
    const [p, w] = await Promise.all([
      supabase.from('products').select('id, code, name, kind, brand, unit, min_stock, sale_price, location, active, stock:warehouse_stock(warehouse_id, qty)').eq('active', true).order('name').limit(2000),
      supabase.from('warehouses').select('id, name').eq('active', true).order('name'),
    ])
    if (p.error) throw p.error
    return { products: p.data as any[], warehouses: (w.data || []) as any[] }
  })
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase()
    return (data?.products || []).map((p) => ({
      ...p,
      qty: (p.stock || []).filter((x: any) => !wh || x.warehouse_id === wh).reduce((a: number, x: any) => a + Number(x.qty), 0),
    })).filter((p) => !s || [p.code, p.name, p.brand].some((x) => String(x || '').toLowerCase().includes(s)))
  }, [data, search, wh])
  const value = rows.reduce((a, p) => a + p.qty * Number(p.sale_price), 0)
  return (
    <div>
      <PageHeader title="Inventario" subtitle={`${rows.length} productos · valor a precio de venta ${fmtMoney(value)}`}
        actions={<>
          <button className="btn-secondary" onClick={() => downloadCSV('inventario', [{ key: 'code', label: 'Código' }, { key: 'name', label: 'Producto' }, { key: 'qty', label: 'Stock' }, { key: 'min_stock', label: 'Mínimo' }], rows)}>Exportar CSV</button>
          {can && <>
            <button className="btn-secondary" onClick={() => setMove('transferencia')}><ArrowLeftRight className="h-4 w-4" /> Transferir</button>
            <button className="btn-secondary" onClick={() => setMove('salida')}><PackageMinus className="h-4 w-4" /> Salida</button>
            <button className="btn-primary" onClick={() => setMove('entrada')}><PackagePlus className="h-4 w-4" /> Entrada</button>
          </>}
        </>} />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-steel-100 p-3">
          <SearchBox value={search} onChange={setSearch} placeholder="Buscar producto o código…" />
          <select className="input w-auto" value={wh} onChange={(e) => setWh(e.target.value)}><option value="">Todos los almacenes</option>{data?.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
        </div>
        {loading ? <Loading /> : error ? <p className="p-4 text-sm text-red-600">{error}</p> : rows.length === 0 ? <Empty text="No hay productos. Créalos en la sección Productos." /> : (
          <TableWrap>
            <thead><tr><th className="th">Código</th><th className="th">Producto</th><th className="th">Ubicación</th><th className="th text-right">Stock</th><th className="th text-right">Mínimo</th><th className="th">Estado</th><th className="th text-right">Precio</th></tr></thead>
            <tbody className="divide-y divide-steel-100">
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="td">{p.code || '—'}</td><td className="td font-semibold">{p.name}<div className="text-xs font-normal text-steel-500">{p.brand}</div></td>
                  <td className="td">{p.location || '—'}</td><td className="td text-right font-semibold">{fmtNum(p.qty)} <span className="text-xs font-normal text-steel-500">{p.unit}</span></td>
                  <td className="td text-right">{fmtNum(p.min_stock)}</td><td className="td">{stockBadge(p.qty, Number(p.min_stock))}</td><td className="td text-right">{fmtMoney(p.sale_price)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
      {move && <MovementModal type={move} onClose={() => setMove(null)} onSaved={reload} />}
    </div>
  )
}

/* ------------------------------ STOCK BAJO ------------------------------ */
export function LowStock() {
  const { base } = useAuth()
  const { data, loading, error } = useQuery(async () => {
    const { data, error } = await supabase.from('low_stock_products').select('*').order('total_qty')
    if (error) throw error
    return data as any[]
  })
  return (
    <div>
      <PageHeader title="Stock bajo" subtitle="Productos que llegaron a su mínimo o se agotaron" actions={<Link className="btn-primary" to={`${base}/compras`}><Plus className="h-4 w-4" /> Registrar compra</Link>} />
      <Card>
        {loading ? <Loading /> : error ? <p className="p-4 text-sm text-red-600">{error}</p> : !data?.length ? <Empty text="¡Todo en orden! No hay productos con stock bajo." /> : (
          <TableWrap>
            <thead><tr><th className="th">Código</th><th className="th">Producto</th><th className="th text-right">Stock</th><th className="th text-right">Mínimo</th><th className="th">Estado</th></tr></thead>
            <tbody className="divide-y divide-steel-100">
              {data.map((p) => <tr key={p.id}><td className="td">{p.code || '—'}</td><td className="td font-semibold">{p.name}</td><td className="td text-right font-semibold">{fmtNum(p.total_qty)} {p.unit}</td><td className="td text-right">{fmtNum(p.min_stock)}</td><td className="td">{stockBadge(Number(p.total_qty), Number(p.min_stock))}</td></tr>)}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}

/* ------------------------------ MOVIMIENTOS ------------------------------ */
const REASONS: Record<string, string[]> = {
  entrada: ['compra', 'devolucion', 'ajuste'], salida: ['venta', 'baja', 'ajuste'], transferencia: ['traslado'],
}
function MovementModal({ type, onClose, onSaved }: { type: 'entrada' | 'salida' | 'transferencia'; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const products = useOptions({ table: 'products', label: (r) => (r.code ? r.code + ' · ' : '') + r.name, order: 'name', filter: (q) => q.eq('active', true) })
  const warehouses = useOptions({ table: 'warehouses', label: 'name', order: 'name', filter: (q) => q.eq('active', true) })
  const [f, setF] = useState<any>({ product_id: '', warehouse_id: '', to_warehouse_id: '', qty: '', reason: REASONS[type][0], notes: '' })
  const [busy, setBusy] = useState(false)
  const title = type === 'entrada' ? 'Entrada de stock' : type === 'salida' ? 'Salida de stock' : 'Transferencia entre almacenes'
  const save = async () => {
    if (!f.product_id || !f.warehouse_id || !Number(f.qty)) return toast('Completa producto, almacén y cantidad', 'error')
    if (type === 'transferencia' && (!f.to_warehouse_id || f.to_warehouse_id === f.warehouse_id)) return toast('Elige un almacén de destino distinto', 'error')
    setBusy(true)
    const { error } = await supabase.from('inventory_movements').insert({
      product_id: f.product_id, warehouse_id: f.warehouse_id, to_warehouse_id: type === 'transferencia' ? f.to_warehouse_id : null,
      type, reason: f.reason, qty: Number(f.qty), notes: f.notes || null,
    })
    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
    toast('Movimiento registrado'); onSaved(); onClose()
  }
  return (
    <Modal open onClose={onClose} title={title}
      footer={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={save} disabled={busy}>Registrar</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Producto *" className="sm:col-span-2"><select className="input" value={f.product_id} onChange={(e) => setF({ ...f, product_id: e.target.value })}><option value="">Seleccionar…</option>{products.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></Field>
        <Field label={type === 'transferencia' ? 'Almacén de origen *' : 'Almacén *'}><select className="input" value={f.warehouse_id} onChange={(e) => setF({ ...f, warehouse_id: e.target.value })}><option value="">Seleccionar…</option>{warehouses.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}</select></Field>
        {type === 'transferencia' && <Field label="Almacén de destino *"><select className="input" value={f.to_warehouse_id} onChange={(e) => setF({ ...f, to_warehouse_id: e.target.value })}><option value="">Seleccionar…</option>{warehouses.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}</select></Field>}
        <Field label="Cantidad *"><input className="input" type="number" min="0" step="any" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></Field>
        {type !== 'transferencia' && <Field label="Motivo"><select className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })}>{REASONS[type].map((r) => <option key={r} value={r}>{MOVE_REASON[r]}</option>)}</select></Field>}
        <Field label="Notas" className="sm:col-span-2"><textarea className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  )
}

export function Movements({ mode }: { mode: 'entrada' | 'salida' | 'all' }) {
  const { role } = useAuth()
  const can = role === 'admin' || role === 'almacenero'
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<null | 'entrada' | 'salida' | 'transferencia'>(null)
  const { data, loading, error, reload } = useQuery(async () => {
    let q: any = supabase.from('inventory_movements')
      .select('*, product:products(code, name, unit), wh:warehouses!warehouse_id(name), to_wh:warehouses!to_warehouse_id(name), user:profiles!created_by(full_name), order:work_orders(number)')
      .order('created_at', { ascending: false }).limit(1000)
    if (mode !== 'all') q = q.eq('type', mode)
    const { data, error } = await q
    if (error) throw error
    return data as any[]
  }, [mode])
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase()
    return (data || []).filter((m) => !s || [m.product?.name, m.product?.code, m.wh?.name, m.notes].some((x) => String(x || '').toLowerCase().includes(s)))
  }, [data, search])
  const title = mode === 'entrada' ? 'Entradas de stock' : mode === 'salida' ? 'Salidas de stock' : 'Movimientos de inventario'
  const tone: Record<string, string> = { entrada: 'bg-emerald-100 text-emerald-800', salida: 'bg-red-100 text-red-700', transferencia: 'bg-sky-100 text-sky-800' }
  return (
    <div>
      <PageHeader title={title} subtitle="Cada movimiento queda registrado con fecha y usuario"
        actions={can && (mode === 'all' ? <>
          <button className="btn-secondary" onClick={() => setOpen('transferencia')}><ArrowLeftRight className="h-4 w-4" /> Transferir</button>
          <button className="btn-secondary" onClick={() => setOpen('salida')}>Salida</button>
          <button className="btn-primary" onClick={() => setOpen('entrada')}>Entrada</button>
        </> : <button className="btn-primary" onClick={() => setOpen(mode)}><Plus className="h-4 w-4" /> Registrar {mode}</button>)} />
      <Card>
        <div className="border-b border-steel-100 p-3"><SearchBox value={search} onChange={setSearch} placeholder="Buscar producto…" /></div>
        {loading ? <Loading /> : error ? <p className="p-4 text-sm text-red-600">{error}</p> : rows.length === 0 ? <Empty /> : (
          <TableWrap>
            <thead><tr><th className="th">Fecha</th><th className="th">Tipo</th><th className="th">Producto</th><th className="th">Almacén</th><th className="th text-right">Cantidad</th><th className="th">Motivo</th><th className="th">Usuario</th></tr></thead>
            <tbody className="divide-y divide-steel-100">
              {rows.map((m) => (
                <tr key={m.id}>
                  <td className="td">{fmtDateTime(m.created_at)}</td><td className="td"><Badge tone={tone[m.type]}>{m.type}</Badge></td>
                  <td className="td font-semibold">{m.product?.name}<div className="text-xs font-normal text-steel-500">{m.product?.code}</div></td>
                  <td className="td">{m.wh?.name}{m.to_wh?.name ? ` → ${m.to_wh.name}` : ''}</td>
                  <td className="td text-right font-semibold">{fmtNum(m.qty)} {m.product?.unit}</td>
                  <td className="td">{MOVE_REASON[m.reason]}{m.order?.number ? ` · OT-${String(m.order.number).padStart(5, '0')}` : ''}</td><td className="td">{m.user?.full_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
      {open && <MovementModal type={open} onClose={() => setOpen(null)} onSaved={reload} />}
    </div>
  )
}

/* ------------------------------ COMPRAS ------------------------------ */
type Line = { product_id: string; qty: string; unit_cost: string }

function NewPurchase({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const { profile } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const suppliers = useOptions({ table: 'suppliers', label: 'name' })
  const warehouses = useOptions({ table: 'warehouses', label: 'name', order: 'name', filter: (q) => q.eq('active', true) })
  const products = useOptions({ table: 'products', label: (r) => (r.code ? r.code + ' · ' : '') + r.name, order: 'name', filter: (q) => q.eq('active', true) })
  const [h, setH] = useState<any>({ supplier_id: '', warehouse_id: '', invoice_number: '', purchase_date: new Date().toISOString().slice(0, 10), notes: '' })
  const [lines, setLines] = useState<Line[]>([{ product_id: '', qty: '1', unit_cost: '' }])
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const total = lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.unit_cost) || 0), 0)
  const setLine = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, j) => j === i ? { ...l, ...p } : l))
  const pickProduct = (i: number, id: string) => {
    const row = products.find((p) => p.value === id)?.row
    setLine(i, { product_id: id, unit_cost: row?.purchase_price ? String(row.purchase_price) : lines[i].unit_cost })
  }
  const save = async () => {
    if (!h.warehouse_id) return toast('Elige el almacén donde ingresa la mercadería', 'error')
    const valid = lines.filter((l) => l.product_id && Number(l.qty) > 0)
    if (!valid.length) return toast('Agrega al menos un producto', 'error')
    setBusy(true)
    try {
      const { data: p, error } = await supabase.from('purchases').insert({
        supplier_id: h.supplier_id || null, warehouse_id: h.warehouse_id, invoice_number: h.invoice_number || null, purchase_date: h.purchase_date, notes: h.notes || null,
      }).select().single()
      if (error) throw error
      const { error: e2 } = await supabase.from('purchase_items').insert(valid.map((l) => ({ purchase_id: p.id, product_id: l.product_id, qty: Number(l.qty), unit_cost: Number(l.unit_cost) || 0 })))
      if (e2) { await supabase.from('purchases').delete().eq('id', p.id); throw e2 }
      if (files.length) await uploadFilesTo(files, { folder: 'compras', entityType: 'purchase', entityId: p.id, userId: profile?.id })
      toast('Compra registrada. El stock se actualizó automáticamente.'); onSaved(); onClose()
    } catch (e) { toast(errMsg(e), 'error') }
    setBusy(false)
  }
  return (
    <Modal open onClose={onClose} title="Registrar compra" wide
      footer={<><span className="mr-auto self-center text-sm font-semibold">Total: {fmtMoney(total)}</span><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'Guardar compra'}</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Proveedor"><select className="input" value={h.supplier_id} onChange={(e) => setH({ ...h, supplier_id: e.target.value })}><option value="">Sin proveedor</option>{suppliers.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></Field>
        <Field label="Almacén de ingreso *"><select className="input" value={h.warehouse_id} onChange={(e) => setH({ ...h, warehouse_id: e.target.value })}><option value="">Seleccionar…</option>{warehouses.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}</select></Field>
        <Field label="N° de factura / nota"><input className="input" value={h.invoice_number} onChange={(e) => setH({ ...h, invoice_number: e.target.value })} /></Field>
        <Field label="Fecha"><input className="input" type="date" value={h.purchase_date} onChange={(e) => setH({ ...h, purchase_date: e.target.value })} /></Field>
      </div>
      <h3 className="mb-2 mt-5 text-lg font-semibold">Productos comprados</h3>
      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-12 items-end gap-2">
            <select className="input col-span-12 sm:col-span-6" value={l.product_id} onChange={(e) => pickProduct(i, e.target.value)}><option value="">Producto…</option>{products.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select>
            <input className="input col-span-5 sm:col-span-2" type="number" min="0" step="any" placeholder="Cant." value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} />
            <input className="input col-span-5 sm:col-span-3" type="number" min="0" step="any" placeholder="Costo unit." value={l.unit_cost} onChange={(e) => setLine(i, { unit_cost: e.target.value })} />
            <button className="btn-ghost btn-sm col-span-2 sm:col-span-1 text-red-600" onClick={() => setLines((ls) => ls.length > 1 ? ls.filter((_, j) => j !== i) : ls)} aria-label="Quitar"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <button className="btn-secondary btn-sm mt-2" onClick={() => setLines((ls) => [...ls, { product_id: '', qty: '1', unit_cost: '' }])}><Plus className="h-4 w-4" /> Agregar producto</button>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Notas"><textarea className="input" value={h.notes} onChange={(e) => setH({ ...h, notes: e.target.value })} /></Field>
        <Field label="Factura o comprobante (foto / PDF)">
          <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
          <button type="button" className="btn-secondary w-full" onClick={() => fileRef.current?.click()}><Paperclip className="h-4 w-4" /> {files.length ? `${files.length} archivo(s)` : 'Adjuntar'}</button>
        </Field>
      </div>
    </Modal>
  )
}

export function Purchases() {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<any | null>(null)
  const [search, setSearch] = useState('')
  const { data, loading, error, reload } = useQuery(async () => {
    const { data, error } = await supabase.from('purchases').select('*, supplier:suppliers(name), wh:warehouses(name)').order('purchase_date', { ascending: false }).order('number', { ascending: false }).limit(1000)
    if (error) throw error
    return data as any[]
  })
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase()
    return (data || []).filter((p) => !s || [p.supplier?.name, p.invoice_number, String(p.number)].some((x) => String(x || '').toLowerCase().includes(s)))
  }, [data, search])
  return (
    <div>
      <PageHeader title="Compras" subtitle="Al guardar una compra el stock sube automáticamente"
        actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Registrar compra</button>} />
      <Card>
        <div className="border-b border-steel-100 p-3"><SearchBox value={search} onChange={setSearch} placeholder="Buscar proveedor o factura…" /></div>
        {loading ? <Loading /> : error ? <p className="p-4 text-sm text-red-600">{error}</p> : rows.length === 0 ? <Empty /> : (
          <TableWrap>
            <thead><tr><th className="th">N°</th><th className="th">Fecha</th><th className="th">Proveedor</th><th className="th">Almacén</th><th className="th">Factura</th><th className="th text-right">Total</th></tr></thead>
            <tbody className="divide-y divide-steel-100">
              {rows.map((p) => <tr key={p.id} className="cursor-pointer hover:bg-steel-50" onClick={() => setView(p)}>
                <td className="td font-semibold">C-{String(p.number).padStart(4, '0')}</td><td className="td">{fmtDate(p.purchase_date)}</td><td className="td">{p.supplier?.name || '—'}</td>
                <td className="td">{p.wh?.name}</td><td className="td">{p.invoice_number || '—'}</td><td className="td text-right font-semibold">{fmtMoney(p.total)}</td>
              </tr>)}
            </tbody>
          </TableWrap>
        )}
      </Card>
      {open && <NewPurchase onClose={() => setOpen(false)} onSaved={reload} />}
      {view && <PurchaseView p={view} onClose={() => setView(null)} />}
    </div>
  )
}

function PurchaseView({ p, onClose }: { p: any; onClose: () => void }) {
  const { data, loading } = useQuery(async () => {
    const { data } = await supabase.from('purchase_items').select('*, product:products(code, name, unit)').eq('purchase_id', p.id)
    return (data || []) as any[]
  })
  return (
    <Modal open onClose={onClose} wide title={`Compra C-${String(p.number).padStart(4, '0')} · ${fmtDate(p.purchase_date)}`}>
      <p className="mb-3 text-sm text-steel-600">{p.supplier?.name || 'Sin proveedor'} · Almacén {p.wh?.name}{p.invoice_number ? ` · Factura ${p.invoice_number}` : ''}</p>
      {loading ? <Loading /> : (
        <TableWrap>
          <thead><tr><th className="th">Producto</th><th className="th text-right">Cantidad</th><th className="th text-right">Costo</th><th className="th text-right">Subtotal</th></tr></thead>
          <tbody className="divide-y divide-steel-100">
            {(data || []).map((i) => <tr key={i.id}><td className="td">{i.product?.name}</td><td className="td text-right">{fmtNum(i.qty)} {i.product?.unit}</td><td className="td text-right">{fmtMoney(i.unit_cost)}</td><td className="td text-right font-semibold">{fmtMoney(i.qty * i.unit_cost)}</td></tr>)}
          </tbody>
        </TableWrap>
      )}
      <p className="mt-3 text-right font-display text-2xl font-semibold">{fmtMoney(p.total)}</p>
      {p.notes && <p className="mt-2 text-sm text-steel-600">{p.notes}</p>}
      <div className="mt-4"><FileManager folder="compras" entityType="purchase" entityId={p.id} label="Comprobantes" /></div>
    </Modal>
  )
}
