import { ReactNode, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Phone, MessageCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useQuery } from '../lib/hooks'
import { FUEL, PROMO_KIND, opts } from '../lib/constants'
import { fmtDate, fmtMoney, orderNo } from '../lib/util'
import { orderPath } from '../lib/paths'
import CrudPage from '../components/CrudPage'
import FileManager from '../components/Files'
import { Badge, Card, Empty, KV, Loading, PageHeader, SearchBox, Stat, StatusBadge, TableWrap } from '../components/ui'

const waLink = (phone?: string | null) => {
  const d = (phone || '').replace(/\D/g, '')
  return d ? `https://wa.me/${d.length <= 8 ? '591' + d : d}` : null
}
const BackLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={to} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-steel-500 hover:text-ink"><ArrowLeft className="h-4 w-4" /> {children}</Link>
)

/* ------------------------------ CLIENTES ------------------------------ */
export function ClientsPage() {
  const { role, base } = useAuth()
  const nav = useNavigate()
  return (
    <CrudPage table="customers" title="Clientes" subtitle="Toca un cliente para ver sus vehículos, órdenes y pagos" itemName="cliente" canDelete={role === 'admin'}
      orderBy={{ col: 'full_name', asc: true }} searchKeys={['full_name', 'phone', 'email', 'doc_id']} onRowClick={(r) => nav(`${base}/clientes/${r.id}`)}
      columns={[
        { key: 'full_name', label: 'Nombre', render: (r) => <span className="font-semibold">{r.full_name}</span> },
        { key: 'phone', label: 'Teléfono' }, { key: 'email', label: 'Correo' }, { key: 'doc_id', label: 'CI / NIT' },
        { key: 'user_id', label: 'Cuenta', render: (r) => r.user_id ? <Badge tone="bg-emerald-100 text-emerald-800">Con acceso</Badge> : <Badge>Sin cuenta</Badge> },
      ]}
      fields={[
        { key: 'full_name', label: 'Nombre completo', required: true, full: true }, { key: 'phone', label: 'Teléfono / WhatsApp', type: 'tel' },
        { key: 'email', label: 'Correo', type: 'email', hint: 'Si el cliente se registra después con este correo, su cuenta se vincula sola.' },
        { key: 'doc_id', label: 'CI / NIT' }, { key: 'address', label: 'Dirección' }, { key: 'notes', label: 'Notas', type: 'textarea' },
      ]} />
  )
}

