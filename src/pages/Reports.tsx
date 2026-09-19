import { useState } from 'react'
import { Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast, Card, Empty, Loading, PageHeader, Stat, TableWrap } from '../components/ui'
import { EMERGENCY_STATUS, EMERGENCY_TYPE, PAY_METHOD, PRODUCT_KIND, URGENCY } from '../lib/constants'
import { downloadCSV, emergNo, errMsg, fetchAll, fmtDate, fmtMoney, fmtNum, orderNo } from '../lib/util'

type Fmt = 'text' | 'money' | 'num' | 'date'
type Col = { key: string; label: string; fmt?: Fmt }
type Result = { cols: Col[]; rows: any[]; summary?: { label: string; value: string }[] }
type Def = { id: string; label: string; dates: boolean; run: (from: string, to: string) => Promise<Result> }

const nextDay = (d: string) => new Date(new Date(d + 'T00:00:00').getTime() + 86400000).toISOString().slice(0, 10)
const sum = (rows: any[], k: string) => rows.reduce((a, r) => a + Number(r[k] || 0), 0)

async function ordersInRange(from: string, to: string) {
  const orders = await fetchAll((a, b) => supabase.from('work_orders')
    .select('id, number, status, customer_id, vehicle_id, mechanic_id, opened_at, customer:customers(full_name), vehicle:vehicles(brand, model, plate), mech:profiles!mechanic_id(full_name)')
    .gte('opened_at', from).lt('opened_at', nextDay(to)).neq('status', 'cancelada').order('opened_at').range(a, b))
  const bal = await fetchAll((a, b) => supabase.from('order_balances').select('order_id, total, paid').range(a, b))
  const m = new Map(bal.map((x: any) => [x.order_id, x]))
  return orders.map((o: any) => ({ ...o, total: Number(m.get(o.id)?.total || 0), paid: Number(m.get(o.id)?.paid || 0) }))
}

function group(rows: any[], keyOf: (r: any) => string, init: (r: any) => any, add: (acc: any, r: any) => void) {
  const m = new Map<string, any>()
  rows.forEach((r) => { const k = keyOf(r); if (!m.has(k)) m.set(k, init(r)); add(m.get(k), r) })
  return [...m.values()]
}

const itemsReport = (kinds: string[]) => async (from: string, to: string): Promise<Result> => {
  const items = await fetchAll((a, b) => supabase.from('work_order_items')
    .select('kind, description, qty, unit_price, order:work_orders!inner(opened_at, status)')
    .in('kind', kinds).gte('order.opened_at', from).lt('order.opened_at', nextDay(to)).neq('order.status', 'cancelada').range(a, b))
  const rows = group(items, (i) => i.description.trim().toLowerCase(), (i) => ({ descripcion: i.description, veces: 0, cantidad: 0, total: 0 }),
    (g, i) => { g.veces++; g.cantidad += Number(i.qty); g.total += Number(i.qty) * Number(i.unit_price) }).sort((a, b) => b.total - a.total)
  return {
    cols: [{ key: 'descripcion', label: 'Descripción' }, { key: 'veces', label: 'Veces', fmt: 'num' }, { key: 'cantidad', label: 'Cantidad', fmt: 'num' }, { key: 'total', label: 'Total', fmt: 'money' }],
    rows, summary: [{ label: 'Total', value: fmtMoney(sum(rows, 'total')) }, { label: 'Conceptos distintos', value: String(rows.length) }],
  }
}

