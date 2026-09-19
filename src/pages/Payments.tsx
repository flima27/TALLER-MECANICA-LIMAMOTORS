import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Ban, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useQuery } from '../lib/hooks'
import { PAY_METHOD, PAY_STATUS, opts } from '../lib/constants'
import { errMsg, fmtDateTime, fmtMoney, orderNo } from '../lib/util'
import { Card, Empty, Loading, PageHeader, SearchBox, Stat, StatusBadge, TableWrap, useToast, confirmAsk } from '../components/ui'
import PaymentModal from '../components/PaymentModal'

export function PaymentsPage() {
  const { role, base } = useAuth()
  const toast = useToast()
  const staff = role === 'admin' || role === 'recepcionista'
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [method, setMethod] = useState('')
  const [status, setStatus] = useState('')
  const { data, loading, error, reload } = useQuery(async () => {
    const [p, b] = await Promise.all([
      supabase.from('payments').select('*, customer:customers(full_name), order:work_orders(id, number)').order('paid_at', { ascending: false }).limit(1000),
      supabase.from('order_balances').select('order_id, number, total, paid, status').neq('status', 'cancelada').limit(2000),
    ])
    if (p.error) throw p.error
    return { pays: (p.data || []) as any[], debts: ((b.data || []) as any[]).filter((x) => Number(x.total) - Number(x.paid) > 0.009) }
  }, [])
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase()
    return (data?.pays || []).filter((p) => (!method || p.method === method) && (!status || p.status === status) &&
      (!s || [p.customer?.full_name, orderNo(p.order?.number), p.notes].some((x) => String(x || '').toLowerCase().includes(s))))
  }, [data, search, method, status])
  const sum = rows.filter((p) => p.status === 'pagado').reduce((a, p) => a + Number(p.amount), 0)
  const pending = (data?.debts || []).reduce((a, x) => a + Number(x.total) - Number(x.paid), 0)

  const annul = async (p: any) => {
    if (!confirmAsk('¿Anular este pago? Dejará de contarse en el saldo de la orden.')) return
    const { error } = await supabase.from('payments').update({ status: 'anulado' }).eq('id', p.id)
    if (error) toast(errMsg(error), 'error'); else { toast('Pago anulado'); reload() }
  }

  return (
    <div>
      <PageHeader title="Pagos" subtitle={staff ? 'Cobros registrados y saldos pendientes' : 'Tus pagos y saldos por orden'}
        actions={staff && <button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Registrar pago</button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label={staff ? 'Total cobrado (filtro actual)' : 'Total pagado'} value={fmtMoney(sum)} tone="text-emerald-700" />
        <Stat label="Saldo pendiente" value={fmtMoney(pending)} tone={pending ? 'text-red-600' : 'text-ink'} />
        <Stat label="Pagos" value={rows.length} />
      </div>

      {data && data.debts.length > 0 && (
        <Card title="Órdenes con saldo pendiente" className="mb-4">
          <TableWrap>
            <thead><tr><th className="th">Orden</th><th className="th text-right">Total</th><th className="th text-right">Pagado</th><th className="th text-right">Saldo</th></tr></thead>
            <tbody className="divide-y divide-steel-100">{data.debts.map((d) => (
              <tr key={d.order_id}><td className="td"><Link className="font-semibold text-amber-700 underline" to={`${base}/ordenes/${d.order_id}`}>{orderNo(d.number)}</Link> <StatusBadge status={d.status} /></td>
                <td className="td text-right">{fmtMoney(d.total)}</td><td className="td text-right">{fmtMoney(d.paid)}</td><td className="td text-right font-semibold text-red-600">{fmtMoney(d.total - d.paid)}</td></tr>
            ))}</tbody>
          </TableWrap>
        </Card>
      )}

      <Card title="Historial de pagos">
        <div className="flex flex-wrap gap-2 border-b border-steel-100 p-3">
          <SearchBox value={search} onChange={setSearch} placeholder="Buscar por cliente u orden…" />
          <select className="input w-auto" value={method} onChange={(e) => setMethod(e.target.value)}><option value="">Todos los medios</option>{opts(PAY_METHOD).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos los estados</option>{opts(PAY_STATUS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        </div>
        {loading ? <Loading /> : error ? <p className="p-4 text-sm text-red-600">{error}</p> : rows.length === 0 ? <Empty text="No hay pagos registrados." /> : (
          <TableWrap>
            <thead><tr><th className="th">Fecha</th><th className="th">Orden</th>{staff && <th className="th">Cliente</th>}<th className="th">Medio</th><th className="th text-right">Monto</th><th className="th">Estado</th>{staff && <th className="th w-1" />}</tr></thead>
            <tbody className="divide-y divide-steel-100">{rows.map((p) => (
              <tr key={p.id}>
                <td className="td whitespace-nowrap">{fmtDateTime(p.paid_at)}</td>
                <td className="td">{p.order ? <Link className="font-semibold text-amber-700 underline" to={`${base}/ordenes/${p.order.id}`}>{orderNo(p.order.number)}</Link> : '—'}</td>
                {staff && <td className="td">{p.customer?.full_name}</td>}
                <td className="td">{PAY_METHOD[p.method]}</td><td className="td text-right font-semibold">{fmtMoney(p.amount)}</td><td className="td"><StatusBadge status={p.status} /></td>
                {staff && <td className="td">{p.status === 'pagado' && <button className="btn-ghost btn-sm text-red-600" onClick={() => annul(p)} title="Anular pago"><Ban className="h-4 w-4" /></button>}</td>}
              </tr>
            ))}</tbody>
          </TableWrap>
        )}
      </Card>
      {staff && <PaymentModal open={open} onClose={() => setOpen(false)} onSaved={reload} />}
    </div>
  )
}
