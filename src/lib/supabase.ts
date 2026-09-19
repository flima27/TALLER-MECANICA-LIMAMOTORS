import { createClient } from '@supabase/supabase-js'

const cfg = (window as any).APP_CONFIG || {}
const url: string = cfg.SUPABASE_URL || (import.meta as any).env?.VITE_SUPABASE_URL || ''
const key: string = cfg.SUPABASE_ANON_KEY || (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || ''

export const isConfigured =
  !!url && !!key && !url.includes('PEGA_AQUI') && !key.includes('PEGA_AQUI') && url.startsWith('http')

export const supabase = createClient(
  isConfigured ? url : 'https://placeholder.supabase.co',
  isConfigured ? key : 'placeholder-key',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }
)

/** Cliente secundario: sirve para crear usuarios desde el sistema sin cerrar la sesión del administrador */
export function tempClient() {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'taller-temp-signup' },
  })
}

export const BUCKET = 'taller-files'
