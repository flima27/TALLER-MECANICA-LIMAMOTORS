import { ReactNode, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, MapPin, MessageCircle, Phone, Plus, Siren, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useQuery, useOptions } from '../lib/hooks'
import { EMERGENCY_STATUS, EMERGENCY_TYPE, STATUS_TONE, URGENCY, opts } from '../lib/constants'
import { errMsg, emergNo, fmtDateTime, mapsLink, orderNo } from '../lib/util'
import { orderPath } from '../lib/paths'
import EmergencyForm from '../components/EmergencyForm'
import FileManager from '../components/Files'
import { Badge, Card, Empty, Field, KV, Loading, Modal, PageHeader, SearchBox, StatusBadge, TableWrap, useToast, confirmAsk } from '../components/ui'

const UrgencyBadge = ({ u }: { u: string }) => <Badge tone={STATUS_TONE[u === 'baja' ? 'baja_u' : u]}>{URGENCY[u]}</Badge>
const RANK: Record<string, number> = { critica: 0, alta: 1, media: 2, baja: 3 }

/* ------------------------------ LISTA (admin / recepción / mecánico) ------------------------------ */
export function EmergencyList() {
  const { role, base } = useAuth()
  const nav = useNavigate()
  const isStaff = role === 'admin' || role === 'recepcionista'
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('activas')
  const [open, setOpen] = useState(false)
  const { data, loading, error, reload } = useQuery(async () => {
    const { data, error } = await supabase.from('emergency_requests')
      .select('*, customer:customers(full_name), mech:profiles!assigned_to(full_name)').order('created_at', { ascending: false }).limit(1000)
    if (error) throw error
    return data as any[]
  })
  useEffect(() => { const t = setInterval(reload, 30000); return () => clearInterval(t) }, [reload])

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase()
    const act = ['pendiente', 'asignado', 'en_camino', 'en_atencion']
    return (data || [])
      .filter((e) => (status === 'activas' ? act.includes(e.status) : !status || e.status === status) &&
        (!s || [emergNo(e.number), e.customer?.full_name, e.plate, e.address, e.phone].some((x) => String(x || '').toLowerCase().includes(s))))
      .sort((a, b) => status === 'activas' ? (RANK[a.urgency] - RANK[b.urgency]) || +new Date(a.created_at) - +new Date(b.created_at) : 0)
  }, [data, search, status])

  return (
    <div>
      <PageHeader title={role === 'mecanico' ? 'Auxilios asignados' : 'Emergencias 24/7'} subtitle="Se actualiza sola cada 30 segundos"
        actions={isStaff && <button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Registrar auxilio</button>} />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-steel-100 p-3">
          <SearchBox value={search} onChange={setSearch} placeholder="Buscar cliente, placa, dirección…" />
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="activas">Activas (más urgentes primero)</option><option value="">Todas</option>
            {opts(EMERGENCY_STATUS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {loading ? <Loading /> : error ? <p className="p-4 text-sm text-red-600">{error}</p> : rows.length === 0 ? <Empty text="No hay solicitudes de auxilio en esta lista." /> : (
          <TableWrap>
            <thead><tr><th className="th">N°</th><th className="th">Recibida</th><th className="th">Cliente</th><th className="th">Problema</th><th className="th">Urgencia</th><th className="th">Estado</th>{role !== 'mecanico' && <th className="th">Mecánico</th>}</tr></thead>
            <tbody className="divide-y divide-steel-100">
              {rows.map((e) => (
                <tr key={e.id} className="cursor-pointer hover:bg-steel-50" onClick={() => nav(`${base}/emergencias/${e.id}`)}>
                  <td className="td font-semibold">{emergNo(e.number)}</td><td className="td">{fmtDateTime(e.created_at)}</td>
                  <td className="td">{e.customer?.full_name}<div className="text-xs text-steel-500">{e.plate}</div></td>
                  <td className="td">{EMERGENCY_TYPE[e.type]}</td><td className="td"><UrgencyBadge u={e.urgency} /></td><td className="td"><StatusBadge status={e.status} /></td>
                  {role !== 'mecanico' && <td className="td">{e.mech?.full_name || <span className="font-semibold text-red-600">Sin asignar</span>}</td>}
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="Registrar auxilio (llamada / WhatsApp)" wide>
        <EmergencyForm staffMode onDone={(id) => { setOpen(false); reload(); nav(`${base}/emergencias/${id}`) }} />
      </Modal>
    </div>
  )
}

/* ------------------------------ DETALLE ------------------------------ */
function CreateOrderModal({ em, onClose, onCreated }: { em: any; onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast()
  const [vehicles, setVehicles] = useState<any[]>([])
  const [vid, setVid] = useState<string>(em.vehicle_id || '')
  const [nv, setNv] = useState({ brand: '', model: '', plate: em.plate || '' })
  const [busy, setBusy] = useState(false)
  useEffect(() => { supabase.from('vehicles').select('id, brand, model, plate').eq('customer_id', em.customer_id).then(({ data }) => setVehicles(data || [])) }, [em.customer_id])
  const save = async () => {
    setBusy(true)
    try {
      let vehicle = vid
      if (vid === 'nuevo' || !vid) {
        if (!nv.brand || !nv.model || !nv.plate) throw new Error('Elige un vehículo o completa marca, modelo y placa')
        const { data, error } = await supabase.from('vehicles').insert({ customer_id: em.customer_id, brand: nv.brand, model: nv.model, plate: nv.plate.toUpperCase() }).select().single()
        if (error) throw error
        vehicle = data.id
      }
      const { data, error } = await supabase.from('work_orders').insert({
        customer_id: em.customer_id, vehicle_id: vehicle, origin: 'auxilio', emergency_id: em.id, mechanic_id: em.assigned_to || null,
        reported_problem: `${EMERGENCY_TYPE[em.type]}${em.description ? ': ' + em.description : ''}`,
      }).select().single()
      if (error) throw error
      toast('Orden creada'); onCreated(data.id)
    } catch (e) { toast(errMsg(e), 'error') }
    setBusy(false)
  }
  return (
    <Modal open onClose={onClose} title="Crear orden de trabajo desde este auxilio"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={save} disabled={busy}>Crear orden</button></>}>
      <Field label="Vehículo">
        <select className="input" value={vid} onChange={(e) => setVid(e.target.value)}>
          <option value="">Seleccionar…</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.brand} {v.model} · {v.plate}</option>)}<option value="nuevo">+ Registrar vehículo nuevo</option>
        </select>
      </Field>
      {(vid === 'nuevo' || (!vid && vehicles.length === 0)) && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <input className="input" placeholder="Marca" value={nv.brand} onChange={(e) => setNv({ ...nv, brand: e.target.value })} />
          <input className="input" placeholder="Modelo" value={nv.model} onChange={(e) => setNv({ ...nv, model: e.target.value })} />
          <input className="input" placeholder="Placa" value={nv.plate} onChange={(e) => setNv({ ...nv, plate: e.target.value })} />
        </div>
      )}
    </Modal>
  )
}

export function EmergencyDetail() {
  const { id } = useParams()
  const { role, base } = useAuth()
  const nav = useNavigate()
  const toast = useToast()
  const isStaff = role === 'admin' || role === 'recepcionista'
  const mechanics = useOptions(isStaff ? { table: 'profiles', label: 'full_name', filter: (q) => q.eq('role', 'mecanico').eq('active', true) } : null)
  const [creating, setCreating] = useState(false)
  const { data: d, loading, reload } = useQuery(async () => {
    const [e, h, o] = await Promise.all([
      supabase.from('emergency_requests').select('*, customer:customers(full_name, phone), mech:profiles!assigned_to(full_name)').eq('id', id!).maybeSingle(),
      supabase.from('emergency_status_history').select('*, user:profiles!changed_by(full_name)').eq('emergency_id', id!).order('changed_at'),
      supabase.from('work_orders').select('id, number, status').eq('emergency_id', id!).limit(1),
    ])
    return { e: e.data, h: h.data || [], o: (o.data || [])[0] }
  }, [id])
  if (loading) return <Loading />
  if (!d?.e) return <Empty text="Solicitud no encontrada." />
  const e = d.e
  const map = mapsLink(e.lat, e.lng)
  const wa = (e.phone || '').replace(/\D/g, '')
  const setStatus = async (status: string) => {
    const { error } = await supabase.from('emergency_requests').update({ status }).eq('id', e.id)
    if (error) toast(errMsg(error), 'error'); else { toast('Estado actualizado'); reload() }
  }
  const assign = async (uid: string) => {
    const patch: any = { assigned_to: uid || null }
    if (uid && e.status === 'pendiente') patch.status = 'asignado'
    const { error } = await supabase.from('emergency_requests').update(patch).eq('id', e.id)
    if (error) toast(errMsg(error), 'error'); else { toast('Mecánico asignado'); reload() }
  }
  const closed = e.status === 'finalizado' || e.status === 'cancelado'
  const next: { s: string; label: string }[] = [
    { s: 'en_camino', label: 'Voy en camino' }, { s: 'en_atencion', label: 'Llegué · atendiendo' }, { s: 'finalizado', label: 'Finalizar auxilio' },
  ]
  return (
    <div>
      <Link to={`${base}/emergencias`} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-steel-500 hover:text-ink"><ArrowLeft className="h-4 w-4" /> Emergencias</Link>
      <PageHeader title={`Auxilio ${emergNo(e.number)}`} subtitle={`${EMERGENCY_TYPE[e.type]} · recibido ${fmtDateTime(e.created_at)}`}
        actions={<><UrgencyBadge u={e.urgency} /><StatusBadge status={e.status} /></>} />

      <div className="mb-4 flex flex-wrap gap-2">
        {map && <a className="btn-primary" href={map} target="_blank" rel="noreferrer"><MapPin className="h-4 w-4" /> Abrir ubicación en el mapa</a>}
        {e.phone && <a className="btn-secondary" href={`tel:${e.phone}`}><Phone className="h-4 w-4" /> Llamar</a>}
        {wa && <a className="btn-secondary" target="_blank" rel="noreferrer" href={`https://wa.me/${wa.length <= 8 ? '591' + wa : wa}`}><MessageCircle className="h-4 w-4" /> WhatsApp</a>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Solicitud"><dl className="grid gap-4 p-4 sm:grid-cols-2">
            <KV label="Cliente">{e.customer?.full_name}</KV><KV label="Contacto">{e.contact_name}{e.phone ? ` · ${e.phone}` : ''}</KV>
            <KV label="Vehículo">{e.vehicle_desc}{e.plate ? ` · ${e.plate}` : ''}</KV>
            <KV label="Ubicación">{e.address}{e.lat != null && <div className="text-xs text-steel-500">GPS {e.lat}, {e.lng}</div>}</KV>
            <div className="sm:col-span-2"><KV label="Descripción del problema">{e.description}</KV></div>
          </dl></Card>
          <Card title="Fotos y videos"><div className="p-4"><FileManager folder="emergencias" entityType="emergency" entityId={e.id} customerId={e.customer_id} readOnly={role === 'cliente'} /></div></Card>
        </div>

        <div className="space-y-4">
          {isStaff && (
            <Card title="Gestión"><div className="space-y-3 p-4">
              <Field label="Mecánico asignado">
                <select className="input" value={e.assigned_to || ''} onChange={(ev) => assign(ev.target.value)} disabled={closed}>
                  <option value="">Sin asignar</option>{mechanics.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </Field>
              <Field label="Estado">
                <select className="input" value={e.status} onChange={(ev) => setStatus(ev.target.value)}>
                  {opts(EMERGENCY_STATUS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              {d.o ? <Link className="btn-secondary w-full" to={`${base}/ordenes/${d.o.id}`}>Ver orden {orderNo(d.o.number)}</Link>
                : !e.status.includes('cancel') && <button className="btn-dark w-full" onClick={() => setCreating(true)}>Crear orden de trabajo</button>}
            </div></Card>
          )}
          {role === 'mecanico' && !closed && (
            <Card title="Mi avance"><div className="space-y-2 p-4">
              {next.map((n) => <button key={n.s} className={e.status === n.s ? 'btn-primary w-full' : 'btn-secondary w-full'} onClick={() => setStatus(n.s)}>{n.label}</button>)}
              {d.o ? <Link className="btn-dark w-full" to={orderPath(role, base, d.o.id)}>Abrir orden {orderNo(d.o.number)}</Link>
                : <p className="text-xs text-steel-500">Recepción creará la orden de trabajo para registrar repuestos y mano de obra.</p>}
            </div></Card>
          )}
          <Card title="Seguimiento">
            <ol className="space-y-3 p-4">
              {d.h.map((h: any) => (
                <li key={h.id} className="flex gap-3 text-sm"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                  <div><b>{EMERGENCY_STATUS[h.status] || h.status}</b>{h.note && <span className="text-steel-500"> · {h.note}</span>}
                    <div className="text-xs text-steel-500">{fmtDateTime(h.changed_at)}{h.user?.full_name ? ` · ${h.user.full_name}` : ''}</div></div></li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
      {creating && <CreateOrderModal em={e} onClose={() => setCreating(false)} onCreated={(oid) => nav(`${base}/ordenes/${oid}`)} />}
    </div>
  )
}

/* ------------------------------ CLIENTE: pedir y seguir auxilio ------------------------------ */
export function ClientEmergency() {
  const toast = useToast()
  const [show, setShow] = useState<boolean | null>(null)
  const { data, loading, reload } = useQuery(async () => {
    const { data } = await supabase.from('emergency_requests').select('*, mech:profiles!assigned_to(full_name, phone)').order('created_at', { ascending: false }).limit(50)
    return (data || []) as any[]
  })
  useEffect(() => { const t = setInterval(reload, 20000); return () => clearInterval(t) }, [reload])
  if (loading && !data) return <Loading />
  const active = (data || []).filter((e) => ['pendiente', 'asignado', 'en_camino', 'en_atencion'].includes(e.status))
  const showForm = show ?? active.length === 0
  const cancel = async (e: any) => {
    if (!confirmAsk('¿Cancelar esta solicitud de auxilio?')) return
    const { error } = await supabase.rpc('cancel_emergency', { p_id: e.id })
    if (error) toast(errMsg(error), 'error'); else { toast('Solicitud cancelada'); reload() }
  }
  const steps = ['pendiente', 'asignado', 'en_camino', 'en_atencion', 'finalizado']
  return (
    <div className="max-w-3xl">
      <PageHeader title="Auxilio mecánico 24/7" subtitle="Te ayudamos donde estés"
        actions={active.length > 0 && !showForm && <button className="btn-primary" onClick={() => setShow(true)}><Plus className="h-4 w-4" /> Nueva solicitud</button>} />
      {active.map((e) => {
        const idx = steps.indexOf(e.status)
        const map = mapsLink(e.lat, e.lng)
        return (
          <Card key={e.id} className="mb-4 border-amber-300">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-steel-100 px-4 py-3">
              <div className="flex items-center gap-2"><Siren className="h-5 w-5 text-red-600" /><b>{emergNo(e.number)}</b> · {EMERGENCY_TYPE[e.type]}</div><StatusBadge status={e.status} />
            </div>
            <div className="p-4">
              <div className="mb-3 flex gap-1">{steps.map((s, i) => <div key={s} className={`h-1.5 flex-1 rounded ${i <= idx ? 'bg-amber-500' : 'bg-steel-200'}`} />)}</div>
              <p className="text-sm">{e.mech ? <>Mecánico asignado: <b>{e.mech.full_name}</b>{e.mech.phone && <> · <a className="underline" href={`tel:${e.mech.phone}`}>{e.mech.phone}</a></>}</> : (e.assigned_to ? 'Ya tienes un mecánico asignado y está en camino a atenderte.' : 'Estamos asignando un mecánico. Mantén tu teléfono a mano.')}</p>
              {e.address && <p className="mt-1 text-sm text-steel-600">Ubicación: {e.address}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {map && <a className="btn-secondary btn-sm" href={map} target="_blank" rel="noreferrer"><MapPin className="h-4 w-4" /> Ver mi ubicación</a>}
                {(e.status === 'pendiente' || e.status === 'asignado') && <button className="btn-ghost btn-sm text-red-600" onClick={() => cancel(e)}><XCircle className="h-4 w-4" /> Cancelar</button>}
              </div>
            </div>
          </Card>
        )
      })}
      {showForm && <Card title="Pedir auxilio"><div className="p-4"><EmergencyForm onDone={() => { setShow(false); reload() }} /></div></Card>}
      {(data || []).filter((e) => !active.includes(e)).length > 0 && (
        <Card title="Solicitudes anteriores" className="mt-4"><ul className="divide-y divide-steel-100">
          {(data || []).filter((e) => !active.includes(e)).map((e) => <li key={e.id} className="flex items-center justify-between px-4 py-2.5 text-sm"><span><b>{emergNo(e.number)}</b> · {EMERGENCY_TYPE[e.type]} <span className="text-steel-500">· {fmtDateTime(e.created_at)}</span></span><StatusBadge status={e.status} /></li>)}
        </ul></Card>
      )}
    </div>
  )
}
