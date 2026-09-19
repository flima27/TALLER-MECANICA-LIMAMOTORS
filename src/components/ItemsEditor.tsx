import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useOptions } from '../lib/hooks'
import { ITEM_KIND } from '../lib/constants'
import { fmtMoney, fmtNum } from '../lib/util'
import { Empty, Field, Spinner, TableWrap, useToast, confirmAsk } from './ui'

export type Item = {
  id: string; kind: string; description: string; qty: number; unit_price: number
  product_id?: string | null; warehouse_id?: string | null; service_id?: string | null
}

const PRODUCT_KINDS: Record<string, string[]> = {
  repuesto: ['repuesto', 'filtro', 'accesorio'],
  lubricante: ['lubricante', 'aceite'],
  material: ['material'],
}

export function itemsTotal(items: { qty: number; unit_price: number }[], discount = 0) {
  const sub = items.reduce((a, i) => a + Number(i.qty) * Number(i.unit_price), 0)
  return { sub, total: Math.max(sub - Number(discount || 0), 0) }
}

export default function ItemsEditor(p: {
  items: Item[]
  onAdd: (it: any) => Promise<void>
  onRemove: (it: Item) => Promise<void>
  readOnly?: boolean
  kinds?: string[]              // tipos que se pueden agregar
  showOnly?: string[]           // tipos que se muestran
  useWarehouse?: boolean        // descuenta stock (órdenes)
  discount?: number
  onDiscount?: (v: number) => Promise<void>
  hidePrices?: boolean
}) {
  const toast = useToast()
  const kinds = p.kinds || Object.keys(ITEM_KIND)
  const [kind, setKind] = useState(kinds[0])
  const [desc, setDesc] = useState('')
  const [qty, setQty] = useState('1')
  const [price, setPrice] = useState('0')
  const [serviceId, setServiceId] = useState('')
  const [productId, setProductId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [filter, setFilter] = useState('')
  const [stock, setStock] = useState<any[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [disc, setDisc] = useState(String(p.discount ?? 0))

  const services = useOptions(kind === 'servicio' ? { table: 'services', label: (r) => r.name, order: 'name', filter: (q) => q.eq('active', true), select: '*' } : null)
  const products = useOptions(PRODUCT_KINDS[kind] ? { table: 'products', label: (r) => `${r.name}${r.brand ? ' · ' + r.brand : ''}`, order: 'name', filter: (q) => q.eq('active', true), select: '*' } : null)

  const shownProducts = useMemo(() => {
    const kk = PRODUCT_KINDS[kind] || []
    const f = filter.trim().toLowerCase()
    return products.filter((o) => kk.includes(o.row.kind) && (!f || o.label.toLowerCase().includes(f) || (o.row.code || '').toLowerCase().includes(f) || (o.row.part_number || '').toLowerCase().includes(f)))
  }, [products, kind, filter])

  useEffect(() => { setDisc(String(p.discount ?? 0)) }, [p.discount])

  useEffect(() => {
    setDesc(kind === 'mano_obra' ? 'Mano de obra' : ''); setQty('1'); setPrice('0')
    setServiceId(''); setProductId(''); setWarehouseId(''); setFilter(''); setStock(null)
  }, [kind])

  useEffect(() => {
    if (!p.useWarehouse || !productId) { setStock(null); return }
    let alive = true
    supabase.from('warehouse_stock').select('warehouse_id, qty, warehouse:warehouses(name)').eq('product_id', productId).gt('qty', 0)
      .then(({ data }) => { if (alive) { setStock(data || []); if (data && data.length === 1) setWarehouseId(data[0].warehouse_id) } })
    return () => { alive = false }
  }, [productId, p.useWarehouse])

  const pickService = (id: string) => {
    setServiceId(id)
    const o = services.find((s) => s.value === id)
    if (o) { setDesc(o.row.name); setPrice(String(o.row.base_price ?? 0)) }
  }
  const pickProduct = (id: string) => {
    setProductId(id); setWarehouseId('')
    const o = products.find((s) => s.value === id)
    if (o) { setDesc(o.row.name); setPrice(String(o.row.sale_price ?? 0)) }
  }

  const add = async () => {
    if (!desc.trim()) return toast('Escribe una descripción', 'error')
    if (!(Number(qty) > 0)) return toast('La cantidad debe ser mayor a 0', 'error')
    if (PRODUCT_KINDS[kind] && p.useWarehouse && !productId) return toast('Elige el producto del inventario', 'error')
    if (productId && p.useWarehouse && !warehouseId) return toast('Elige de qué almacén sale', 'error')
    setBusy(true)
    try {
      await p.onAdd({
        kind, description: desc.trim(), qty: Number(qty), unit_price: Number(price) || 0,
        service_id: serviceId || null, product_id: productId || null, warehouse_id: p.useWarehouse ? warehouseId || null : null,
      })
      setDesc(kind === 'mano_obra' ? 'Mano de obra' : ''); setQty('1'); setPrice('0'); setServiceId(''); setProductId(''); setWarehouseId(''); setFilter('')
    } catch (e: any) { toast(e.message || 'No se pudo agregar', 'error') }
    setBusy(false)
  }

  const shown = p.items.filter((i) => !p.showOnly || p.showOnly.includes(i.kind))
  const { sub, total } = itemsTotal(shown, p.showOnly ? 0 : p.discount)

  return (
    <div>
      {!p.readOnly && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50/60 p-3">
          <div className="grid gap-2 sm:grid-cols-6">
            {kinds.length > 1 && (
              <Field label="Tipo" className="sm:col-span-2">
                <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
                  {kinds.map((k) => <option key={k} value={k}>{ITEM_KIND[k]}</option>)}
                </select>
              </Field>
            )}
            {kind === 'servicio' && (
              <Field label="Servicio del catálogo" className="sm:col-span-4">
                <select className="input" value={serviceId} onChange={(e) => pickService(e.target.value)}>
                  <option value="">Elegir servicio…</option>
                  {services.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Field>
            )}
            {PRODUCT_KINDS[kind] && (
              <>
                <Field label="Buscar producto" className="sm:col-span-2"><input className="input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Nombre, código o parte…" /></Field>
                <Field label="Producto" className="sm:col-span-2">
                  <select className="input" value={productId} onChange={(e) => pickProduct(e.target.value)}>
                    <option value="">Elegir producto…</option>
                    {shownProducts.slice(0, 200).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </Field>
              </>
            )}
            {p.useWarehouse && PRODUCT_KINDS[kind] && productId && (
              <Field label="Sale del almacén" className="sm:col-span-3">
                {stock === null ? <Spinner /> : stock.length === 0 ? <p className="py-2 text-sm text-red-600">Sin stock disponible</p> : (
                  <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                    <option value="">Elegir almacén…</option>
                    {stock.map((s) => <option key={s.warehouse_id} value={s.warehouse_id}>{s.warehouse?.name} (stock: {fmtNum(s.qty)})</option>)}
                  </select>
                )}
              </Field>
            )}
            <Field label="Descripción" className="sm:col-span-3"><input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
            <Field label={kind === 'mano_obra' ? 'Horas' : 'Cantidad'} className="sm:col-span-1"><input className="input" type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
            {!p.hidePrices && <Field label={kind === 'mano_obra' ? 'Precio por hora' : 'Precio unit.'} className="sm:col-span-1"><input className="input" type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>}
            <div className="flex items-end sm:col-span-1">
              <button className="btn-primary w-full" onClick={add} disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />} Agregar</button>
            </div>
          </div>
        </div>
      )}

      {shown.length === 0 ? <Empty text="Todavía no hay ítems." /> : (
        <TableWrap>
          <thead><tr>
            <th className="th">Tipo</th><th className="th">Descripción</th><th className="th text-right">Cant.</th>
            {!p.hidePrices && <><th className="th text-right">P. unit.</th><th className="th text-right">Subtotal</th></>}<th className="th w-1" />
          </tr></thead>
          <tbody className="divide-y divide-steel-100">
            {shown.map((i) => (
              <tr key={i.id}>
                <td className="td text-steel-500">{ITEM_KIND[i.kind]}</td>
                <td className="td font-medium">{i.description}</td>
                <td className="td text-right">{fmtNum(i.qty)}</td>
                {!p.hidePrices && <><td className="td text-right">{fmtMoney(i.unit_price)}</td><td className="td text-right font-semibold">{fmtMoney(i.qty * i.unit_price)}</td></>}
                <td className="td">
                  {!p.readOnly && (
                    <button className="btn-ghost btn-sm text-red-600" aria-label="Quitar"
                      onClick={async () => { if (confirmAsk('¿Quitar este ítem?')) { try { await p.onRemove(i) } catch (e: any) { toast(e.message, 'error') } } }}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      {!p.hidePrices && !p.showOnly && (
        <div className="mt-3 ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-steel-500">Subtotal</span><span>{fmtMoney(sub)}</span></div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-steel-500">Descuento</span>
            {p.readOnly || !p.onDiscount ? <span>{fmtMoney(p.discount)}</span> : (
              <span className="flex items-center gap-1">
                <input className="input w-28 py-1 text-right" type="number" min="0" step="any" value={disc} onChange={(e) => setDisc(e.target.value)}
                  onBlur={() => Number(disc) !== Number(p.discount ?? 0) && p.onDiscount!(Number(disc) || 0)} />
              </span>
            )}
          </div>
          <div className="flex justify-between border-t border-steel-200 pt-1 text-base font-bold"><span>Total</span><span>{fmtMoney(total)}</span></div>
        </div>
      )}
    </div>
  )
}
