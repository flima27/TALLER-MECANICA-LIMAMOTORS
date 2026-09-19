import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { Role, ROLE_BASE } from './constants'
import { errMsg } from './util'

export type Profile = { id: string; email: string; full_name: string; phone: string | null; role: Role; active: boolean }

type Ctx = {
  session: Session | null
  profile: Profile | null
  role: Role | null
  base: string
  customerId: string | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, name: string, phone: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthCtx = createContext<Ctx>(null as any)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (uid: string | null) => {
    if (!uid) { setProfile(null); setCustomerId(null); return }
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    if (!data || !data.active) {
      await supabase.auth.signOut()
      setProfile(null); setCustomerId(null)
      if (data && !data.active) alert('Tu usuario está desactivado. Consulta con el administrador.')
      return
    }
    setProfile(data as Profile)
    if (data.role === 'cliente') {
      const { data: c } = await supabase.from('customers').select('id').eq('user_id', uid).maybeSingle()
      setCustomerId(c?.id ?? null)
    } else setCustomerId(null)
  }, [])

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return
      setSession(data.session)
      await loadProfile(data.session?.user.id ?? null)
      if (alive) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_OUT') { setProfile(null); setCustomerId(null) }
      else if (event === 'SIGNED_IN') setTimeout(() => loadProfile(s?.user.id ?? null), 0)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [loadProfile])

  const value: Ctx = {
    session, profile, loading, customerId,
    role: profile?.role ?? null,
    base: profile ? ROLE_BASE[profile.role] : '',
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw new Error(errMsg(error))
    },
    signUp: async (email, password, name, phone) => {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(), password, options: { data: { full_name: name, phone } },
      })
      if (error) throw new Error(errMsg(error))
      if (!data.session) throw new Error('Cuenta creada, pero falta confirmar el correo. (El administrador debe desactivar "Confirm email" en Supabase.)')
    },
    signOut: async () => { await supabase.auth.signOut() },
    refreshProfile: async () => { await loadProfile(session?.user.id ?? null) },
  }
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}
