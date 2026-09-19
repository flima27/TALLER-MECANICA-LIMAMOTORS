import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Plus, Send, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useQuery, useOptions } from '../lib/hooks'
import { QUOTE_STATUS, opts } from '../lib/constants'
import { errMsg, fmtDate, fmtDateTime, fmtMoney, orderNo, quoteNo } from '../lib/util'
import { Card, Empty, Field, KV, Loading, Modal, PageHeader, SearchBox, StatusBadge, TableWrap, useToast, confirmAsk } from '../components/ui'
import ItemsEditor, { itemsTotal } from '../components/ItemsEditor'

const totalOf = (q: any) => itemsTotal(q.quotation_items || [], q.discount).total

/* ------------------------------------------------------------------ */
/*  LISTADO (recepción / administrador)                                */
/* ------------------------------------------------------------------ */
export function QuotationsList() {
  const { base } = useAuth()
  const nav = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [open, setOpen] = useState(false)
  const { data, loading } = useQuery(async () => {
    const { data, error } = await supabase.from('quotations')
      .select('*, customer:customers(full_name), vehicle:vehicles(brand, model, plate), order:work_orders(number), quotation_items(qty, unit_price)')
      .order('created_at', { ascending: false }).limit(1000)
    if (error) throw error
    return data as any[]
  }, [])
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase()
    return (data || []).filter((q) => (!status || q.status === status) &&
      (!s || [quoteNo(q.number), q.customer?.full_name, q.vehicle?.plate].some((x) => String(x || '').toLowerCase().includes(s))))
  }, [data, search, status])

  return (
    <div>
      <PageHeader title="Cotizaciones" actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nueva cotización</button>} />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-steel-100 p-3">
          <SearchBox value={search} onChange={setSearch} placeholder="Buscar por N°, cliente o placa…" />
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos los estados</option>{opts(QUOTE_STATUS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {loading ? <Loading /> : rows.length === 0 ? <Empty text="No hay cotizaciones." /> : (
          <TableWrap>
            <thead><tr><th className="th">N°</th><th className="th">Fecha</th><th className="th">Cliente</th><th className="th">Vehículo</th><th className="th">Orden</th><th className="th text-right">Total</th><th className="th">Estado</th></tr></thead>
            <tbody className="divide-y divide-steel-100">
              {rows.map((q) => (
                <tr key={q.id} className="cursor-pointer hover:bg-steel-50" onClick={() => nav(`${base}/cotizaciones/${q.id}`)}>
                  <td className="td font-semibold">{quoteNo(q.number)}</td><td className="td">{fmtDate(q.created_at)}</td>
                  <td className="td">{q.customer?.full_name}</td><td className="td">{q.vehicle ? `${q.vehicle.brand} ${q.vehicle.model} · ${q.vehicle.plate}` : '—'}</td>
                  <td className="td">{q.order ? orderNo(q.order.number) : '—'}</td><td className="td text-right font-semibold">{fmtMoney(totalOf(q))}</td>
                  <td className="td"><StatusBadge status={q.status} /></td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
      {open && <NewQuotation onClose={() => setOpen(false)} onCreated={(id) => nav(`${base}/cotizaciones/${id}`)} />}
    </div>
  )
}

function NewQuotation({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast()
  const customers = useOptions({ table: 'customers', label: (r) => r.full_name + (r.phone ? ' · ' + r.phone : ''), order: 'full_name' })
  const [customerId, setCustomerId] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [vehicles, setVehicles] = useState<any[]>([])
  useEffect(() => {
    setVehicleId('')
    if (!customerId) return setVehicles([])
    supabase.from('vehicles').select('id, brand, model, plate').eq('customer_id', customerId).then(({ data }) => setVehicles(data || []))
  }, [customerId])
  const create = async () => {
    if (!customerId) return toast('Elige el cliente', 'error')
    const { data, error } = await supabase.from('quotations').insert({ customer_id: customerId, vehicle_id: vehicleId || null, status: 'borrador' }).select().single()
    if (error) return toast(errMsg(error), 'error')
    onCreated(data.id)
  }
  return (
    <Modal open onClose={onClose} title="Nueva cotización" footer={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={create}>Crear y agregar ítems</button></>}>
      <div className="space-y-3">
        <Field label="Cliente *"><select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">Seleccionar…</option>{customers.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></Field>
        <Field label="Vehículo"><select className="input" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}><option value="">Sin vehículo específico</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.brand} {v.model} · {v.plate}</option>)}</select></Field>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/*  DETALLE / EDITOR (recepción / administrador)                       */
/* ------------------------------------------------------------------ */
export function QuotationDetail() {
  const { id } = useParams()
  const { base, profile } = useAuth()
  const toast = useToast()
  const { data: q, loading, reload } = useQuery(async () => {
    const { data, error } = await supabase.from('quotations')
      .select('*, customer:customers(full_name, phone), vehicle:vehicles(brand, model, plate), order:work_orders(id, number, status), decider:profiles!decided_by(full_name)')
      .eq('id', id!).maybeSingle()
    if (error) throw error
    return data as any
  }, [id])
  const { data: items, reload: reloadItems } = useQuery(async () => {
    const { data } = await supabase.from('quotation_items').select('*').eq('quotation_id', id!).order('created_at')
    return (data || []) as any[]
  }, [id])
  const [notes, setNotes] = useState('')
  const [valid, setValid] = useState('')
  useEffect(() => { if (q) { setNotes(q.notes || ''); setValid(q.valid_until || '') } }, [q?.id])

  if (loading && !q) return <Loading />
  if (!q) return <Empty text="Cotización no encontrada." />
  const editable = q.status === 'borrador'
  const { sub, total } = itemsTotal(items || [], q.discount)

  const patch = async (f: any, msg = 'Guardado') => {
    const { error } = await supabase.from('quotations').update(f).eq('id', q.id)
    if (error) return toast(errMsg(error), 'error')
    toast(msg); reload()
  }
  const setOrder = async (status: string) => { if (q.order) await supabase.from('work_orders').update({ status }).eq('id', q.order.id).in('status', ['abierta', 'diagnostico', 'cotizacion']) }
  const send = async () => {
    if (!(items || []).length) return toast('Agrega al menos un ítem antes de enviar', 'error')
    await patch({ status: 'enviada' }, 'Cotización enviada al cliente'); await setOrder('cotizacion')
  }
  const decide = async (approve: boolean) => {
    if (!confirmAsk(approve ? '¿Registrar que el cliente APROBÓ esta cotización?' : '¿Registrar que el cliente la RECHAZÓ?')) return
    await patch({ status: approve ? 'aprobada' : 'rechazada', decided_at: new Date().toISOString(), decided_by: profile?.id, decision_note: 'Registrado por recepción' }, approve ? 'Aprobación registrada' : 'Rechazo registrado')
    await setOrder(approve ? 'aprobada' : 'diagnostico')
  }

  return (
    <div>
      <Link to={`${base}/cotizaciones`} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-steel-500 hover:text-ink"><ArrowLeft className="h-4 w-4" /> Volver</Link>
      <PageHeader title={quoteNo(q.number)} subtitle={`${q.customer?.full_name || ''}${q.vehicle ? ' · ' + q.vehicle.brand + ' ' + q.vehicle.model + ' ' + q.vehicle.plate : ''}`}
        actions={<><StatusBadge status={q.status} label={QUOTE_STATUS[q.status]} />
          {q.status === 'borrador' && <button className="btn-primary" onClick={send}><Send className="h-4 w-4" /> Enviar al cliente</button>}
          {q.status === 'enviada' && <>
            <button className="btn-primary" onClick={() => decide(true)}><Check className="h-4 w-4" /> Registrar aprobación</button>
            <button className="btn-secondary" onClick={() => decide(false)}><X className="h-4 w-4" /> Registrar rechazo</button>
            <button className="btn-ghost" onClick={() => patch({ status: 'borrador' }, 'Vuelve a borrador')}>Volver a borrador</button>
          </>}
          {q.status === 'rechazada' && <button className="btn-secondary" onClick={() => patch({ status: 'borrador', decided_at: null, decided_by: null, decision_note: null }, 'Vuelve a borrador')}>Reabrir como borrador</button>}
        </>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Ítems" className="lg:col-span-2">
          <div className="p-4">
            <ItemsEditor items={items || []} readOnly={!editable} discount={q.discount} onDiscount={editable ? (v) => patch({ discount: v }) : undefined}
              onAdd={async (it) => { const { error } = await supabase.from('quotation_items').insert({ kind: it.kind, description: it.description, qty: it.qty, unit_price: it.unit_price, service_id: it.service_id, product_id: it.product_id, quotation_id: q.id }); if (error) throw new Error(errMsg(error)); reloadItems() }}
              onRemove={async (it) => { const { error } = await supabase.from('quotation_items').delete().eq('id', it.id); if (error) throw new Error(errMsg(error)); reloadItems() }} />
          </div>
        </Card>
        <div className="space-y-4">
          <Card title="Datos">
            <dl className="space-y-3 p-4">
              <KV label="Orden de trabajo">{q.order ? <Link className="font-semibold text-amber-700 underline" to={`${base}/ordenes/${q.order.id}`}>{orderNo(q.order.number)}</Link> : null}</KV>
              <KV label="Total">{fmtMoney(total)}</KV>
              <Field label="Válida hasta"><input className="input" type="date" value={valid} disabled={!editable} onChange={(e) => setValid(e.target.value)} onBlur={() => valid !== (q.valid_until || '') && patch({ valid_until: valid || null })} /></Field>
              <Field label="Notas para el cliente"><textarea className="input min-h-[80px]" value={notes} disabled={!editable} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (q.notes || '') && patch({ notes: notes || null })} /></Field>
            </dl>
          </Card>
          {q.decided_at && (
            <Card title="Respuesta del cliente">
              <dl className="space-y-3 p-4">
                <KV label="Decisión"><StatusBadge status={q.status} /></KV>
                <KV label="Fecha">{fmtDateTime(q.decided_at)}</KV>
                <KV label="Registrado por">{q.decider?.full_name}</KV>
                <KV label="Comentario">{q.decision_note}</KV>
              </dl>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  PORTAL DEL CLIENTE                                                 */
/* ------------------------------------------------------------------ */
export function ClientQuotations() {
  const toast = useToast()
  const [reply, setReply] = useState<{ q: any; approve: boolean } | null>(null)
  const [note, setNote] = useState('')
  const { data, loading, reload } = useQuery(async () => {
    const { data, error } = await supabase.from('quotations')
      .select('*, vehicle:vehicles(brand, model, plate), order:work_orders(number), quotation_items(*)')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data as any[]
  }, [])
  const send = async () => {
    if (!reply) return
    const { error } = await supabase.rpc('respond_quotation', { p_id: reply.q.id, p_approve: reply.approve, p_note: note || null })
    if (error) return toast(errMsg(error), 'error')
    toast(reply.approve ? 'Aprobaste la cotización. ¡Gracias!' : 'Rechazaste la cotización'); setReply(null); setNote(''); reload()
  }
  return (
    <div>
      <PageHeader title="Cotizaciones" subtitle="Revisa los precios y aprueba o rechaza antes de que empiece el trabajo" />
      {loading ? <Loading /> : !data?.length ? <Card><Empty text="No tienes cotizaciones por ahora." /></Card> : (
        <div className="space-y-4">
          {data.map((q) => (
            <Card key={q.id} title={`${quoteNo(q.number)}${q.vehicle ? ' · ' + q.vehicle.brand + ' ' + q.vehicle.model : ''}`} actions={<StatusBadge status={q.status} />}>
              <div className="p-4">
                <p className="mb-2 text-xs text-steel-500">Emitida el {fmtDate(q.created_at)}{q.valid_until ? ` · válida hasta ${fmtDate(q.valid_until)}` : ''}{q.order ? ` · ${orderNo(q.order.number)}` : ''}</p>
                <ItemsEditor items={q.quotation_items || []} readOnly discount={q.discount} onAdd={async () => {}} onRemove={async () => {}} />
                {q.notes && <p className="mt-3 rounded-md bg-steel-50 p-3 text-sm">{q.notes}</p>}
                {q.status === 'enviada' && (
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <button className="btn-secondary" onClick={() => setReply({ q, approve: false })}><X className="h-4 w-4" /> Rechazar</button>
                    <button className="btn-primary" onClick={() => setReply({ q, approve: true })}><Check className="h-4 w-4" /> Aprobar cotización</button>
                  </div>
                )}
                {q.decided_at && <p className="mt-3 text-xs text-steel-500">Respondiste el {fmtDateTime(q.decided_at)}</p>}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={!!reply} onClose={() => setReply(null)} title={reply?.approve ? 'Aprobar cotización' : 'Rechazar cotización'}
        footer={<><button className="btn-secondary" onClick={() => setReply(null)}>Cancelar</button><button className={reply?.approve ? 'btn-primary' : 'btn-danger'} onClick={send}>{reply?.approve ? 'Sí, aprobar' : 'Sí, rechazar'}</button></>}>
        <p className="mb-3 text-sm text-steel-600">
          {reply?.approve ? 'Al aprobar autorizas al taller a realizar el trabajo según esta cotización.' : 'Puedes contarnos el motivo para ajustar la propuesta.'}
        </p>
        <Field label="Comentario (opcional)"><textarea className="input min-h-[80px]" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </Modal>
    </div>
  )
}
