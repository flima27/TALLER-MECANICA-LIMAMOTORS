import { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Siren, ClipboardList, Car, FileText, CreditCard, CalendarClock, Tag, ArrowRight, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useQuery } from '../lib/hooks'
import { EMERGENCY_STATUS, ORDER_STATUS } from '../lib/constants'
import { fmtDate, fmtDateTime, fmtMoney, emergNo, orderNo, todayISO, quoteNo } from '../lib/util'
import { Card, Empty, Loading, PageHeader, Stat, StatusBadge } from '../components/ui'

const count = async (table: string, f?: (q: any) => any) => {
  let q: any = supabase.from(table).select('*', { count: 'exact', head: true })
  if (f) q = f(q)
  const { count } = await q
  return (count as number) || 0
}
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString()
const monthStart = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.toISOString() }

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-lg font-semibold text-steel-600">{title}</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">{children}</div>
    </section>
  )
}
const Go = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={to} className="inline-flex items-center gap-1 text-sm font-semibold text-amber-700 hover:underline">{children} <ArrowRight className="h-3.5 w-3.5" /></Link>
)

/* ------------------------------ ADMINISTRADOR ------------------------------ */
export function AdminDashboard() {
  const { base } = useAuth()
  const { data: d, loading } = useQuery(async () => {
    const em = Object.keys(EMERGENCY_STATUS).filter((s) => s !== 'cancelado')
    const os = ['abierta', 'diagnostico', 'cotizacion', 'aprobada', 'en_proceso', 'pausada', 'terminada']
    const [emC, osC, quotesSent, customers, newCustomers, vehicles, products, outOfStock, low, bal, payMonth, pays, orders90, byMech, maint] = await Promise.all([
      Promise.all(em.map((s) => count('emergency_requests', (q) => q.eq('status', s)))),
      Promise.all(os.map((s) => count('work_orders', (q) => q.eq('status', s)))),
      count('quotations', (q) => q.eq('status', 'enviada')),
      count('customers'),
      count('customers', (q) => q.gte('created_at', daysAgo(30))),
      count('vehicles'),
      count('products', (q) => q.eq('active', true)),
      supabase.from('product_stock').select('id', { count: 'exact', head: true }).eq('active', true).lte('total_qty', 0).then((r) => r.count || 0),
      count('low_stock_products'),
      supabase.from('order_balances').select('total, paid, status').neq('status', 'cancelada').limit(5000).then((r) => r.data || []),
      supabase.from('payments').select('amount').eq('status', 'pagado').gte('paid_at', monthStart()).limit(5000).then((r) => r.data || []),
      count('payments', (q) => q.gte('paid_at', monthStart())),
      supabase.from('work_orders').select('customer_id, vehicle_id').gte('opened_at', daysAgo(90)).limit(5000).then((r) => r.data || []),
      supabase.from('work_orders').select('mechanic_id, status, mechanic:profiles!mechanic_id(full_name)').in('status', ['aprobada', 'en_proceso', 'pausada', 'diagnostico']).not('mechanic_id', 'is', null).limit(2000).then((r) => r.data || []),
      supabase.from('maintenance_schedules').select('id, service_name, next_date, vehicle:vehicles(plate, brand, model)').eq('done', false).not('next_date', 'is', null).order('next_date').limit(6).then((r) => r.data || []),
    ])
    const pending = (bal as any[]).reduce((a, b) => a + Math.max(Number(b.total) - Number(b.paid), 0), 0)
    const income = (payMonth as any[]).reduce((a, b) => a + Number(b.amount), 0)
    const mech = new Map<string, { name: string; n: number }>()
    ;(byMech as any[]).forEach((o) => { const m = mech.get(o.mechanic_id) || { name: o.mechanic?.full_name || '—', n: 0 }; m.n++; mech.set(o.mechanic_id, m) })
    return {
      emC, osC, quotesSent, customers, newCustomers, vehicles, products, outOfStock, low, pending, income, pays,
      activeCustomers: new Set((orders90 as any[]).map((o) => o.customer_id)).size,
      attended: new Set((orders90 as any[]).map((o) => o.vehicle_id)).size,
      mech: [...mech.values()].sort((a, b) => b.n - a.n), maint: maint as any[],
    }
  }, [])
  if (loading || !d) return <Loading />
  return (
    <div>
      <PageHeader title="Panel general" subtitle="Vista completa del negocio" />
      <Section title="Emergencias 24/7">
        <Stat label="Pendientes" value={d.emC[0]} tone={d.emC[0] ? 'text-red-600' : 'text-ink'} />
        <Stat label="Asignadas" value={d.emC[1]} /><Stat label="En camino" value={d.emC[2]} />
        <Stat label="En atención" value={d.emC[3]} /><Stat label="Finalizadas" value={d.emC[4]} />
      </Section>
      <Section title="Taller">
        <Stat label="Órdenes abiertas" value={d.osC[0]} /><Stat label="En diagnóstico" value={d.osC[1]} />
        <Stat label="Cotizaciones por responder" value={d.quotesSent} hint="enviadas al cliente" />
        <Stat label="Trabajos en proceso" value={d.osC[4]} tone="text-amber-600" /><Stat label="Trabajos terminados" value={d.osC[6]} hint="por entregar" />
      </Section>
      <Section title="Clientes y vehículos">
        <Stat label="Clientes" value={d.customers} /><Stat label="Clientes nuevos (30 días)" value={d.newCustomers} />
        <Stat label="Clientes activos (90 días)" value={d.activeCustomers} /><Stat label="Vehículos" value={d.vehicles} />
        <Stat label="Vehículos atendidos (90 días)" value={d.attended} />
      </Section>
      <Section title="Inventario">
        <Stat label="Productos" value={d.products} />
        <Stat label="Stock bajo" value={d.low} tone={d.low ? 'text-orange-600' : 'text-ink'} />
        <Stat label="Sin stock" value={d.outOfStock} tone={d.outOfStock ? 'text-red-600' : 'text-ink'} />
      </Section>
      <Section title="Finanzas (mes actual)">
        <Stat label="Ingresos del mes" value={fmtMoney(d.income)} tone="text-emerald-700" /><Stat label="Pagos registrados" value={d.pays} />
        <Stat label="Saldo pendiente de cobro" value={fmtMoney(d.pending)} tone={d.pending ? 'text-red-600' : 'text-ink'} />
      </Section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Trabajos activos por mecánico">
          {d.mech.length === 0 ? <Empty text="Sin trabajos asignados." /> : (
            <ul className="divide-y divide-steel-100">{d.mech.map((m) => (
              <li key={m.name} className="flex items-center justify-between px-4 py-2.5 text-sm"><span className="font-medium">{m.name}</span><span className="font-display text-xl font-semibold">{m.n}</span></li>
            ))}</ul>
          )}
        </Card>
        <Card title="Agenda: próximos mantenimientos" actions={<Go to={`${base}/mantenimientos`}>Ver todos</Go>}>
          {d.maint.length === 0 ? <Empty text="No hay mantenimientos programados." /> : (
            <ul className="divide-y divide-steel-100">{d.maint.map((m: any) => (
              <li key={m.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span><b>{m.service_name}</b> · {m.vehicle?.plate} {m.vehicle?.brand}</span>
                <span className={m.next_date < todayISO() ? 'font-semibold text-red-600' : 'text-steel-500'}>{fmtDate(m.next_date)}</span>
              </li>
            ))}</ul>
          )}
        </Card>
      </div>
    </div>
  )
}

/* -------------------------------- RECEPCIÓN -------------------------------- */
export function ReceptionDashboard() {
  const { base } = useAuth()
  const { data: d, loading } = useQuery(async () => {
    const [pend, open, quotes, done, emerg, pays] = await Promise.all([
      count('emergency_requests', (q) => q.eq('status', 'pendiente')),
      count('work_orders', (q) => q.in('status', ['abierta', 'diagnostico', 'cotizacion', 'aprobada', 'en_proceso', 'pausada'])),
      count('quotations', (q) => q.eq('status', 'enviada')),
      count('work_orders', (q) => q.eq('status', 'terminada')),
      supabase.from('emergency_requests').select('*, customer:customers(full_name)').in('status', ['pendiente', 'asignado', 'en_camino', 'en_atencion']).order('created_at', { ascending: false }).limit(6).then((r) => r.data || []),
      supabase.from('order_balances').select('order_id, number, total, paid, status').in('status', ['terminada', 'entregada', 'en_proceso']).limit(2000).then((r) => (r.data || []).filter((b: any) => Number(b.total) - Number(b.paid) > 0.009)),
    ])
    return { pend, open, quotes, done, emerg: emerg as any[], debts: pays as any[] }
  }, [])
  if (loading || !d) return <Loading />
  return (
    <div>
      <PageHeader title="Panel de recepción" subtitle="Lo que necesita atención ahora" />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Auxilios pendientes" value={d.pend} tone={d.pend ? 'text-red-600' : 'text-ink'} />
        <Stat label="Órdenes en curso" value={d.open} />
        <Stat label="Cotizaciones esperando cliente" value={d.quotes} />
        <Stat label="Trabajos listos para entregar" value={d.done} tone="text-teal-700" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Emergencias activas" actions={<Go to={`${base}/emergencias`}>Gestionar</Go>}>
          {d.emerg.length === 0 ? <Empty text="No hay emergencias activas." /> : (
            <ul className="divide-y divide-steel-100">{d.emerg.map((e: any) => (
              <li key={e.id}><Link to={`${base}/emergencias/${e.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-steel-50">
                <span><b>{emergNo(e.number)}</b> · {e.customer?.full_name} <span className="text-steel-400">· {fmtDateTime(e.created_at)}</span></span>
                <StatusBadge status={e.status} />
              </Link></li>
            ))}</ul>
          )}
        </Card>
        <Card title="Saldos por cobrar" actions={<Go to={`${base}/pagos`}>Pagos</Go>}>
          {d.debts.length === 0 ? <Empty text="No hay saldos pendientes." /> : (
            <ul className="divide-y divide-steel-100">{d.debts.slice(0, 8).map((b: any) => (
              <li key={b.order_id}><Link to={`${base}/ordenes/${b.order_id}`} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-steel-50">
                <span className="font-semibold">{orderNo(b.number)}</span><span className="font-semibold text-red-600">{fmtMoney(b.total - b.paid)}</span>
              </Link></li>
            ))}</ul>
          )}
        </Card>
      </div>
    </div>
  )
}

/* -------------------------------- MECÁNICO -------------------------------- */
export function MechanicDashboard() {
  const { base, profile } = useAuth()
  const { data: d, loading } = useQuery(async () => {
    const [orders, emerg] = await Promise.all([
      supabase.from('work_orders').select('id, number, status, reported_problem, vehicle:vehicles(brand, model, plate)').not('status', 'in', '(entregada,cancelada)').order('opened_at', { ascending: false }).limit(50).then((r) => r.data || []),
      supabase.from('emergency_requests').select('id, number, status, address, type').in('status', ['asignado', 'en_camino', 'en_atencion']).order('created_at', { ascending: false }).then((r) => r.data || []),
    ])
    return { orders: orders as any[], emerg: emerg as any[] }
  }, [])
  if (loading || !d) return <Loading />
  const by = (s: string) => d.orders.filter((o) => o.status === s).length
  return (
    <div>
      <PageHeader title={`Hola, ${profile?.full_name?.split(' ')[0] || ''}`} subtitle="Tus trabajos y auxilios asignados" />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Por diagnosticar" value={by('abierta') + by('diagnostico')} /><Stat label="Aprobados para iniciar" value={by('aprobada')} />
        <Stat label="En proceso" value={by('en_proceso')} tone="text-amber-600" /><Stat label="Auxilios activos" value={d.emerg.length} tone={d.emerg.length ? 'text-red-600' : 'text-ink'} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Mis trabajos" actions={<Go to={`${base}/trabajos`}>Ver todos</Go>}>
          {d.orders.length === 0 ? <Empty text="No tienes trabajos asignados." /> : (
            <ul className="divide-y divide-steel-100">{d.orders.slice(0, 8).map((o) => (
              <li key={o.id}><Link to={`${base}/trabajos/${o.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-steel-50">
                <span><b>{orderNo(o.number)}</b> · {o.vehicle?.brand} {o.vehicle?.model} <span className="text-steel-400">{o.vehicle?.plate}</span></span>
                <StatusBadge status={o.status} />
              </Link></li>
            ))}</ul>
          )}
        </Card>
        <Card title="Auxilios asignados" actions={<Go to={`${base}/emergencias`}>Ver todos</Go>}>
          {d.emerg.length === 0 ? <Empty text="No tienes auxilios activos." /> : (
            <ul className="divide-y divide-steel-100">{d.emerg.map((e) => (
              <li key={e.id}><Link to={`${base}/emergencias/${e.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-steel-50">
                <span><b>{emergNo(e.number)}</b> <span className="text-steel-500">{e.address || ''}</span></span><StatusBadge status={e.status} />
              </Link></li>
            ))}</ul>
          )}
        </Card>
      </div>
    </div>
  )
}

/* -------------------------------- ALMACENERO -------------------------------- */
export function StoreDashboard() {
  const { base } = useAuth()
  const { data: d, loading } = useQuery(async () => {
    const [products, low, out, wh, mov, purchases, lowList] = await Promise.all([
      count('products', (q) => q.eq('active', true)),
      count('low_stock_products'),
      supabase.from('product_stock').select('id', { count: 'exact', head: true }).eq('active', true).lte('total_qty', 0).then((r) => r.count || 0),
      count('warehouses', (q) => q.eq('active', true)),
      supabase.from('inventory_movements').select('id, type, reason, qty, created_at, product:products(name), warehouse:warehouses!warehouse_id(name)').order('created_at', { ascending: false }).limit(8).then((r) => r.data || []),
      count('purchases', (q) => q.gte('created_at', monthStart())),
      supabase.from('low_stock_products').select('id, name, total_qty, min_stock, unit').order('total_qty').limit(8).then((r) => r.data || []),
    ])
    return { products, low, out, wh, mov: mov as any[], purchases, lowList: lowList as any[] }
  }, [])
  if (loading || !d) return <Loading />
  return (
    <div>
      <PageHeader title="Panel de almacén" subtitle="Inventario, compras y movimientos" />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Productos" value={d.products} /><Stat label="Stock bajo" value={d.low} tone={d.low ? 'text-orange-600' : 'text-ink'} />
        <Stat label="Sin stock" value={d.out} tone={d.out ? 'text-red-600' : 'text-ink'} /><Stat label="Almacenes" value={d.wh} /><Stat label="Compras del mes" value={d.purchases} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Productos con stock bajo" actions={<Go to={`${base}/stock-bajo`}>Ver todos</Go>}>
          {d.lowList.length === 0 ? <Empty text="Todo el stock está por encima del mínimo." /> : (
            <ul className="divide-y divide-steel-100">{d.lowList.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-orange-500" />{p.name}</span>
                <span className="font-semibold">{p.total_qty} <span className="font-normal text-steel-400">/ mín. {p.min_stock}</span></span>
              </li>
            ))}</ul>
          )}
        </Card>
        <Card title="Últimos movimientos" actions={<Go to={`${base}/movimientos`}>Ver todos</Go>}>
          {d.mov.length === 0 ? <Empty text="Sin movimientos todavía." /> : (
            <ul className="divide-y divide-steel-100">{d.mov.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span>{m.product?.name} <span className="text-steel-400">· {m.warehouse?.name}</span></span>
                <span className={`font-semibold ${m.type === 'entrada' ? 'text-emerald-700' : m.type === 'salida' ? 'text-red-600' : 'text-sky-700'}`}>{m.type === 'entrada' ? '+' : m.type === 'salida' ? '−' : '⇄'}{m.qty}</span>
              </li>
            ))}</ul>
          )}
        </Card>
      </div>
    </div>
  )
}

/* ---------------------------------- CLIENTE ---------------------------------- */
export function ClientDashboard() {
  const { base, profile } = useAuth()
  const { data: d, loading } = useQuery(async () => {
    const [vehicles, orders, quotes, emerg, maint, promos, bal] = await Promise.all([
      count('vehicles'),
      supabase.from('work_orders').select('id, number, status, vehicle:vehicles(brand, model, plate)').not('status', 'in', '(entregada,cancelada)').order('opened_at', { ascending: false }).then((r) => r.data || []),
      supabase.from('quotations').select('id, number').eq('status', 'enviada').then((r) => r.data || []),
      supabase.from('emergency_requests').select('id, number, status').in('status', ['pendiente', 'asignado', 'en_camino', 'en_atencion']).then((r) => r.data || []),
      supabase.from('maintenance_schedules').select('id, service_name, next_date, vehicle:vehicles(plate)').eq('done', false).order('next_date').limit(3).then((r) => r.data || []),
      count('promotions', (q) => q.eq('active', true)),
      supabase.from('order_balances').select('total, paid, status').neq('status', 'cancelada').then((r) => r.data || []),
    ])
    const debt = (bal as any[]).reduce((a, b) => a + Math.max(Number(b.total) - Number(b.paid), 0), 0)
    return { vehicles, orders: orders as any[], quotes: quotes as any[], emerg: emerg as any[], maint: maint as any[], promos, debt }
  }, [])
  if (loading || !d) return <Loading />
  return (
    <div>
      <PageHeader title={`Hola, ${profile?.full_name?.split(' ')[0] || ''}`} subtitle="Tu taller de confianza, las 24 horas" />
      <Link to={`${base}/auxilio`} className="mb-5 flex items-center gap-4 rounded-lg bg-red-600 p-4 text-white hover:bg-red-500">
        <Siren className="h-9 w-9 shrink-0" />
        <div><div className="font-display text-2xl font-semibold leading-none">¿Tu vehículo se detuvo?</div><div className="mt-1 text-sm text-red-50">Pide auxilio mecánico ahora: comparte tu ubicación y una foto de la avería.</div></div>
      </Link>
      {d.emerg.length > 0 && <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">Tienes {d.emerg.length} solicitud(es) de auxilio en curso. <Link className="font-semibold underline" to={`${base}/auxilio`}>Ver estado</Link></div>}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link to={`${base}/vehiculos`}><Stat label="Mis vehículos" value={d.vehicles} /></Link>
        <Link to={`${base}/ordenes`}><Stat label="Órdenes en curso" value={d.orders.length} /></Link>
        <Link to={`${base}/cotizaciones`}><Stat label="Cotizaciones por aprobar" value={d.quotes.length} tone={d.quotes.length ? 'text-violet-700' : 'text-ink'} /></Link>
        <Link to={`${base}/pagos`}><Stat label="Saldo pendiente" value={fmtMoney(d.debt)} tone={d.debt ? 'text-red-600' : 'text-ink'} /></Link>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Mis órdenes en curso" actions={<Go to={`${base}/ordenes`}>Ver todas</Go>}>
          {d.orders.length === 0 ? <Empty text="No tienes órdenes en curso." /> : (
            <ul className="divide-y divide-steel-100">{d.orders.slice(0, 5).map((o) => (
              <li key={o.id}><Link to={`${base}/ordenes/${o.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-steel-50">
                <span><b>{orderNo(o.number)}</b> · {o.vehicle?.brand} {o.vehicle?.model}</span><StatusBadge status={o.status} />
              </Link></li>
            ))}</ul>
          )}
        </Card>
        <Card title="Próximos mantenimientos" actions={<Go to={`${base}/mantenimientos`}>Ver todos</Go>}>
          {d.maint.length === 0 ? <Empty text="No hay mantenimientos programados." /> : (
            <ul className="divide-y divide-steel-100">{d.maint.map((m: any) => (
              <li key={m.id} className="flex items-center justify-between px-4 py-2.5 text-sm"><span><CalendarClock className="mr-1.5 inline h-4 w-4 text-steel-400" />{m.service_name} · {m.vehicle?.plate}</span><span className="text-steel-500">{fmtDate(m.next_date)}</span></li>
            ))}</ul>
          )}
        </Card>
      </div>
      {d.promos > 0 && <Link to={`${base}/promociones`} className="mt-4 flex items-center gap-2 rounded-lg border border-steel-200 bg-white p-3 text-sm font-medium hover:bg-steel-50"><Tag className="h-4 w-4 text-amber-600" /> Hay {d.promos} promoción(es) disponible(s) para ti</Link>}
    </div>
  )
}
