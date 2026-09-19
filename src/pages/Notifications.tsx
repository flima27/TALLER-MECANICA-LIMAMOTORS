import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useQuery } from '../lib/hooks'
import { fmtDateTime } from '../lib/util'
import { Card, Empty, Loading, PageHeader } from '../components/ui'

export default function Notifications() {
  const { base } = useAuth()
  const nav = useNavigate()
  const { data, loading, reload } = useQuery(async () => {
    const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(200)
    if (error) throw error
    return data as any[]
  }, [])
  const unread = (data || []).filter((n) => !n.read).length

  const open = async (n: any) => {
    if (!n.read) await supabase.from('notifications').update({ read: true }).eq('id', n.id)
    if (n.link) nav(base + n.link); else reload()
  }
  const readAll = async () => {
    await supabase.from('notifications').update({ read: true }).eq('read', false)
    reload()
  }
  return (
    <div>
      <PageHeader title="Notificaciones" subtitle={unread ? `${unread} sin leer` : 'Estás al día'}
        actions={unread > 0 && <button className="btn-secondary" onClick={readAll}><CheckCheck className="h-4 w-4" /> Marcar todas como leídas</button>} />
      <Card>
        {loading ? <Loading /> : !data || data.length === 0 ? <Empty text="No tienes notificaciones." /> : (
          <ul className="divide-y divide-steel-100">
            {data.map((n) => (
              <li key={n.id}>
                <button onClick={() => open(n)} className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-steel-50 ${n.read ? '' : 'bg-amber-50/60'}`}>
                  <Bell className={`mt-0.5 h-5 w-5 shrink-0 ${n.read ? 'text-steel-300' : 'text-amber-500'}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${n.read ? '' : 'font-semibold'}`}>{n.title}</span>
                    {n.body && <span className="block text-sm text-steel-500">{n.body}</span>}
                    <span className="block text-xs text-steel-400">{fmtDateTime(n.created_at)}</span>
                  </span>
                  {!n.read && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
