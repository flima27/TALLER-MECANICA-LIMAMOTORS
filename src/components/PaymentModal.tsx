import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { PAY_METHOD, PAY_STATUS, opts } from '../lib/constants'
import { errMsg, fmtMoney, orderNo } from '../lib/util'
import { Field, Modal, useToast } from './ui'

export default function PaymentModal({ open, onClose, onSaved, orderId }: {
  open: boolean; onClose: () => void; onSaved: () => void; orderId?: string
}) {
  const { profile } = useAuth()
  const toast = useToast()
  const [orders, setOrders] = useState<any[]>([])
  const [f, setF] = useState<any>({ order_id: orderId || '', amount: '', method: 'efectivo', status: 'pagado', notes: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setF({ order_id: orderId || '', amount: '', method: 'efectivo', status: 'pagado', notes: '' })
    supabase.from('order_balances').select('*').neq('status', 'cancelada').order('number', { ascending: false }).limit(300)
      .then(({ data }) => setOrders(data || []))
  }, [open, orderId])

  const cur = orders.find((o) => o.order_id === f.order_id)
  useEffect(() => {
    if (cur && f.amount === '') setF((x: any) => ({ ...x, amount: Math.max(Number(cur.total) - Number(cur.paid), 0) || '' }))
  }, [cur?.order_id])

  const save = async () => {
    if (!cur) return toast('Elige la orden a la que corresponde el pago', 'error')
    if (!(Number(f.amount) > 0)) return toast('Escribe un monto mayor a 0', 'error')
    setBusy(true)
    const { error } = await supabase.from('payments').insert({
      order_id: cur.order_id, customer_id: cur.customer_id, amount: Number(f.amount),
      method: f.method, status: f.status, notes: f.notes || null, created_by: profile?.id,
    })
    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
    toast('Pago registrado'); onSaved(); onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Registrar pago"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={save} disabled={busy}>Guardar pago</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Orden de trabajo *" className="sm:col-span-2">
          <select className="input" value={f.order_id} disabled={!!orderId} onChange={(e) => setF({ ...f, order_id: e.target.value, amount: '' })}>
            <option value="">Seleccionar…</option>
            {orders.map((o) => <option key={o.order_id} value={o.order_id}>{orderNo(o.number)} · total {fmtMoney(o.total)} · saldo {fmtMoney(Math.max(o.total - o.paid, 0))}</option>)}
          </select>
        </Field>
        <Field label="Monto (Bs) *"><input className="input" type="number" min="0" step="any" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Método de pago">
          <select className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{opts(PAY_METHOD).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        </Field>
        <Field label="Estado">
          <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{opts(PAY_STATUS).filter((o) => o.value !== 'anulado').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        </Field>
        <Field label="Notas" className="sm:col-span-2"><input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Ej. N° de transferencia" /></Field>
      </div>
    </Modal>
  )
}
