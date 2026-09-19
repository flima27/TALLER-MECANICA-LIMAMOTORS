import { useEffect, useMemo, useState } from 'react'
import { KeyRound, Pencil, Plus, UserPlus } from 'lucide-react'
import { supabase, tempClient } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useQuery } from '../lib/hooks'
import { ROLE_LABEL, Role, opts } from '../lib/constants'
import { errMsg, fmtDate } from '../lib/util'
import { Badge, Card, Empty, Field, Loading, Modal, PageHeader, SearchBox, TableWrap, useToast } from '../components/ui'

const ROLE_TONE: Record<Role, string> = {
  admin: 'bg-ink text-white', recepcionista: 'bg-sky-100 text-sky-800', mecanico: 'bg-amber-100 text-amber-800',
  almacenero: 'bg-violet-100 text-violet-800', cliente: 'bg-steel-100 text-steel-600',
}
const STAFF_ROLES = opts({ admin: 'Administrador', recepcionista: 'Recepcionista', mecanico: 'Mecánico', almacenero: 'Almacenero', cliente: 'Cliente' })

/* ------------------------------ USUARIOS (admin) ------------------------------ */
export function UsersPage() {
  const { profile, refreshProfile } = useAuth()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [roleF, setRoleF] = useState('')
  const [create, setCreate] = useState(false)
  const [edit, setEdit] = useState<any>(null)
  const { data, loading, error, reload } = useQuery(async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(1000)
    if (error) throw error
    return data as any[]
  }, [])
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase()
    return (data || []).filter((u) => (!roleF || u.role === roleF) && (!s || [u.full_name, u.email, u.phone].some((x) => String(x || '').toLowerCase().includes(s))))
  }, [data, search, roleF])

  const saveEdit = async () => {
    const { error } = await supabase.from('profiles').update({ full_name: edit.full_name, phone: edit.phone || null, role: edit.role, active: edit.active }).eq('id', edit.id)
    if (error) return toast(errMsg(error), 'error')
    toast('Usuario actualizado'); setEdit(null); reload()
    if (edit.id === profile?.id) refreshProfile()
  }

  return (
    <div>
      <PageHeader title="Usuarios" subtitle="Crea y administra el acceso de tu equipo y tus clientes"
        actions={<button className="btn-primary" onClick={() => setCreate(true)}><UserPlus className="h-4 w-4" /> Crear usuario</button>} />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-steel-100 p-3">
          <SearchBox value={search} onChange={setSearch} placeholder="Buscar por nombre, correo, teléfono…" />
          <select className="input w-auto" value={roleF} onChange={(e) => setRoleF(e.target.value)}><option value="">Todos los roles</option>{STAFF_ROLES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        </div>
        {loading ? <Loading /> : error ? <p className="p-4 text-sm text-red-600">{error}</p> : rows.length === 0 ? <Empty text="Sin usuarios." /> : (
          <TableWrap>
            <thead><tr><th className="th">Nombre</th><th className="th">Correo</th><th className="th">Teléfono</th><th className="th">Rol</th><th className="th">Estado</th><th className="th">Alta</th><th className="th w-1" /></tr></thead>
            <tbody className="divide-y divide-steel-100">{rows.map((u) => (
              <tr key={u.id}>
                <td className="td font-semibold">{u.full_name}{u.id === profile?.id && <span className="ml-1 text-xs font-normal text-steel-400">(tú)</span>}</td>
                <td className="td">{u.email}</td><td className="td">{u.phone || '—'}</td>
                <td className="td"><Badge tone={ROLE_TONE[u.role as Role]}>{ROLE_LABEL[u.role as Role]}</Badge></td>
                <td className="td">{u.active ? <Badge tone="bg-emerald-100 text-emerald-800">Activo</Badge> : <Badge tone="bg-red-100 text-red-700">Desactivado</Badge>}</td>
                <td className="td whitespace-nowrap text-steel-500">{fmtDate(u.created_at)}</td>
                <td className="td"><button className="btn-ghost btn-sm" onClick={() => setEdit({ ...u })} aria-label="Editar"><Pencil className="h-4 w-4" /></button></td>
              </tr>
            ))}</tbody>
          </TableWrap>
        )}
      </Card>
      <p className="mt-3 text-xs text-steel-400"><KeyRound className="mr-1 inline h-3.5 w-3.5" />Por seguridad, la contraseña de otro usuario no se puede ver ni cambiar desde aquí. Si alguien la olvida, créale un usuario nuevo o restablécela en Supabase (Authentication → Users).</p>

      {create && <CreateUserModal onClose={() => setCreate(false)} onCreated={reload} />}
      <Modal open={!!edit} onClose={() => setEdit(null)} title="Editar usuario"
        footer={<><button className="btn-secondary" onClick={() => setEdit(null)}>Cancelar</button><button className="btn-primary" onClick={saveEdit}>Guardar</button></>}>
        {edit && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Correo" className="sm:col-span-2"><input className="input" value={edit.email || ''} disabled /></Field>
            <Field label="Nombre completo"><input className="input" value={edit.full_name || ''} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} /></Field>
            <Field label="Teléfono"><input className="input" type="tel" value={edit.phone || ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
            <Field label="Rol"><select className="input" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>{STAFF_ROLES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
            <label className="flex items-center gap-2 pt-6 text-sm font-medium"><input type="checkbox" className="h-4 w-4 accent-amber-500" checked={!!edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Usuario activo (puede ingresar)</label>
          </div>
        )}
      </Modal>
    </div>
  )
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast()
  const [f, setF] = useState({ full_name: '', email: '', password: '', phone: '', role: 'recepcionista' as Role })
  const [busy, setBusy] = useState(false)
  const [warn, setWarn] = useState('')
  const save = async () => {
    if (!f.full_name.trim() || !f.email.trim()) return toast('Escribe el nombre y el correo', 'error')
    if (f.password.length < 6) return toast('La contraseña debe tener al menos 6 caracteres', 'error')
    setBusy(true)
    try {
      const tc = tempClient()   // cliente aparte: no cierra tu sesión de administrador
      const { data, error } = await tc.auth.signUp({ email: f.email.trim(), password: f.password, options: { data: { full_name: f.full_name.trim(), phone: f.phone } } })
      if (error) throw error
      if (!data.user || (data.user.identities && data.user.identities.length === 0)) throw new Error('Ese correo ya está registrado.')
      const { error: e2 } = await supabase.from('profiles').update({ role: f.role, full_name: f.full_name.trim(), phone: f.phone || null }).eq('id', data.user.id)
      if (e2) throw e2
      onCreated()
      if (!data.session) { setWarn('Usuario creado, pero Supabase pide confirmar el correo antes de ingresar. Desactiva "Confirm email" en Supabase (Authentication → Sign In / Providers → Email) para que puedan entrar directamente.'); toast('Usuario creado') }
      else { toast('Usuario creado. Ya puede ingresar con su correo y contraseña.'); onClose() }
    } catch (e) { toast(errMsg(e), 'error') }
    setBusy(false)
  }
  return (
    <Modal open onClose={onClose} title="Crear usuario"
      footer={warn ? <button className="btn-primary" onClick={onClose}>Entendido</button> : <><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy} onClick={save}><Plus className="h-4 w-4" /> {busy ? 'Creando…' : 'Crear usuario'}</button></>}>
      {warn ? <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">{warn}</p> : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre completo *"><input className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
          <Field label="Teléfono"><input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Correo *"><input className="input" type="email" autoComplete="off" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Contraseña inicial *" hint="Mínimo 6 caracteres. Entrégasela a la persona."><input className="input" type="text" autoComplete="off" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          <Field label="Rol *" className="sm:col-span-2"><select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{STAFF_ROLES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
        </div>
      )}
    </Modal>
  )
}

