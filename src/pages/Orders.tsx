import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useQuery, useOptions } from '../lib/hooks'
import { ORDER_ORIGIN, ORDER_STATUS, opts } from '../lib/constants'
import { errMsg, fmtDate, fmtMoney, orderNo } from '../lib/util'
import { orderPath } from '../lib/paths'
import { Card, Empty, Field, Loading, Modal, PageHeader, SearchBox, StatusBadge, TableWrap, useToast } from '../components/ui'

export default function Orders() {
  const { role, base, customerId, profile } = useAuth()
  const nav = useNavigate()
  const toast = useToast()
  const [sp] = useSearchParams()
  const isStaff = role === 'admin' || role === 'recepcionista'
  const isClient = role === 'cliente'
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState(sp.get('estado') || '')
  const [open, setOpen] = useState(false)

  const { data, loading, error, reload } = useQuery(async () => {
    const { data, error } = await supabase.from('work_orders')
      .select('*, customer:customers(full_name, phone), vehicle:vehicles(brand, model, plate), mechanic:profiles!mechanic_id(full_name)')
      .order('opened_at', { ascending: false }).limit(1000)
    if (error) throw error
    const { data: bal } = role === 'mecanico' || role === 'almacenero' ? { data: [] as any[] } :
      await supabase.from('order_balances').select('order_id, total, paid').limit(1000)
    const m = new Map((bal || []).map((b: any) => [b.order_id, b]))
    return (data || []).map((o: any) => ({ ...o, bal: m.get(o.id) })) as any[]
  }, [role])

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase()
    return (data || []).filter((o) => (!status || o.status === status) &&
      (!s || [orderNo(o.number), o.customer?.full_name, o.vehicle?.plate, o.vehicle?.brand, o.vehicle?.model, o.reported_problem].some((x) => String(x || '').toLowerCase().includes(s))))
  }, [data, search, status])

  const title = role === 'mecanico' ? 'Trabajos asignados' : role === 'almacenero' ? 'Órdenes (uso de productos)' : isClient ? 'Mis órdenes' : 'Órdenes de trabajo'

  return (
    <div>
      <PageHeader title={title} subtitle={isClient ? 'Sigue el avance de tus servicios' : undefined}
        actions={(isStaff || isClient) && <button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> {isClient ? 'Solicitar servicio' : 'Nueva orden'}</button>} />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-steel-100 p-3">
          <SearchBox value={search} onChange={setSearch} placeholder="Buscar por N°, cliente, placa…" />
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos los estados</option>
            {opts(ORDER_STATUS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {loading ? <Loading /> : error ? <p className="p-4 text-sm text-red-600">{error}</p> : rows.length === 0 ? <Empty text={role === 'mecanico' ? 'No tienes trabajos asignados por ahora.' : 'No hay órdenes para mostrar.'} /> : (
          <TableWrap>
            <thead><tr>
              <th className="th">Orden</th><th className="th">Fecha</th><th className="th">Vehículo</th>
              {!isClient && role !== 'almacenero' && <th className="th">Cliente</th>}
              {isStaff && <th className="th">Mecánico</th>}
              <th className="th">Estado</th>
              {(isStaff || isClient) && <><th className="th text-right">Total</th><th className="th text-right">Saldo</th></>}
            </tr></thead>
            <tbody className="divide-y divide-steel-100">
              {rows.map((o) => (
                <tr key={o.id} className="cursor-pointer hover:bg-steel-50" onClick={() => nav(orderPath(role, base, o.id))}>
                  <td className="td font-semibold">{orderNo(o.number)}</td>
                  <td className="td">{fmtDate(o.opened_at)}</td>
                  <td className="td">{o.vehicle ? `${o.vehicle.brand} ${o.vehicle.model}` : '—'}<div className="text-xs text-steel-500">{o.vehicle?.plate}</div></td>
                  {!isClient && role !== 'almacenero' && <td className="td">{o.customer?.full_name}</td>}
                  {isStaff && <td className="td">{o.mechanic?.full_name || <span className="text-steel-400">Sin asignar</span>}</td>}
                  <td className="td"><StatusBadge status={o.status} /></td>
                  {(isStaff || isClient) && <>
                    <td className="td text-right">{fmtMoney(o.bal?.total)}</td>
                    <td className="td text-right font-semibold">{o.bal && Number(o.bal.total) - Number(o.bal.paid) > 0.009 && !['cancelada'].includes(o.status) ? <span className="text-red-600">{fmtMoney(Number(o.bal.total) - Number(o.bal.paid))}</span> : <span className="text-steel-400">—</span>}</td>
                  </>}
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
      {open && <NewOrderModal onClose={() => setOpen(false)} onCreated={(id) => { reload(); nav(orderPath(role, base, id)) }} />}
    </div>
  )
}

function NewOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { role, customerId, profile } = useAuth()
  const toast = useToast()
  const isStaff = role === 'admin' || role === 'recepcionista'
  const isClient = role === 'cliente'
  const customers = useOptions(isStaff ? { table: 'customers', label: (r) => r.full_name + (r.phone ? ' · ' + r.phone : ''), order: 'full_name' } : null)
  const mechanics = useOptions(isStaff ? { table: 'profiles', label: 'full_name', filter: (q) => q.eq('role', 'mecanico').eq('active', true) } : null)
  const [f, setF] = useState<any>({ customer_id: isClient ? customerId : '', vehicle_id: '', mechanic_id: '', origin: 'presencial', mileage: '', reported_problem: '' })
  const [vehicles, setVehicles] = useState<any[]>([])
  const [nv, setNv] = useState({ brand: '', model: '', plate: '', year: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!f.customer_id) { setVehicles([]); return }
    supabase.from('vehicles').select('id, brand, model, plate, mileage').eq('customer_id', f.customer_id).order('created_at').then(({ data }) => setVehicles(data || []))
  }, [f.customer_id])

  const save = async () => {
    if (!f.customer_id) return toast('Elige el cliente', 'error')
    let vehicleId = f.vehicle_id
    setBusy(true)
    try {
      if (vehicleId === 'nuevo') {
        if (!nv.brand || !nv.model || !nv.plate) throw new Error('Completa marca, modelo y placa del vehículo nuevo')
        const { data, error } = await supabase.from('vehicles').insert({ customer_id: f.customer_id, brand: nv.brand, model: nv.model, plate: nv.plate.toUpperCase(), year: nv.year ? Number(nv.year) : null }).select().single()
        if (error) throw error
        vehicleId = data.id
      }
      if (!vehicleId) throw new Error('Elige el vehículo')
      if (!f.reported_problem.trim()) throw new Error('Describe el problema o el servicio que necesitas')
      const payload: any = {
        customer_id: f.customer_id, vehicle_id: vehicleId, reported_problem: f.reported_problem.trim(),
        origin: isClient ? 'solicitud_cliente' : f.origin, status: 'abierta', created_by: profile?.id,
        mileage: f.mileage ? Number(f.mileage) : null,
      }
      if (isStaff && f.mechanic_id) payload.mechanic_id = f.mechanic_id
      const { data, error } = await supabase.from('work_orders').insert(payload).select().single()
      if (error) throw error
      toast(isClient ? 'Solicitud enviada. Te avisaremos cuando la revisemos.' : 'Orden creada')
      onCreated(data.id)
    } catch (e) { toast(errMsg(e), 'error') }
    setBusy(false)
  }

  return (
    <Modal open onClose={onClose} title={isClient ? 'Solicitar un servicio' : 'Nueva orden de trabajo'}
      footer={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={save} disabled={busy}>{isClient ? 'Enviar solicitud' : 'Crear orden'}</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {isStaff && (
          <Field label="Cliente *" className="sm:col-span-2">
            <select className="input" value={f.customer_id} onChange={(e) => setF({ ...f, customer_id: e.target.value, vehicle_id: '' })}>
              <option value="">Seleccionar cliente…</option>{customers.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
        )}
        <Field label="Vehículo *" className="sm:col-span-2">
          <select className="input" value={f.vehicle_id} onChange={(e) => setF({ ...f, vehicle_id: e.target.value })}>
            <option value="">Seleccionar vehículo…</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.brand} {v.model} · {v.plate}</option>)}
            <option value="nuevo">＋ Registrar un vehículo nuevo</option>
          </select>
        </Field>
        {f.vehicle_id === 'nuevo' && (
          <>
            <Field label="Marca *"><input className="input" value={nv.brand} onChange={(e) => setNv({ ...nv, brand: e.target.value })} /></Field>
            <Field label="Modelo *"><input className="input" value={nv.model} onChange={(e) => setNv({ ...nv, model: e.target.value })} /></Field>
            <Field label="Placa *"><input className="input uppercase" value={nv.plate} onChange={(e) => setNv({ ...nv, plate: e.target.value })} /></Field>
            <Field label="Año"><input className="input" type="number" value={nv.year} onChange={(e) => setNv({ ...nv, year: e.target.value })} /></Field>
          </>
        )}
        {isStaff && (
          <>
            <Field label="Origen"><select className="input" value={f.origin} onChange={(e) => setF({ ...f, origin: e.target.value })}>{opts(ORDER_ORIGIN).filter((o) => o.value !== 'solicitud_cliente').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
            <Field label="Mecánico (opcional)"><select className="input" value={f.mechanic_id} onChange={(e) => setF({ ...f, mechanic_id: e.target.value })}><option value="">Asignar después</option>{mechanics.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></Field>
          </>
        )}
        <Field label="Kilometraje actual"><input className="input" type="number" value={f.mileage} onChange={(e) => setF({ ...f, mileage: e.target.value })} /></Field>
        <Field label={isClient ? '¿Qué servicio necesitas o qué falla notas? *' : 'Problema reportado *'} className="sm:col-span-2">
          <textarea className="input min-h-[96px]" value={f.reported_problem} onChange={(e) => setF({ ...f, reported_problem: e.target.value })} />
        </Field>
      </div>
    </Modal>
  )
}