const REPORTS: Def[] = [
  { id: 'ingresos', label: 'Ingresos (pagos cobrados)', dates: true, run: async (from, to) => {
    const p = await fetchAll((a, b) => supabase.from('payments').select('amount, method, paid_at, customer:customers(full_name), order:work_orders(number)')
      .eq('status', 'pagado').gte('paid_at', from).lt('paid_at', nextDay(to)).order('paid_at').range(a, b))
    const rows = p.map((x: any) => ({ fecha: x.paid_at, orden: orderNo(x.order?.number), cliente: x.customer?.full_name, metodo: PAY_METHOD[x.method], monto: Number(x.amount) }))
    const byM = group(rows, (r) => r.metodo, (r) => ({ m: r.metodo, t: 0 }), (g, r) => { g.t += r.monto })
    return { cols: [{ key: 'fecha', label: 'Fecha', fmt: 'date' }, { key: 'orden', label: 'Orden' }, { key: 'cliente', label: 'Cliente' }, { key: 'metodo', label: 'Método' }, { key: 'monto', label: 'Monto', fmt: 'money' }],
      rows, summary: [{ label: 'Total cobrado', value: fmtMoney(sum(rows, 'monto')) }, ...byM.map((g) => ({ label: g.m, value: fmtMoney(g.t) }))] }
  } },
  { id: 'saldos', label: 'Saldos por cobrar', dates: true, run: async (from, to) => {
    const o = await ordersInRange(from, to)
    const rows = o.filter((x: any) => x.total - x.paid > 0.009).map((x: any) => ({ orden: orderNo(x.number), fecha: x.opened_at, cliente: x.customer?.full_name, estado: x.status, total: x.total, pagado: x.paid, saldo: x.total - x.paid })).sort((a: any, b: any) => b.saldo - a.saldo)
    return { cols: [{ key: 'orden', label: 'Orden' }, { key: 'fecha', label: 'Fecha', fmt: 'date' }, { key: 'cliente', label: 'Cliente' }, { key: 'estado', label: 'Estado' }, { key: 'total', label: 'Total', fmt: 'money' }, { key: 'pagado', label: 'Pagado', fmt: 'money' }, { key: 'saldo', label: 'Saldo', fmt: 'money' }],
      rows, summary: [{ label: 'Saldo total por cobrar', value: fmtMoney(sum(rows, 'saldo')) }, { label: 'Órdenes con saldo', value: String(rows.length) }] }
  } },
  { id: 'servicios', label: 'Servicios realizados', dates: true, run: itemsReport(['servicio', 'mano_obra']) },
  { id: 'repuestos', label: 'Repuestos y materiales usados', dates: true, run: itemsReport(['repuesto', 'lubricante', 'material']) },
  { id: 'mecanicos', label: 'Trabajos por mecánico', dates: true, run: async (from, to) => {
    const o = await ordersInRange(from, to)
    const rows = group(o.filter((x: any) => x.mechanic_id), (x) => x.mechanic_id, (x) => ({ mecanico: x.mech?.full_name || '—', asignadas: 0, terminadas: 0, facturado: 0 }),
      (g, x) => { g.asignadas++; if (['terminada', 'entregada'].includes(x.status)) g.terminadas++; g.facturado += x.total }).sort((a, b) => b.terminadas - a.terminadas)
    return { cols: [{ key: 'mecanico', label: 'Mecánico' }, { key: 'asignadas', label: 'Órdenes asignadas', fmt: 'num' }, { key: 'terminadas', label: 'Terminadas', fmt: 'num' }, { key: 'facturado', label: 'Monto de sus órdenes', fmt: 'money' }], rows }
  } },
  { id: 'clientes', label: 'Clientes (frecuencia y monto)', dates: true, run: async (from, to) => {
    const o = await ordersInRange(from, to)
    const rows = group(o, (x) => x.customer_id, (x) => ({ cliente: x.customer?.full_name, ordenes: 0, facturado: 0, pagado: 0, ultima: '' }),
      (g, x) => { g.ordenes++; g.facturado += x.total; g.pagado += x.paid; if (x.opened_at > g.ultima) g.ultima = x.opened_at }).sort((a, b) => b.facturado - a.facturado)
    return { cols: [{ key: 'cliente', label: 'Cliente' }, { key: 'ordenes', label: 'Órdenes', fmt: 'num' }, { key: 'facturado', label: 'Facturado', fmt: 'money' }, { key: 'pagado', label: 'Pagado', fmt: 'money' }, { key: 'ultima', label: 'Última visita', fmt: 'date' }], rows }
  } },
  { id: 'vehiculos', label: 'Vehículos atendidos', dates: true, run: async (from, to) => {
    const o = await ordersInRange(from, to)
    const rows = group(o, (x) => x.vehicle_id, (x) => ({ placa: x.vehicle?.plate, vehiculo: `${x.vehicle?.brand || ''} ${x.vehicle?.model || ''}`, cliente: x.customer?.full_name, ordenes: 0, facturado: 0 }),
      (g, x) => { g.ordenes++; g.facturado += x.total }).sort((a, b) => b.ordenes - a.ordenes)
    return { cols: [{ key: 'placa', label: 'Placa' }, { key: 'vehiculo', label: 'Vehículo' }, { key: 'cliente', label: 'Propietario' }, { key: 'ordenes', label: 'Órdenes', fmt: 'num' }, { key: 'facturado', label: 'Facturado', fmt: 'money' }], rows }
  } },
  { id: 'emergencias', label: 'Emergencias 24/7', dates: true, run: async (from, to) => {
    const e = await fetchAll((a, b) => supabase.from('emergency_requests').select('number, created_at, type, urgency, status, customer:customers(full_name), mech:profiles!assigned_to(full_name)')
      .gte('created_at', from).lt('created_at', nextDay(to)).order('created_at', { ascending: false }).range(a, b))
    const rows = e.map((x: any) => ({ numero: emergNo(x.number), fecha: x.created_at, cliente: x.customer?.full_name, tipo: EMERGENCY_TYPE[x.type], urgencia: URGENCY[x.urgency], estado: EMERGENCY_STATUS[x.status], mecanico: x.mech?.full_name || '—' }))
    return { cols: [{ key: 'numero', label: 'N°' }, { key: 'fecha', label: 'Fecha', fmt: 'date' }, { key: 'cliente', label: 'Cliente' }, { key: 'tipo', label: 'Problema' }, { key: 'urgencia', label: 'Urgencia' }, { key: 'estado', label: 'Estado' }, { key: 'mecanico', label: 'Mecánico' }],
      rows, summary: [{ label: 'Solicitudes', value: String(rows.length) }, { label: 'Finalizadas', value: String(rows.filter((r: any) => r.estado === EMERGENCY_STATUS.finalizado).length) }] }
  } },
  { id: 'compras', label: 'Compras a proveedores', dates: true, run: async (from, to) => {
    const p = await fetchAll((a, b) => supabase.from('purchases').select('number, purchase_date, invoice_number, total, supplier:suppliers(name), wh:warehouses(name)').gte('purchase_date', from).lte('purchase_date', to).order('purchase_date').range(a, b))
    const rows = p.map((x: any) => ({ numero: 'C-' + String(x.number).padStart(4, '0'), fecha: x.purchase_date, proveedor: x.supplier?.name || '—', almacen: x.wh?.name, factura: x.invoice_number, total: Number(x.total) }))
    return { cols: [{ key: 'numero', label: 'N°' }, { key: 'fecha', label: 'Fecha', fmt: 'date' }, { key: 'proveedor', label: 'Proveedor' }, { key: 'almacen', label: 'Almacén' }, { key: 'factura', label: 'Factura' }, { key: 'total', label: 'Total', fmt: 'money' }],
      rows, summary: [{ label: 'Total comprado', value: fmtMoney(sum(rows, 'total')) }] }
  } },
  { id: 'inventario', label: 'Inventario valorizado', dates: false, run: async () => {
    const p = await fetchAll((a, b) => supabase.from('product_stock').select('code, name, kind, total_qty, min_stock, purchase_price, sale_price').eq('active', true).order('name').range(a, b))
    const rows = p.map((x: any) => ({ codigo: x.code, producto: x.name, tipo: PRODUCT_KIND[x.kind], stock: Number(x.total_qty), minimo: Number(x.min_stock), valor_costo: Number(x.total_qty) * Number(x.purchase_price), valor_venta: Number(x.total_qty) * Number(x.sale_price) }))
    return { cols: [{ key: 'codigo', label: 'Código' }, { key: 'producto', label: 'Producto' }, { key: 'tipo', label: 'Tipo' }, { key: 'stock', label: 'Stock', fmt: 'num' }, { key: 'minimo', label: 'Mínimo', fmt: 'num' }, { key: 'valor_costo', label: 'Valor a costo', fmt: 'money' }, { key: 'valor_venta', label: 'Valor a venta', fmt: 'money' }],
      rows, summary: [{ label: 'Valor a costo', value: fmtMoney(sum(rows, 'valor_costo')) }, { label: 'Valor a precio de venta', value: fmtMoney(sum(rows, 'valor_venta')) }] }
  } },
  { id: 'stockbajo', label: 'Productos con stock bajo', dates: false, run: async () => {
    const p = await fetchAll((a, b) => supabase.from('low_stock_products').select('code, name, total_qty, min_stock').order('total_qty').range(a, b))
    return { cols: [{ key: 'codigo', label: 'Código' }, { key: 'producto', label: 'Producto' }, { key: 'stock', label: 'Stock', fmt: 'num' }, { key: 'minimo', label: 'Mínimo', fmt: 'num' }],
      rows: p.map((x: any) => ({ codigo: x.code, producto: x.name, stock: Number(x.total_qty), minimo: Number(x.min_stock) })) }
  } },
  { id: 'mantenimientos', label: 'Mantenimientos programados', dates: true, run: async (from, to) => {
    const m = await fetchAll((a, b) => supabase.from('maintenance_schedules').select('service_name, next_date, next_km, done, vehicle:vehicles(plate, brand, model), customer:customers(full_name, phone)').gte('next_date', from).lte('next_date', to).order('next_date').range(a, b))
    return { cols: [{ key: 'fecha', label: 'Próxima fecha', fmt: 'date' }, { key: 'servicio', label: 'Servicio' }, { key: 'vehiculo', label: 'Vehículo' }, { key: 'cliente', label: 'Cliente' }, { key: 'telefono', label: 'Teléfono' }, { key: 'estado', label: 'Estado' }],
      rows: m.map((x: any) => ({ fecha: x.next_date, servicio: x.service_name, vehiculo: `${x.vehicle?.brand || ''} ${x.vehicle?.model || ''} ${x.vehicle?.plate || ''}`, cliente: x.customer?.full_name, telefono: x.customer?.phone, estado: x.done ? 'Realizado' : 'Pendiente' })) }
  } },
]