/* ------------------------------- MECÁNICOS (admin) ------------------------------- */
export function MechanicsPage() {
  const { data, loading } = useQuery(async () => {
    const [m, o, e] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'mecanico').order('full_name').then((r) => r.data || []),
      supabase.from('work_orders').select('mechanic_id, status, finished_at').not('mechanic_id', 'is', null).limit(5000).then((r) => r.data || []),
      supabase.from('emergency_requests').select('assigned_to, status').not('assigned_to', 'is', null).limit(5000).then((r) => r.data || []),
    ])
    const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0)
    return (m as any[]).map((p) => {
      const mine = (o as any[]).filter((x) => x.mechanic_id === p.id)
      return {
        ...p,
        active_jobs: mine.filter((x) => ['aprobada', 'en_proceso', 'pausada', 'diagnostico', 'abierta', 'cotizacion'].includes(x.status)).length,
        done_month: mine.filter((x) => ['terminada', 'entregada'].includes(x.status) && x.finished_at && new Date(x.finished_at) >= month).length,
        total: mine.length,
        aux_active: (e as any[]).filter((x) => x.assigned_to === p.id && ['asignado', 'en_camino', 'en_atencion'].includes(x.status)).length,
      }
    })
  }, [])
  return (
    <div>
      <PageHeader title="Mecánicos" subtitle="Carga de trabajo del equipo. Para agregar un mecánico, créalo en Usuarios con el rol Mecánico." />
      <Card>
        {loading ? <Loading /> : !data || data.length === 0 ? <Empty text="Aún no hay mecánicos. Créalos desde Usuarios." /> : (
          <TableWrap>
            <thead><tr><th className="th">Mecánico</th><th className="th">Teléfono</th><th className="th">Estado</th><th className="th text-right">Trabajos activos</th><th className="th text-right">Auxilios activos</th><th className="th text-right">Terminados este mes</th><th className="th text-right">Total histórico</th></tr></thead>
            <tbody className="divide-y divide-steel-100">{data.map((p) => (
              <tr key={p.id}><td className="td font-semibold">{p.full_name}</td><td className="td">{p.phone || '—'}</td>
                <td className="td">{p.active ? <Badge tone="bg-emerald-100 text-emerald-800">Activo</Badge> : <Badge>Inactivo</Badge>}</td>
                <td className="td text-right font-semibold">{p.active_jobs}</td><td className="td text-right">{p.aux_active}</td><td className="td text-right">{p.done_month}</td><td className="td text-right text-steel-500">{p.total}</td></tr>
            ))}</tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}

/* ----------------------------------- PERFIL ----------------------------------- */
export function ProfilePage() {
  const { profile, role, refreshProfile } = useAuth()
  const toast = useToast()
  const [f, setF] = useState({ full_name: profile?.full_name || '', phone: profile?.phone || '', doc_id: '', address: '' })
  const [pw, setPw] = useState({ a: '', b: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (role !== 'cliente' || !profile) return
    supabase.from('customers').select('doc_id, address').eq('user_id', profile.id).maybeSingle().then(({ data }) => data && setF((x) => ({ ...x, doc_id: data.doc_id || '', address: data.address || '' })))
  }, [role, profile?.id])

  const save = async () => {
    if (!f.full_name.trim()) return toast('El nombre no puede estar vacío', 'error')
    setBusy(true)
    try {
      const { error } = await supabase.from('profiles').update({ full_name: f.full_name.trim(), phone: f.phone || null }).eq('id', profile!.id)
      if (error) throw error
      if (role === 'cliente') {
        const { error: e2 } = await supabase.from('customers').update({ full_name: f.full_name.trim(), phone: f.phone || null, doc_id: f.doc_id || null, address: f.address || null }).eq('user_id', profile!.id)
        if (e2) throw e2
      }
      await refreshProfile(); toast('Perfil actualizado')
    } catch (e) { toast(errMsg(e), 'error') }
    setBusy(false)
  }
  const changePw = async () => {
    if (pw.a.length < 6) return toast('La contraseña debe tener al menos 6 caracteres', 'error')
    if (pw.a !== pw.b) return toast('Las contraseñas no coinciden', 'error')
    const { error } = await supabase.auth.updateUser({ password: pw.a })
    if (error) return toast(errMsg(error), 'error')
    setPw({ a: '', b: '' }); toast('Contraseña actualizada')
  }
  return (
    <div>
      <PageHeader title="Mi perfil" subtitle={`${profile?.email} · ${role ? ROLE_LABEL[role] : ''}`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Mis datos">
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <Field label="Nombre completo" className="sm:col-span-2"><input className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
            <Field label="Teléfono"><input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            {role === 'cliente' && <Field label="CI / NIT"><input className="input" value={f.doc_id} onChange={(e) => setF({ ...f, doc_id: e.target.value })} /></Field>}
            {role === 'cliente' && <Field label="Dirección" className="sm:col-span-2"><input className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>}
            <div className="sm:col-span-2"><button className="btn-primary" disabled={busy} onClick={save}>Guardar cambios</button></div>
          </div>
        </Card>
        <Card title="Cambiar contraseña">
          <div className="grid gap-3 p-4">
            <Field label="Nueva contraseña"><input className="input" type="password" autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} /></Field>
            <Field label="Repetir contraseña"><input className="input" type="password" autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} /></Field>
            <div><button className="btn-dark" onClick={changePw}>Actualizar contraseña</button></div>
          </div>
        </Card>
      </div>
    </div>
  )
}