export function CustomerDetail() {
  const { id } = useParams()
  const { base, role } = useAuth()
  const nav = useNavigate()
  const { data: d, loading } = useQuery(async () => {
    const [c, v, o, b] = await Promise.all([
      supabase.from('customers').select('*').eq('id', id!).maybeSingle(),
      supabase.from('vehicles').select('*').eq('customer_id', id!).order('created_at'),
      supabase.from('work_orders').select('*, vehicle:vehicles(brand, model, plate)').eq('customer_id', id!).order('opened_at', { ascending: false }).limit(200),
      supabase.from('order_balances').select('total, paid, status').eq('customer_id', id!),
    ])
    return { c: c.data, v: v.data || [], o: o.data || [], b: b.data || [] }
  }, [id])
  if (loading) return <Loading />
  if (!d?.c) return <Empty text="Cliente no encontrado." />
  const active = d.b.filter((x: any) => x.status !== 'cancelada')
  const total = active.reduce((a: number, x: any) => a + Number(x.total), 0)
  const paid = active.reduce((a: number, x: any) => a + Number(x.paid), 0)
  const wa = waLink(d.c.phone)
  return (
    <div>
      <BackLink to={`${base}/clientes`}>Clientes</BackLink>
      <PageHeader title={d.c.full_name} subtitle={[d.c.phone, d.c.email].filter(Boolean).join(' · ')}
        actions={<>
          {d.c.phone && <a className="btn-secondary" href={`tel:${d.c.phone}`}><Phone className="h-4 w-4" /> Llamar</a>}
          {wa && <a className="btn-secondary" href={wa} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp</a>}
        </>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Vehículos" value={d.v.length} /><Stat label="Órdenes" value={d.o.length} />
        <Stat label="Facturado" value={fmtMoney(total)} /><Stat label="Saldo pendiente" value={fmtMoney(Math.max(total - paid, 0))} tone={total - paid > 0.009 ? 'text-red-600' : 'text-ink'} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Datos" className="lg:col-span-1"><dl className="grid gap-3 p-4">
          <KV label="CI / NIT">{d.c.doc_id}</KV><KV label="Dirección">{d.c.address}</KV><KV label="Notas">{d.c.notes}</KV><KV label="Cliente desde">{fmtDate(d.c.created_at)}</KV>
        </dl></Card>
        <div className="space-y-4 lg:col-span-2">
          <Card title="Vehículos">
            {d.v.length === 0 ? <Empty text="Sin vehículos registrados." /> : <ul className="divide-y divide-steel-100">
              {d.v.map((v: any) => <li key={v.id}><Link to={`${base}/vehiculos/${v.id}`} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-steel-50"><span className="font-semibold">{v.brand} {v.model} {v.year || ''}</span><span className="text-steel-500">{v.plate}</span></Link></li>)}
            </ul>}
          </Card>
          <Card title="Órdenes de trabajo">
            {d.o.length === 0 ? <Empty text="Sin órdenes." /> : <TableWrap><tbody className="divide-y divide-steel-100">
              {d.o.map((o: any) => <tr key={o.id} className="cursor-pointer hover:bg-steel-50" onClick={() => nav(orderPath(role, base, o.id))}>
                <td className="td font-semibold">{orderNo(o.number)}</td><td className="td">{fmtDate(o.opened_at)}</td><td className="td">{o.vehicle?.brand} {o.vehicle?.model} · {o.vehicle?.plate}</td><td className="td"><StatusBadge status={o.status} /></td>
              </tr>)}
            </tbody></TableWrap>}
          </Card>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------ VEHÍCULOS ------------------------------ */
export function VehiclesPage() {
  const { role, base, customerId } = useAuth()
  const nav = useNavigate()
  const isClient = role === 'cliente'
  const staff = role === 'admin' || role === 'recepcionista'
  return (
    <CrudPage table="vehicles" title={isClient ? 'Mis vehículos' : 'Vehículos'} subtitle="Toca un vehículo para ver su historial y fotos" itemName="vehículo"
      select="*, customer:customers(full_name)" canCreate={staff || isClient} canEdit={staff || isClient} canDelete={role === 'admin'}
      defaults={isClient ? { customer_id: customerId } : {}} modalWide
      searchKeys={['plate', 'brand', 'model', 'customer.full_name']} onRowClick={(r) => nav(`${base}/vehiculos/${r.id}`)}
      columns={[
        { key: 'plate', label: 'Placa', render: (r) => <span className="font-semibold">{r.plate}</span> }, { key: 'brand', label: 'Marca' }, { key: 'model', label: 'Modelo' },
        { key: 'year', label: 'Año' }, { key: 'color', label: 'Color' },
        ...(isClient ? [] : [{ key: 'customer.full_name', label: 'Propietario', render: (r: any) => r.customer?.full_name }]),
        { key: 'mileage', label: 'Km', render: (r) => r.mileage != null ? Number(r.mileage).toLocaleString() : '—' },
      ]}
      fields={[
        ...(isClient ? [] : [{ key: 'customer_id', label: 'Propietario', type: 'select' as const, required: true, full: true, readOnlyOnEdit: true,
          optionsFrom: { table: 'customers', label: (r: any) => r.full_name + (r.phone ? ' · ' + r.phone : ''), order: 'full_name' } }]),
        { key: 'brand', label: 'Marca', required: true }, { key: 'model', label: 'Modelo', required: true },
        { key: 'year', label: 'Año', type: 'number' }, { key: 'plate', label: 'Placa', required: true },
        { key: 'color', label: 'Color' }, { key: 'fuel_type', label: 'Combustible', type: 'select', options: opts(FUEL) },
        { key: 'engine', label: 'Motor' }, { key: 'vin', label: 'Chasis / VIN' }, { key: 'mileage', label: 'Kilometraje', type: 'number' },
        { key: 'notes', label: 'Notas', type: 'textarea' },
      ]}
      beforeSave={(v) => ({ ...v, plate: (v.plate || '').toUpperCase().trim(), ...(isClient ? { customer_id: customerId } : {}) })} />
  )
}

export function VehicleDetail() {
  const { id } = useParams()
  const { base, role, customerId } = useAuth()
  const nav = useNavigate()
  const { data: d, loading } = useQuery(async () => {
    const [v, o, m] = await Promise.all([
      supabase.from('vehicles').select('*, customer:customers(full_name, phone)').eq('id', id!).maybeSingle(),
      supabase.from('work_orders').select('*').eq('vehicle_id', id!).order('opened_at', { ascending: false }).limit(200),
      supabase.from('maintenance_schedules').select('*').eq('vehicle_id', id!).order('next_date'),
    ])
    return { v: v.data, o: o.data || [], m: m.data || [] }
  }, [id])
  if (loading) return <Loading />
  if (!d?.v) return <Empty text="Vehículo no encontrado." />
  const v = d.v
  const canUpload = role === 'admin' || role === 'recepcionista' || role === 'cliente'
  return (
    <div>
      <BackLink to={`${base}/vehiculos`}>Vehículos</BackLink>
      <PageHeader title={`${v.brand} ${v.model} ${v.year || ''}`} subtitle={`Placa ${v.plate}${role !== 'cliente' && v.customer ? ' · ' + v.customer.full_name : ''}`} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Ficha" className="lg:col-span-1"><dl className="grid grid-cols-2 gap-3 p-4">
          <KV label="Color">{v.color}</KV><KV label="Combustible">{v.fuel_type ? FUEL[v.fuel_type] : null}</KV><KV label="Motor">{v.engine}</KV>
          <KV label="Kilometraje">{v.mileage != null ? Number(v.mileage).toLocaleString() + ' km' : null}</KV><KV label="Chasis / VIN">{v.vin}</KV><KV label="Notas">{v.notes}</KV>
        </dl></Card>
        <div className="space-y-4 lg:col-span-2">
          <Card title="Historial de servicios">
            {d.o.length === 0 ? <Empty text="Este vehículo aún no tiene órdenes." /> : <TableWrap><tbody className="divide-y divide-steel-100">
              {d.o.map((o: any) => <tr key={o.id} className="cursor-pointer hover:bg-steel-50" onClick={() => nav(orderPath(role, base, o.id))}>
                <td className="td font-semibold">{orderNo(o.number)}</td><td className="td">{fmtDate(o.opened_at)}</td>
                <td className="td max-w-xs truncate">{o.reported_problem || '—'}</td><td className="td"><StatusBadge status={o.status} /></td>
              </tr>)}
            </tbody></TableWrap>}
          </Card>
          {d.m.length > 0 && <Card title="Mantenimientos programados"><ul className="divide-y divide-steel-100">
            {d.m.map((m: any) => <li key={m.id} className="flex justify-between px-4 py-2.5 text-sm"><span className={m.done ? 'text-steel-400 line-through' : 'font-semibold'}>{m.service_name}</span><span className="text-steel-500">{m.next_date ? fmtDate(m.next_date) : ''}{m.next_km ? ` · ${Number(m.next_km).toLocaleString()} km` : ''}</span></li>)}
          </ul></Card>}
          <Card title="Fotos y documentos"><div className="p-4">
            <FileManager folder="vehiculos" entityType="vehicle" entityId={v.id} customerId={v.customer_id} readOnly={!canUpload} label="Fotos del vehículo, tarjeta de propiedad, seguro…" />
          </div></Card>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------ HISTORIAL ------------------------------ */
export function HistoryPage() {
  const { role, base } = useAuth()
  const nav = useNavigate()
  const [search, setSearch] = useState('')
  const { data, loading, error } = useQuery(async () => {
    const { data, error } = await supabase.from('work_orders')
      .select('*, customer:customers(full_name), vehicle:vehicles(brand, model, plate)').in('status', ['terminada', 'entregada'])
      .order('opened_at', { ascending: false }).limit(1000)
    if (error) throw error
    const { data: bal } = await supabase.from('order_balances').select('order_id, total').limit(2000)
    const m = new Map((bal || []).map((b: any) => [b.order_id, b.total]))
    return (data || []).map((o: any) => ({ ...o, total: m.get(o.id) })) as any[]
  })
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase()
    return (data || []).filter((o) => !s || [o.vehicle?.plate, o.vehicle?.brand, o.vehicle?.model, o.customer?.full_name, o.work_done, o.reported_problem, orderNo(o.number)].some((x) => String(x || '').toLowerCase().includes(s)))
  }, [data, search])
  return (
    <div>
      <PageHeader title="Historial de servicios" subtitle="Trabajos terminados y entregados" />
      <Card>
        <div className="border-b border-steel-100 p-3"><SearchBox value={search} onChange={setSearch} placeholder="Buscar por placa, cliente, trabajo…" /></div>
        {loading ? <Loading /> : error ? <p className="p-4 text-sm text-red-600">{error}</p> : rows.length === 0 ? <Empty text="Todavía no hay servicios terminados." /> : (
          <TableWrap>
            <thead><tr><th className="th">Orden</th><th className="th">Fecha</th><th className="th">Vehículo</th>{role !== 'cliente' && <th className="th">Cliente</th>}<th className="th">Trabajo realizado</th><th className="th text-right">Total</th></tr></thead>
            <tbody className="divide-y divide-steel-100">
              {rows.map((o) => <tr key={o.id} className="cursor-pointer hover:bg-steel-50" onClick={() => nav(orderPath(role, base, o.id))}>
                <td className="td font-semibold">{orderNo(o.number)}</td><td className="td">{fmtDate(o.delivered_at || o.finished_at || o.opened_at)}</td>
                <td className="td">{o.vehicle?.brand} {o.vehicle?.model}<div className="text-xs text-steel-500">{o.vehicle?.plate}</div></td>
                {role !== 'cliente' && <td className="td">{o.customer?.full_name}</td>}
                <td className="td max-w-xs truncate">{o.work_done || o.reported_problem || '—'}</td><td className="td text-right">{fmtMoney(o.total)}</td>
              </tr>)}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}

/* ------------------------------ SERVICIOS ------------------------------ */
export function ServicesPage() {
  return (
    <CrudPage table="services" title="Catálogo de servicios" subtitle="Precios base que se usan en órdenes y cotizaciones" itemName="servicio" canDelete
      orderBy={{ col: 'code', asc: true }} searchKeys={['code', 'name', 'category']}
      columns={[
        { key: 'code', label: 'Código' }, { key: 'name', label: 'Servicio', render: (r) => <span className="font-semibold">{r.name}</span> }, { key: 'category', label: 'Categoría' },
        { key: 'base_price', label: 'Precio base', render: (r) => fmtMoney(r.base_price) }, { key: 'est_minutes', label: 'Minutos', render: (r) => r.est_minutes ?? '—' },
        { key: 'active', label: 'Estado', render: (r) => r.active ? <Badge tone="bg-emerald-100 text-emerald-800">Activo</Badge> : <Badge>Inactivo</Badge> },
      ]}
      fields={[
        { key: 'code', label: 'Código' }, { key: 'name', label: 'Nombre del servicio', required: true }, { key: 'category', label: 'Categoría' },
        { key: 'base_price', label: 'Precio base (Bs)', type: 'number', required: true }, { key: 'est_minutes', label: 'Tiempo estimado (min)', type: 'number' },
        { key: 'description', label: 'Descripción', type: 'textarea' }, { key: 'active', label: 'Servicio activo', type: 'checkbox' },
      ]} />
  )
}

/* ------------------------------ PROMOCIONES ------------------------------ */
export function PromotionsAdmin() {
  return (
    <CrudPage table="promotions" title="Promociones y campañas" subtitle="Lo que ven tus clientes en su panel" itemName="promoción" canDelete
      columns={[
        { key: 'title', label: 'Título', render: (r) => <span className="font-semibold">{r.title}</span> }, { key: 'kind', label: 'Tipo', render: (r) => PROMO_KIND[r.kind] },
        { key: 'discount_percent', label: 'Descuento', render: (r) => r.discount_percent != null ? `${r.discount_percent}%` : '—' },
        { key: 'price', label: 'Precio', render: (r) => r.price != null ? fmtMoney(r.price) : '—' },
        { key: 'valid_to', label: 'Vigente hasta', render: (r) => fmtDate(r.valid_to) },
        { key: 'active', label: 'Estado', render: (r) => r.active ? <Badge tone="bg-emerald-100 text-emerald-800">Activa</Badge> : <Badge>Inactiva</Badge> },
      ]}
      fields={[
        { key: 'title', label: 'Título', required: true, full: true }, { key: 'kind', label: 'Tipo', type: 'select', options: opts(PROMO_KIND), required: true },
        { key: 'discount_percent', label: 'Descuento (%)', type: 'number' }, { key: 'price', label: 'Precio del paquete (Bs)', type: 'number' },
        { key: 'valid_from', label: 'Desde', type: 'date' }, { key: 'valid_to', label: 'Hasta', type: 'date' },
        { key: 'description', label: 'Descripción', type: 'textarea' }, { key: 'active', label: 'Promoción activa', type: 'checkbox' },
      ]} />
  )
}

export function PromotionsView() {
  const { data, loading } = useQuery(async () => {
    const t = new Date().toISOString().slice(0, 10)
    const { data } = await supabase.from('promotions').select('*').eq('active', true).order('created_at', { ascending: false })
    return (data || []).filter((p: any) => (!p.valid_to || p.valid_to >= t) && (!p.valid_from || p.valid_from <= t)) as any[]
  })
  return (
    <div>
      <PageHeader title="Promociones" subtitle="Ofertas vigentes para ti" />
      {loading ? <Loading /> : !data?.length ? <Card><Empty text="No hay promociones vigentes por ahora." /></Card> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((p) => (
            <div key={p.id} className="card overflow-hidden">
              <div className="flex items-center justify-between bg-ink px-4 py-2 text-white"><Badge tone="bg-amber-400 text-ink">{PROMO_KIND[p.kind]}</Badge>
                {p.discount_percent != null && <span className="font-display text-2xl font-semibold text-amber-400">-{p.discount_percent}%</span>}</div>
              <div className="p-4"><h3 className="text-xl font-semibold">{p.title}</h3>
                {p.description && <p className="mt-1 text-sm text-steel-600">{p.description}</p>}
                {p.price != null && <p className="mt-2 font-display text-2xl font-semibold">{fmtMoney(p.price)}</p>}
                {p.valid_to && <p className="mt-2 text-xs text-steel-500">Vigente hasta {fmtDate(p.valid_to)}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
