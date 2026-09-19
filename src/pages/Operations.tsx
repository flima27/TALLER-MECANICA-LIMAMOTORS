import { useMemo, useState } from 'react'
import { BellRing, CheckCircle2, History, MessageCircle, Pencil, Plus, Repeat, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useQuery, useOptions } from '../lib/hooks'
import { TOOL_STATUS } from '../lib/constants'
import { errMsg, fmtDate, fmtDateTime, fmtNum, todayISO } from '../lib/util'
import { Badge, Card, Empty, Field, Loading, Modal, PageHeader, SearchBox, StatusBadge, TableWrap, useToast, confirmAsk } from '../components/ui'
import CrudPage from '../components/CrudPage'

/* ------------------------------- PROVEEDORES ------------------------------- */
export function SuppliersPage() {
  const { role } = useAuth()
  return (
    <CrudPage table="suppliers" title="Proveedores" itemName="proveedor" newLabel="Nuevo proveedor" canDelete={role === 'admin'}
      searchKeys={['name', 'company', 'nit', 'contact', 'phone']}
      columns={[
        { key: 'name', label: 'Nombre', className: 'font-semibold' }, { key: 'company', label: 'Empresa' }, { key: 'nit', label: 'NIT' },
        { key: 'phone', label: 'Teléfono' }, { key: 'contact', label: 'Contacto' }, { key: 'email', label: 'Correo' },
      ]}
      fields={[
        { key: 'name', label: 'Nombre', required: true }, { key: 'company', label: 'Empresa' }, { key: 'nit', label: 'NIT' },
        { key: 'phone', label: 'Teléfono', type: 'tel' }, { key: 'email', label: 'Correo', type: 'email' }, { key: 'contact', label: 'Persona de contacto' },
        { key: 'address', label: 'Dirección', full: true }, { key: 'notes', label: 'Observaciones', type: 'textarea' },
      ]} />
  )
}

/* -------------------------------- ALMACENES -------------------------------- */
export function WarehousesPage() {
  return (
    <CrudPage table="warehouses" title="Almacenes" itemName="almacén" newLabel="Nuevo almacén" orderBy={{ col: 'name', asc: true }}
      columns={[
        { key: 'name', label: 'Nombre', className: 'font-semibold' }, { key: 'description', label: 'Descripción' },
        { key: 'active', label: 'Estado', render: (r) => (r.active ? <Badge tone="bg-emerald-100 text-emerald-800">Activo</Badge> : <Badge>Inactivo</Badge>) },
      ]}
      fields={[
        { key: 'name', label: 'Nombre', required: true }, { key: 'description', label: 'Descripción', type: 'textarea' },
        { key: 'active', label: 'Almacén activo', type: 'checkbox' },
      ]} />
  )
}

/* ------------------------------- HERRAMIENTAS ------------------------------- */
const TOOL_ACTIONS: Record<string, string> = { prestamo: 'Prestar a un responsable', devolucion: 'Registrar devolución', mantenimiento: 'Enviar a mantenimiento', danada: 'Marcar como dañada', baja: 'Dar de baja', otro: 'Otra nota' }
const ACTION_TO_STATUS: Record<string, string | null> = { prestamo: 'prestada', devolucion: 'disponible', mantenimiento: 'mantenimiento', danada: 'danada', baja: 'baja', otro: null }

