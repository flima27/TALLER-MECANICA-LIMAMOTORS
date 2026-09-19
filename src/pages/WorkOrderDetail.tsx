import { useState, useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Play, Pause, CheckCircle2, Search, Plus, MapPin, FilePlus2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useQuery, useOptions } from '../lib/hooks'
import { ORDER_STATUS, ORDER_ORIGIN, PAY_METHOD, opts } from '../lib/constants'
import { fmtDateTime, fmtMoney, orderNo, quoteNo, errMsg, fmtDate, mapsLink } from '../lib/util'
import { Card, Empty, Field, KV, Loading, PageHeader, StatusBadge, TableWrap, Tabs, useToast, confirmAsk } from '../components/ui'
import ItemsEditor from '../components/ItemsEditor'
import FileManager from '../components/Files'
import PaymentModal from '../components/PaymentModal'

const KINDS_REPUESTO = ['repuesto']
const KINDS_LUBR = ['lubricante']
const KINDS_MAT = ['material']
const KINDS_TRABAJO = ['servicio', 'mano_obra', 'otro']

export default function WorkOrderDetail() {
  const { id, tab: tabParam } = useParams()
  const { role, base, profile } = useAuth()
  const nav = useNavigate()
  const toast = useToast()
  const isStaff = role === 'admin' || role === 'recepcionista'
  const isMech = role === 'mecanico'
  const isClient = role === 'cliente'
  const listPath = isMech ? `${base}/trabajos` : `${base}/ordenes`

  const { data: order, loading, reload } = useQuery(async () => {
    const { data, error } = await supabase.from('work_orders')
      .select('*, customer:customers(*), vehicle:vehicles(*), mechanic:profiles!mechanic_id(id, full_name)')
      .eq('id', id!).maybeSingle()
    if (error) throw error
    return data as any
  }, [id])
  const { data: items, reload: reloadItems } = useQuery(async () => {
    const { data, error } = await supabase.from('work_order_items').select('*').eq('order_id', id!).order('created_at')
    if (error) throw error
    return data as any[]
  }, [id])
  const { data: bal, reload: reloadBal } = useQuery(async () => {
    const { data } = await supabase.from('order_balances').select('*').eq('order_id', id!).maybeSingle()
    return data as any
  }, [id])
  const { data: payments, reload: reloadPay } = useQuery(async () => {
    if (role === 'mecanico' || role === 'almacenero') return []
    const { data } = await supabase.from('payments').select('*').eq('order_id', id!).order('paid_at', { ascending: false })
    return (data || []) as any[]
  }, [id])
  const { data: quotes, reload: reloadQuotes } = useQuery(async () => {
    if (role === 'mecanico' || role === 'almacenero') return []
    const { data } = await supabase.from('quotations').select('*').eq('order_id', id!).order('created_at', { ascending: false })
    return (data || []) as any[]
  }, [id])
  const mechanics = useOptions(isStaff ? { table: 'profiles', label: 'full_name', filter: (q) => q.eq('role', 'mecanico').eq('active', true) } : null)

  const [payOpen, setPayOpen] = useState(false)
  const [form, setForm] = useState<any>({})
  useEffect(() => {
    if (order) setForm({
      mileage: order.mileage ?? '', reported_problem: order.reported_problem ?? '', initial_diagnosis: order.initial_diagnosis ?? '',
      diagnosis: order.diagnosis ?? '', work_done: order.work_done ?? '', observations: order.observations ?? '',
    })
  }, [order?.id, order?.reported_problem, order?.diagnosis, order?.work_done])

  if (loading && !order) return <Loading />
  if (!order) return <Empty text="No encontramos esta orden o no tienes acceso a ella."><Link className="btn-secondary" to={listPath}>Volver</Link></Empty>

  const tabs = isStaff
    ? [['resumen', 'Resumen'], ['diagnostico', 'Diagnóstico'], ['items', 'Servicios y repuestos'], ['fotos', 'Fotografías'], ['cotizaciones', 'Cotizaciones'], ['pagos', 'Pagos']]
    : isMech
    ? [['resumen', 'Resumen'], ['diagnostico', 'Diagnóstico'], ['trabajos-realizados', 'Trabajos realizados'], ['repuestos', 'Repuestos'], ['lubricantes', 'Lubricantes'], ['materiales', 'Materiales'], ['fotos', 'Fotografías'], ['finalizar', 'Finalización']]
    : isClient
    ? [['resumen', 'Resumen'], ['items', 'Trabajos y costos'], ['fotos', 'Fotografías'], ['cotizaciones', 'Cotizaciones'], ['pagos', 'Pagos']]
    : [['resumen', 'Resumen'], ['items', 'Productos utilizados']]
  const tab = tabs.some((t) => t[0] === tabParam) ? tabParam! : 'resumen'
  const goTab = (t: string) => nav(`${listPath}/${id}${t === 'resumen' ? '' : '/' + t}`)
  const closed = ['entregada', 'cancelada'].includes(order.status)
  const canEditItems = (isStaff || (isMech && order.mechanic_id === profile?.id)) && (!closed || role === 'admin')
  const reloadAll = () => { reload(); reloadItems(); reloadBal(); reloadPay(); reloadQuotes() }

  const patch = async (fields: any, msg = 'Cambios guardados') => {
    const { error } = await supabase.from('work_orders').update(fields).eq('id', order.id)
    if (error) return toast(errMsg(error), 'error')
    toast(msg); reload(); reloadBal()
  }
  const changeStatus = async (s: string) => {
    if (s === 'entregada' && bal && Number(bal.total) - Number(bal.paid) > 0.009 &&
      !confirmAsk(`La orden tiene un saldo pendiente de ${fmtMoney(Number(bal.total) - Number(bal.paid))}. ¿Entregar de todas formas?`)) return
    await patch({ status: s }, 'Estado actualizado')
  }
  const addItem = async (it: any) => {
    const { error } = await supabase.from('work_order_items').insert({ ...it, order_id: order.id })
    if (error) throw new Error(errMsg(error))
    reloadItems(); reloadBal()
  }
  const removeItem = async (it: any) => {
    const { error } = await supabase.from('work_order_items').delete().eq('id', it.id)
    if (error) throw new Error(errMsg(error))
    reloadItems(); reloadBal()
  }

  const newQuotation = async () => {
    const { data: q, error } = await supabase.from('quotations').insert({
      order_id: order.id, customer_id: order.customer_id, vehicle_id: order.vehicle_id, status: 'borrador',
    }).select().single()
    if (error) return toast(errMsg(error), 'error')
    if (items && items.length) {
      await supabase.from('quotation_items').insert(items.map((i: any) => ({
        quotation_id: q.id, kind: i.kind, service_id: i.service_id, product_id: i.product_id, description: i.description, qty: i.qty, unit_price: i.unit_price,
      })))
    }
    nav(`${base}/cotizaciones/${q.id}`)
  }

  const copyQuoteToOrder = async (qid: string) => {
    if (!confirmAsk('Se copiarán a la orden los servicios, la mano de obra y otros conceptos de esta cotización. Los repuestos y lubricantes se agregan aparte para descontar del inventario. ¿Continuar?')) return
    const { data: qi } = await supabase.from('quotation_items').select('*').eq('quotation_id', qid).in('kind', KINDS_TRABAJO)
    if (!qi?.length) return toast('La cotización no tiene servicios ni mano de obra para copiar', 'error')
    const { error } = await supabase.from('work_order_items').insert(qi.map((i: any) => ({
      order_id: order.id, kind: i.kind, service_id: i.service_id, description: i.description, qty: i.qty, unit_price: i.unit_price,
    })))
    if (error) return toast(errMsg(error), 'error')
    toast('Ítems copiados a la orden'); reloadItems(); reloadBal()
  }

  const saveText = (keys: string[]) => patch(Object.fromEntries(keys.map((k) => [k, form[k] === '' ? null : k === 'mileage' ? Number(form[k]) : form[k]])))

  const saldo = bal ? Math.max(Number(bal.total) - Number(bal.paid), 0) : 0
  const emgLink = order.emergency_id ? `${base}/emergencias` : null

  return (
    <div>
      <Link to={listPath} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-steel-500 hover:text-ink"><ArrowLeft className="h-4 w-4" /> Volver</Link>
      <PageHeader
        title={`${orderNo(order.number)} · ${order.vehicle ? `${order.vehicle.brand} ${order.vehicle.model}` : 'Orden de trabajo'}`}
        subtitle={`${order.vehicle?.plate ? 'Placa ' + order.vehicle.plate + ' · ' : ''}${order.customer?.full_name || ''} · abierta ${fmtDateTime(order.opened_at)}`}
        actions={<StatusBadge status={order.status} />} />

      {(isStaff || isClient) && bal && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <div className="card px-4 py-2.5"><div className="text-xs text-steel-500">Total</div><div className="font-display text-2xl font-semibold">{fmtMoney(bal.total)}</div></div>
          <div className="card px-4 py-2.5"><div className="text-xs text-steel-500">Pagado</div><div className="font-display text-2xl font-semibold text-emerald-700">{fmtMoney(bal.paid)}</div></div>
          <div className="card px-4 py-2.5"><div className="text-xs text-steel-500">Saldo</div><div className={`font-display text-2xl font-semibold ${saldo > 0 ? 'text-red-600' : 'text-steel-500'}`}>{fmtMoney(saldo)}</div></div>
        </div>
      )}

      <Tabs tabs={tabs.map(([value, label]) => ({ value, label }))} value={tab} onChange={goTab} />

      {tab === 'resumen' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Datos de la orden" className="lg:col-span-2">
            <dl className="grid gap-4 p-4 sm:grid-cols-2">
              <KV label="Cliente">{order.customer ? <>{order.customer.full_name}{order.customer.phone && <span className="text-steel-500"> · {order.customer.phone}</span>}</> : null}</KV>
              <KV label="Vehículo">{order.vehicle ? `${order.vehicle.brand} ${order.vehicle.model} ${order.vehicle.year || ''} · ${order.vehicle.plate}` : null}</KV>
              <KV label="Origen">{ORDER_ORIGIN[order.origin]}</KV>
              <KV label="Mecánico responsable">{order.mechanic?.full_name || (order.mechanic_id ? 'Asignado' : null)}</KV>
              <KV label="Kilometraje">{order.mileage != null ? `${order.mileage.toLocaleString('es-BO')} km` : null}</KV>
              <KV label="Terminada">{order.finished_at ? fmtDateTime(order.finished_at) : null}</KV>
              <div className="sm:col-span-2"><KV label="Problema reportado"><span className="whitespace-pre-wrap">{order.reported_problem}</span></KV></div>
              {(order.diagnosis || order.initial_diagnosis) && <div className="sm:col-span-2"><KV label="Diagnóstico"><span className="whitespace-pre-wrap">{order.diagnosis || order.initial_diagnosis}</span></KV></div>}
              {order.work_done && <div className="sm:col-span-2"><KV label="Trabajo realizado"><span className="whitespace-pre-wrap">{order.work_done}</span></KV></div>}
              {emgLink && <div className="sm:col-span-2"><Link className="btn-secondary btn-sm" to={emgLink}><MapPin className="h-4 w-4" /> Esta orden nació de un auxilio 24/7</Link></div>}
            </dl>
          </Card>
          <div className="space-y-4">
            {isStaff && (
              <Card title="Gestión">
                <div className="space-y-3 p-4">
                  <Field label="Estado de la orden">
                    <select className="input" value={order.status} onChange={(e) => changeStatus(e.target.value)}>
                      {opts(ORDER_STATUS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Mecánico asignado">
                    <select className="input" value={order.mechanic_id || ''} onChange={(e) => patch({ mechanic_id: e.target.value || null }, 'Mecánico asignado')}>
                      <option value="">Sin asignar</option>
                      {mechanics.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Kilometraje"><input className="input" type="number" value={form.mileage ?? ''} onChange={(e) => setForm({ ...form, mileage: e.target.value })} onBlur={() => Number(form.mileage) !== Number(order.mileage ?? '') && saveText(['mileage'])} /></Field>
                  <Field label="Problema reportado">
                    <textarea className="input min-h-[80px]" value={form.reported_problem ?? ''} onChange={(e) => setForm({ ...form, reported_problem: e.target.value })} onBlur={() => form.reported_problem !== (order.reported_problem ?? '') && saveText(['reported_problem'])} />
                  </Field>
                </div>
              </Card>
            )}
            {isMech && !closed && (
              <Card title="Avance del trabajo">
                <div className="flex flex-wrap gap-2 p-4">
                  <button className="btn-secondary" onClick={() => patch({ status: 'diagnostico' }, 'Estado actualizado')}><Search className="h-4 w-4" /> Diagnóstico</button>
                  <button className="btn-primary" onClick={() => patch({ status: 'en_proceso' }, 'Trabajo en proceso')}><Play className="h-4 w-4" /> Iniciar</button>
                  <button className="btn-secondary" onClick={() => patch({ status: 'pausada' }, 'Trabajo pausado')}><Pause className="h-4 w-4" /> Pausar</button>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === 'diagnostico' && (
        <Card title="Diagnóstico">
          <div className="space-y-3 p-4">
            {isStaff && (
              <Field label="Diagnóstico inicial (recepción)">
                <textarea className="input min-h-[90px]" value={form.initial_diagnosis ?? ''} onChange={(e) => setForm({ ...form, initial_diagnosis: e.target.value })} />
              </Field>
            )}
            <Field label="Diagnóstico técnico (mecánico)">
              <textarea className="input min-h-[140px]" readOnly={!(isStaff || isMech)} value={form.diagnosis ?? ''} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} placeholder="Qué falla se encontró, causa probable y solución recomendada…" />
            </Field>
            {(isStaff || isMech) && !closed && (
              <div className="flex justify-end"><button className="btn-primary" onClick={() => saveText(isStaff ? ['initial_diagnosis', 'diagnosis'] : ['diagnosis'])}>Guardar diagnóstico</button></div>
            )}
          </div>
        </Card>
      )}

      {tab === 'items' && (
        <Card title={isClient ? 'Trabajos y costos' : role === 'almacenero' ? 'Productos utilizados en la orden' : 'Servicios, mano de obra y repuestos'}>
          <div className="p-4">
            <ItemsEditor items={items || []} readOnly={!canEditItems} useWarehouse onAdd={addItem} onRemove={removeItem}
              showOnly={role === 'almacenero' ? ['repuesto', 'lubricante', 'material'] : undefined}
              hidePrices={role === 'almacenero'} discount={order.discount} onDiscount={isStaff && !closed ? (v) => patch({ discount: v }) : undefined} />
          </div>
        </Card>
      )}

      {tab === 'trabajos-realizados' && (
        <div className="space-y-4">
          <Card title="Descripción del trabajo">
            <div className="space-y-3 p-4">
              <Field label="Trabajo realizado"><textarea className="input min-h-[110px]" value={form.work_done ?? ''} onChange={(e) => setForm({ ...form, work_done: e.target.value })} placeholder="Describe lo que se hizo…" /></Field>
              <Field label="Observaciones"><textarea className="input min-h-[70px]" value={form.observations ?? ''} onChange={(e) => setForm({ ...form, observations: e.target.value })} /></Field>
              {!closed && <div className="flex justify-end"><button className="btn-primary" onClick={() => saveText(['work_done', 'observations'])}>Guardar</button></div>}
            </div>
          </Card>
          <Card title="Servicios y horas de trabajo">
            <div className="p-4"><ItemsEditor items={items || []} readOnly={!canEditItems} kinds={KINDS_TRABAJO} showOnly={KINDS_TRABAJO} useWarehouse onAdd={addItem} onRemove={removeItem} hidePrices /></div>
          </Card>
        </div>
      )}
      {tab === 'repuestos' && <Card title="Repuestos utilizados"><div className="p-4"><ItemsEditor items={items || []} readOnly={!canEditItems} kinds={KINDS_REPUESTO} showOnly={KINDS_REPUESTO} useWarehouse onAdd={addItem} onRemove={removeItem} hidePrices /></div></Card>}
      {tab === 'lubricantes' && <Card title="Lubricantes utilizados"><div className="p-4"><ItemsEditor items={items || []} readOnly={!canEditItems} kinds={KINDS_LUBR} showOnly={KINDS_LUBR} useWarehouse onAdd={addItem} onRemove={removeItem} hidePrices /></div></Card>}
      {tab === 'materiales' && <Card title="Materiales utilizados"><div className="p-4"><ItemsEditor items={items || []} readOnly={!canEditItems} kinds={KINDS_MAT} showOnly={KINDS_MAT} useWarehouse onAdd={addItem} onRemove={removeItem} hidePrices /></div></Card>}

      {tab === 'fotos' && (
        <Card title="Fotografías del trabajo">
          <div className="p-4">
            <FileManager folder="trabajos" entityType="order" entityId={order.id} customerId={order.customer_id} phase readOnly={isClient || (closed && role !== 'admin')} />
          </div>
        </Card>
      )}

      {tab === 'cotizaciones' && (
        <Card title="Cotizaciones de esta orden" actions={isStaff && !closed ? <button className="btn-primary btn-sm" onClick={newQuotation}><FilePlus2 className="h-4 w-4" /> Nueva cotización</button> : undefined}>
          {!quotes || quotes.length === 0 ? <Empty text="Aún no hay cotizaciones para esta orden." /> : (
            <TableWrap>
              <thead><tr><th className="th">N°</th><th className="th">Fecha</th><th className="th">Estado</th><th className="th w-1" /></tr></thead>
              <tbody className="divide-y divide-steel-100">
                {quotes.map((q) => (
                  <tr key={q.id}>
                    <td className="td font-semibold">{quoteNo(q.number)}</td><td className="td">{fmtDate(q.created_at)}</td><td className="td"><StatusBadge status={q.status} /></td>
                    <td className="td"><div className="flex justify-end gap-1">
                      {isStaff && q.status === 'aprobada' && !closed && <button className="btn-secondary btn-sm" onClick={() => copyQuoteToOrder(q.id)}>Pasar servicios a la orden</button>}
                      <Link className="btn-secondary btn-sm" to={`${base}/cotizaciones${isClient ? '' : '/' + q.id}`}>Abrir</Link>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      )}

      {tab === 'pagos' && (
        <Card title="Pagos de esta orden" actions={isStaff ? <button className="btn-primary btn-sm" onClick={() => setPayOpen(true)}><Plus className="h-4 w-4" /> Registrar pago</button> : undefined}>
          {!payments || payments.length === 0 ? <Empty text="Todavía no se registraron pagos." /> : (
            <TableWrap>
              <thead><tr><th className="th">Fecha</th><th className="th">Método</th><th className="th">Estado</th><th className="th text-right">Monto</th></tr></thead>
              <tbody className="divide-y divide-steel-100">
                {payments.map((p) => (
                  <tr key={p.id}><td className="td">{fmtDateTime(p.paid_at)}</td><td className="td">{PAY_METHOD[p.method]}</td><td className="td"><StatusBadge status={p.status} /></td><td className="td text-right font-semibold">{fmtMoney(p.amount)}</td></tr>
                ))}
              </tbody>
            </TableWrap>
          )}
          <PaymentModal open={payOpen} onClose={() => setPayOpen(false)} onSaved={() => { reloadPay(); reloadBal() }} orderId={order.id} />
        </Card>
      )}

      {tab === 'finalizar' && (
        <Card title="Finalizar el trabajo">
          <div className="space-y-4 p-4">
            <ul className="space-y-1.5 text-sm">
              <li className={order.diagnosis ? 'text-emerald-700' : 'text-steel-500'}>{order.diagnosis ? '✔' : '○'} Diagnóstico técnico registrado</li>
              <li className={order.work_done ? 'text-emerald-700' : 'text-steel-500'}>{order.work_done ? '✔' : '○'} Trabajo realizado descrito</li>
              <li className={(items || []).length ? 'text-emerald-700' : 'text-steel-500'}>{(items || []).length ? '✔' : '○'} Servicios, repuestos o materiales registrados ({(items || []).length})</li>
            </ul>
            {closed || order.status === 'terminada' ? (
              <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Este trabajo ya está marcado como {ORDER_STATUS[order.status].toLowerCase()}. Recepción coordinará el pago y la entrega.</p>
            ) : (
              <button className="btn-primary" onClick={() => {
                if (!order.work_done) return toast('Primero describe el trabajo realizado (pestaña "Trabajos realizados")', 'error')
                if (confirmAsk('¿Marcar este trabajo como terminado? Se avisará a recepción y al cliente.')) patch({ status: 'terminada' }, 'Trabajo terminado')
              }}><CheckCircle2 className="h-4 w-4" /> Marcar como terminado</button>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