const show = (v: any, f?: Fmt) => f === 'money' ? fmtMoney(v) : f === 'num' ? fmtNum(v) : f === 'date' ? fmtDate(v) : (v ?? '—')

export default function Reports() {
  const toast = useToast()
  const first = new Date(); first.setDate(1)
  const [id, setId] = useState(REPORTS[0].id)
  const [from, setFrom] = useState(first.toISOString().slice(0, 10))
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [res, setRes] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const def = REPORTS.find((r) => r.id === id)!

  const run = async () => {
    setBusy(true)
    try { setRes(await def.run(from, to)) } catch (e) { toast(errMsg(e), 'error'); setRes(null) }
    setBusy(false)
  }
  return (
    <div>
      <PageHeader title="Reportes" subtitle="Elige un reporte, define las fechas y descárgalo en Excel (CSV)" />
      <Card className="mb-4"><div className="flex flex-wrap items-end gap-3 p-4">
        <label className="block min-w-[220px] flex-1"><span className="mb-1 block text-xs font-semibold text-steel-600">Reporte</span>
          <select className="input" value={id} onChange={(e) => { setId(e.target.value); setRes(null) }}>{REPORTS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
        {def.dates && <>
          <label className="block"><span className="mb-1 block text-xs font-semibold text-steel-600">Desde</span><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold text-steel-600">Hasta</span><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </>}
        <button className="btn-primary" onClick={run} disabled={busy}>{busy ? 'Generando…' : 'Generar reporte'}</button>
        {res && res.rows.length > 0 && <button className="btn-secondary" onClick={() => downloadCSV(def.id, res.cols, res.rows)}><Download className="h-4 w-4" /> Descargar CSV</button>}
      </div></Card>
      {busy ? <Loading /> : !res ? <Card><Empty text="Pulsa “Generar reporte” para ver los resultados." /></Card> : (
        <>
          {res.summary && <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">{res.summary.map((s) => <Stat key={s.label} label={s.label} value={s.value} />)}</div>}
          <Card>
            {res.rows.length === 0 ? <Empty text="No hay datos en ese período." /> : (
              <TableWrap>
                <thead><tr>{res.cols.map((c) => <th key={c.key} className={`th ${c.fmt === 'money' || c.fmt === 'num' ? 'text-right' : ''}`}>{c.label}</th>)}</tr></thead>
                <tbody className="divide-y divide-steel-100">
                  {res.rows.map((r, i) => <tr key={i}>{res.cols.map((c) => <td key={c.key} className={`td ${c.fmt === 'money' || c.fmt === 'num' ? 'text-right' : ''}`}>{show(r[c.key], c.fmt)}</td>)}</tr>)}
                </tbody>
              </TableWrap>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