function ToolMoveModal({ tool, onClose, onSaved }: { tool: any; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [action, setAction] = useState('prestamo')
  const [holder, setHolder] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const people = useOptions({ table: 'profiles', label: 'full_name', filter: (q) => q.neq('role', 'cliente').eq('active', true) })
  const save = async () => {
    if (action === 'prestamo' && !holder) return toast('Elige quién recibe la herramienta', 'error')
    setBusy(true)
    try {
      const st = ACTION_TO_STATUS[action]
      const newHolder = action === 'prestamo' ? holder : action === 'otro' ? tool.holder_id : null
      if (st) {
        const { error } = await supabase.from('tools').update({ status: st, holder_id: newHolder }).eq('id', tool.id)
        if (error) throw error
      }
      const { error: e2 } = await supabase.from('tool_movements').insert({ tool_id: tool.id, action, holder_id: newHolder, notes: notes || null })
      if (e2) throw e2
      toast('Movimiento registrado'); onSaved(); onClose()
    } catch (e) { toast(errMsg(e), 'error') }
    setBusy(false)
  }
  return (
    <Modal open onClose={onClose} title={`Movimiento · ${tool.name}`}
      footer={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy} onClick={save}>Guardar</button></>}>
      <div className="grid gap-3">
        <Field label="¿Qué ocurrió?"><select className="input" value={action} onChange={(e) => setAction(e.target.value)}>{Object.entries(TOOL_ACTIONS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        {action === 'prestamo' && <Field label="Responsable"><select className="input" value={holder} onChange={(e) => setHolder(e.target.value)}><option value="">Seleccionar…</option>{people.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></Field>}
        <Field label="Observaciones"><textarea className="input min-h-[70px]" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

function ToolHistory({ tool, onClose }: { tool: any; onClose: () => void }) {
  const { data, loading } = useQuery(async () => {
    const { data } = await supabase.from('tool_movements').select('*, holder:profiles!holder_id(full_name), by:profiles!created_by(full_name)').eq('tool_id', tool.id).order('created_at', { ascending: false })
    return (data || []) as any[]
  }, [tool.id])
  return (
    <Modal open onClose={onClose} title={`Historial · ${tool.name}`}>
      {loading ? <Loading /> : !data || data.length === 0 ? <Empty text="Sin movimientos registrados." /> : (
        <ul className="divide-y divide-steel-100">{data.map((m) => (
          <li key={m.id} className="py-2 text-sm"><b>{TOOL_ACTIONS[m.action]}</b>{m.holder?.full_name && <> · {m.holder.full_name}</>}
            <div className="text-xs text-steel-400">{fmtDateTime(m.created_at)}{m.by?.full_name ? ` · registró ${m.by.full_name}` : ''}</div>{m.notes && <div className="text-steel-600">{m.notes}</div>}</li>
        ))}</ul>
      )}
    </Modal>
  )
}

export function ToolsPage() {
  const { role } = useAuth()
  const manage = role === 'admin' || role === 'almacenero'
  const [move, setMove] = useState<any>(null)
  const [hist, setHist] = useState<any>(null)
  const [tick, setTick] = useState(0)
  return (
    <>
      <CrudPage key={tick} table="tools" title="Herramientas" itemName="herramienta" newLabel="Nueva herramienta"
        subtitle={manage ? 'Controla quién tiene cada herramienta' : 'Consulta de herramientas del taller'}
        select="*, holder:profiles!holder_id(full_name)" canCreate={manage} canEdit={manage} canDelete={role === 'admin'}
        searchKeys={['code', 'name', 'brand', 'model', 'location', 'holder.full_name']} orderBy={{ col: 'name', asc: true }}
        columns={[
          { key: 'code', label: 'Código' }, { key: 'name', label: 'Herramienta', className: 'font-semibold' }, { key: 'brand', label: 'Marca' },
          { key: 'status', label: 'Estado', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'holder', label: 'Responsable', render: (r) => r.holder?.full_name || '—' }, { key: 'location', label: 'Ubicación' },
        ]}
        rowActions={(r) => (
          <>
            {manage && <button className="btn-secondary btn-sm" onClick={() => setMove(r)}><Repeat className="h-3.5 w-3.5" /> Mover</button>}
            <button className="btn-ghost btn-sm" onClick={() => setHist(r)} aria-label="Historial"><History className="h-4 w-4" /></button>
          </>
        )}
        fields={[
          { key: 'code', label: 'Código' }, { key: 'name', label: 'Nombre', required: true }, { key: 'brand', label: 'Marca' }, { key: 'model', label: 'Modelo' },
          { key: 'location', label: 'Ubicación' }, { key: 'acquired_at', label: 'Fecha de adquisición', type: 'date' },
          { key: 'notes', label: 'Observaciones', type: 'textarea' },
        ]}
        defaults={{ status: 'disponible' }} />
      {move && <ToolMoveModal tool={move} onClose={() => setMove(null)} onSaved={() => setTick((t) => t + 1)} />}
      {hist && <ToolHistory tool={hist} onClose={() => setHist(null)} />}
    </>
  )
}

/* ------------------------------- MANTENIMIENTOS ------------------------------- */
const waLink = (phone: string | null, text: string) => {
  const d = (phone || '').replace(/\D/g, '')
  if (!d) return null
  return `https://wa.me/${d.length === 8 ? '591' + d : d}?text=${encodeURIComponent(text)}`
}

export function MaintenancePage() {
  const { role } = useAuth()
  const toast = useToast()
  const staff = role === 'admin' || role === 'recepcionista'
  const [filter, setFilter] = useState<'pend' | 'hechos' | 'todos'>('pend')
  const [search, setSearch] = useState('')
  const [edit, setEdit] = useState<any>(null)
  const { data, loading, reload } = useQuery(async () => {
    const { data, error } = await supabase.from('maintenance_schedules')
      .select('*, vehicle:vehicles(plate, brand, model, mileage), customer:customers(full_name, phone, user_id)').order('next_date', { ascending: true, nullsFirst: false }).limit(1000)
    if (error) throw error
    return data as any[]
  }, [])
  const vehicles = useOptions(staff ? { table: 'vehicles', select: '*, customer:customers(full_name)', order: 'plate', label: (v) => `${v.plate} · ${v.brand} ${v.model} — ${v.customer?.full_name}` } : null)

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase()
    return (data || []).filter((m) => (filter === 'todos' || (filter === 'pend' ? !m.done : m.done)) &&
      (!s || [m.service_name, m.vehicle?.plate, m.customer?.full_name].some((x) => String(x || '').toLowerCase().includes(s))))
  }, [data, filter, search])

  const save = async () => {
    if (!edit.vehicle_id || !edit.service_name?.trim()) return toast('Elige el vehículo y escribe el servicio', 'error')
    const v = vehicles.find((x) => x.value === edit.vehicle_id)?.row
    const payload: any = {
      vehicle_id: edit.vehicle_id, customer_id: v?.customer_id ?? edit.customer_id, service_name: edit.service_name.trim(),
      last_date: edit.last_date || null, last_km: edit.last_km === '' || edit.last_km == null ? null : Number(edit.last_km),
      next_date: edit.next_date || null, next_km: edit.next_km === '' || edit.next_km == null ? null : Number(edit.next_km), notes: edit.notes || null,
    }
    const { error } = edit.id ? await supabase.from('maintenance_schedules').update(payload).eq('id', edit.id) : await supabase.from('maintenance_schedules').insert(payload)
    if (error) return toast(errMsg(error), 'error')
    toast('Mantenimiento guardado'); setEdit(null); reload()
  }
  const toggleDone = async (m: any) => {
    const { error } = await supabase.from('maintenance_schedules').update({ done: !m.done }).eq('id', m.id)
    if (error) toast(errMsg(error), 'error'); else reload()
  }
  const remove = async (m: any) => {
    if (!confirmAsk('¿Eliminar este mantenimiento programado?')) return
    const { error } = await supabase.from('maintenance_schedules').delete().eq('id', m.id)
    if (error) toast(errMsg(error), 'error'); else reload()
  }
  const remind = async (m: any) => {
    const text = `Hola ${m.customer?.full_name}, te recordamos que tu vehículo ${m.vehicle?.plate} tiene programado: ${m.service_name}${m.next_date ? ' (' + fmtDate(m.next_date) + ')' : ''}. ¡Agenda tu cita con nosotros!`
    if (m.customer?.user_id) {
      const { error } = await supabase.from('notifications').insert({ user_id: m.customer.user_id, title: `Mantenimiento próximo: ${m.service_name}`, body: `${m.vehicle?.plate}${m.next_date ? ' · ' + fmtDate(m.next_date) : ''}`, link: '/mantenimientos' })
      if (error) return toast(errMsg(error), 'error')
      toast('Recordatorio enviado a la app del cliente')
    } else toast('Este cliente no tiene cuenta en la app; usa el botón de WhatsApp.', 'error')
    void text
  }

  return (
    <div>
      <PageHeader title="Mantenimientos programados" subtitle={staff ? 'Programa y recuerda los próximos servicios' : 'Los próximos servicios de tus vehículos'}
        actions={staff && <button className="btn-primary" onClick={() => setEdit({ service_name: '', last_date: todayISO() })}><Plus className="h-4 w-4" /> Programar</button>} />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-steel-100 p-3">
          <SearchBox value={search} onChange={setSearch} placeholder="Buscar por placa, cliente, servicio…" />
          <select className="input w-auto" value={filter} onChange={(e) => setFilter(e.target.value as any)}>
            <option value="pend">Pendientes</option><option value="hechos">Realizados</option><option value="todos">Todos</option>
          </select>
        </div>
        {loading ? <Loading /> : rows.length === 0 ? <Empty text="No hay mantenimientos para mostrar." /> : (
          <TableWrap>
            <thead><tr><th className="th">Vehículo</th>{staff && <th className="th">Cliente</th>}<th className="th">Servicio</th><th className="th">Último</th><th className="th">Próximo</th><th className="th">Estado</th>{staff && <th className="th" />}</tr></thead>
            <tbody className="divide-y divide-steel-100">
              {rows.map((m) => {
                const late = !m.done && m.next_date && m.next_date < todayISO()
                const wa = waLink(m.customer?.phone, `Hola ${m.customer?.full_name}, te recordamos que tu vehículo ${m.vehicle?.plate} tiene programado: ${m.service_name}${m.next_date ? ' (' + fmtDate(m.next_date) + ')' : ''}.`)
                return (
                  <tr key={m.id}>
                    <td className="td font-semibold">{m.vehicle?.plate} <span className="font-normal text-steel-400">{m.vehicle?.brand} {m.vehicle?.model}</span></td>
                    {staff && <td className="td">{m.customer?.full_name}</td>}
                    <td className="td">{m.service_name}</td>
                    <td className="td whitespace-nowrap text-steel-500">{fmtDate(m.last_date)}{m.last_km != null && <> · {fmtNum(m.last_km)} km</>}</td>
                    <td className={`td whitespace-nowrap ${late ? 'font-semibold text-red-600' : ''}`}>{fmtDate(m.next_date)}{m.next_km != null && <> · {fmtNum(m.next_km)} km</>}</td>
                    <td className="td">{m.done ? <Badge tone="bg-emerald-100 text-emerald-800">Realizado</Badge> : late ? <Badge tone="bg-red-100 text-red-700">Vencido</Badge> : <Badge tone="bg-sky-100 text-sky-800">Pendiente</Badge>}</td>
                    {staff && (
                      <td className="td"><div className="flex justify-end gap-1">
                        {!m.done && <button className="btn-ghost btn-sm" title="Recordar en la app" onClick={() => remind(m)}><BellRing className="h-4 w-4" /></button>}
                        {!m.done && wa && <a className="btn-ghost btn-sm text-emerald-700" title="Recordar por WhatsApp" href={wa} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /></a>}
                        <button className="btn-ghost btn-sm" title={m.done ? 'Reabrir' : 'Marcar como realizado'} onClick={() => toggleDone(m)}><CheckCircle2 className="h-4 w-4" /></button>
                        <button className="btn-ghost btn-sm" onClick={() => setEdit({ ...m })} aria-label="Editar"><Pencil className="h-4 w-4" /></button>
                        {role === 'admin' && <button className="btn-ghost btn-sm text-red-600" onClick={() => remove(m)} aria-label="Eliminar"><Trash2 className="h-4 w-4" /></button>}
                      </div></td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar mantenimiento' : 'Programar mantenimiento'}
        footer={<><button className="btn-secondary" onClick={() => setEdit(null)}>Cancelar</button><button className="btn-primary" onClick={save}>Guardar</button></>}>
        {edit && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Vehículo *" className="sm:col-span-2"><select className="input" value={edit.vehicle_id || ''} disabled={!!edit.id} onChange={(e) => setEdit({ ...edit, vehicle_id: e.target.value })}><option value="">Seleccionar…</option>{vehicles.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}</select></Field>
            <Field label="Servicio *" className="sm:col-span-2"><input className="input" list="mtto-list" value={edit.service_name} onChange={(e) => setEdit({ ...edit, service_name: e.target.value })} placeholder="Cambio de aceite" />
              <datalist id="mtto-list">{['Cambio de aceite', 'Cambio de filtros', 'Frenos', 'Correa', 'Batería', 'Lubricación', 'Mantenimiento general'].map((s) => <option key={s} value={s} />)}</datalist></Field>
            <Field label="Último servicio (fecha)"><input className="input" type="date" value={edit.last_date || ''} onChange={(e) => setEdit({ ...edit, last_date: e.target.value })} /></Field>
            <Field label="Último servicio (km)"><input className="input" type="number" value={edit.last_km ?? ''} onChange={(e) => setEdit({ ...edit, last_km: e.target.value })} /></Field>
            <Field label="Próximo (fecha)"><input className="input" type="date" value={edit.next_date || ''} onChange={(e) => setEdit({ ...edit, next_date: e.target.value })} /></Field>
            <Field label="Próximo (km)"><input className="input" type="number" value={edit.next_km ?? ''} onChange={(e) => setEdit({ ...edit, next_km: e.target.value })} /></Field>
            <Field label="Observaciones" className="sm:col-span-2"><textarea className="input min-h-[70px]" value={edit.notes || ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
    </div>
  )
}
