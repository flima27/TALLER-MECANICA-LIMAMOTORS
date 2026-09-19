import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Wrench, Siren, ShieldCheck, Clock } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { Field, Spinner } from '../components/ui'

export default function Login() {
  const { session, profile, signIn, signUp, loading } = useAuth()
  const [mode, setMode] = useState<'login' | 'registro'>('login')
  const [f, setF] = useState({ email: '', password: '', name: '', phone: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  if (!loading && session && profile) return <Navigate to="/" replace />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      if (mode === 'login') await signIn(f.email, f.password)
      else {
        if (!f.name.trim()) throw new Error('Escribe tu nombre completo')
        if (f.password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres')
        await signUp(f.email, f.password, f.name.trim(), f.phone.trim())
      }
    } catch (e: any) { setErr(e.message) }
    setBusy(false)
  }

  return (
    <div className="grid min-h-full lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-amber-400 text-ink"><Wrench className="h-6 w-6" /></div>
          <span className="font-display text-2xl font-semibold">Taller 24/7</span>
        </div>
        <div>
          <h1 className="max-w-lg font-display text-6xl font-semibold leading-[1.02]">Tu vehículo se detuvo. Nosotros vamos hasta ti.</h1>
          <ul className="mt-8 space-y-3 text-steel-300">
            <li className="flex items-center gap-3"><Siren className="h-5 w-5 text-amber-400" /> Pide auxilio mecánico con tu ubicación, fotos y video</li>
            <li className="flex items-center gap-3"><Clock className="h-5 w-5 text-amber-400" /> Sigue en tiempo real el estado de tu solicitud</li>
            <li className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-amber-400" /> Aprueba cotizaciones y consulta el historial de tus vehículos</li>
          </ul>
        </div>
        <p className="text-sm text-steel-400">Sistema integral de gestión para taller mecánico y auxilio automotriz.</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-400 text-ink"><Wrench className="h-5 w-5" /></div>
            <span className="font-display text-2xl font-semibold">Taller 24/7</span>
          </div>
          <h2 className="text-3xl font-semibold">{mode === 'login' ? 'Ingresar' : 'Crear cuenta de cliente'}</h2>
          <p className="mb-6 mt-1 text-sm text-steel-500">
            {mode === 'login' ? 'Usa el correo y la contraseña de tu cuenta.' : 'Regístrate para pedir auxilio y ver el historial de tus vehículos.'}
          </p>
          <div className="space-y-3">
            {mode === 'registro' && (
              <>
                <Field label="Nombre completo"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></Field>
                <Field label="Teléfono / WhatsApp"><input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" /></Field>
              </>
            )}
            <Field label="Correo electrónico"><input className="input" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></Field>
            <Field label="Contraseña"><input className="input" type="password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></Field>
          </div>
          {err && <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
          <button className="btn-primary mt-5 w-full py-2.5" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : mode === 'login' ? 'Ingresar' : 'Crear mi cuenta'}</button>
          <button type="button" className="mt-4 w-full text-center text-sm font-medium text-steel-600 hover:text-ink"
            onClick={() => { setMode(mode === 'login' ? 'registro' : 'login'); setErr('') }}>
            {mode === 'login' ? '¿Eres cliente nuevo? Crea tu cuenta' : 'Ya tengo cuenta · Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
