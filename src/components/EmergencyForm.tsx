import { useEffect, useRef, useState } from 'react'
import { Camera, Crosshair, Loader2, Send, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useOptions } from '../lib/hooks'
import { EMERGENCY_TYPE, URGENCY, opts } from '../lib/constants'
import { errMsg, mapsLink } from '../lib/util'
import { uploadFilesTo } from '../lib/upload'
import { Field, useToast } from './ui'

export default function EmergencyForm({ onDone, staffMode }: { onDone: (id: string) => void; staffMode?: boolean }) {
  const { profile, customerId } = useAuth()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const customers = useOptions(staffMode ? { table: 'customers', label: (r) => r.full_name + (r.phone ? ' · ' + r.phone : ''), order: 'full_name', select: '*' } : null)
  const [cid, setCid] = useState<string>(staffMode ? '' : customerId || '')
  const [vehicles, setVehicles] = useState<any[]>([])
  const [f, setF] = useState<any>({
    contact_name: profile?.full_name || '', phone: profile?.phone || '', vehicle_id: '', plate: '', vehicle_desc: '',
    lat: null, lng: null, address: '', type: 'no_arranca', urgency: 'alta', description: '',
  })
  const [files, setFiles] = useState<File[]>([])
  const [locating, setLocating] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!cid) return setVehicles([])
    supabase.from('vehicles').select('id, brand, model, plate, color').eq('customer_id', cid).then(({ data }) => setVehicles(data || []))
    if (staffMode) {
      const c = customers.find((x) => x.value === cid)?.row
      if (c) setF((x: any) => ({ ...x, contact_name: c.full_name, phone: c.phone || '', vehicle_id: '' }))
    }
  }, [cid, customers.length])

  const pickVehicle = (id: string) => {
    const v = vehicles.find((x) => x.id === id)
    setF((x: any) => ({ ...x, vehicle_id: id, plate: v?.plate || '', vehicle_desc: v ? `${v.brand} ${v.model}${v.color ? ' ' + v.color : ''}` : '' }))
  }

  const locate = () => {
    if (!navigator.geolocation) return toast('Tu navegador no permite obtener la ubicación', 'error')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => { setF((x: any) => ({ ...x, lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) })); setLocating(false); toast('Ubicación capturada') },
      () => { setLocating(false); toast('No pudimos obtener tu ubicación. Activa el GPS y da permiso al navegador, o escribe la dirección.', 'error') },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  const submit = async () => {
    if (!cid) return toast('Elige el cliente', 'error')
    if (!f.phone.trim()) return toast('Escribe un teléfono de contacto', 'error')
    if (f.lat == null && !f.address.trim()) return toast('Comparte tu ubicación GPS o escribe la dirección', 'error')
    if (!f.description.trim()) return toast('Cuéntanos brevemente qué le pasa al vehículo', 'error')
    setBusy(true)
    try {
      const { data, error } = await supabase.from('emergency_requests').insert({
        customer_id: cid, vehicle_id: f.vehicle_id || null, contact_name: f.contact_name || null, phone: f.phone,
        plate: f.plate || null, vehicle_desc: f.vehicle_desc || null, lat: f.lat, lng: f.lng, address: f.address || null,
        type: f.type, urgency: f.urgency, description: f.description,
      }).select().single()
      if (error) throw error
      if (files.length) {
        const n = await uploadFilesTo(files, { folder: 'emergencias', entityType: 'emergency', entityId: data.id, customerId: cid, userId: profile?.id })
        if (n < files.length) toast('Algunos archivos no se pudieron subir', 'error')
      }
      toast('¡Solicitud enviada! Un mecánico será asignado en breve.')
      onDone(data.id)
    } catch (e) { toast(errMsg(e), 'error') }
    setBusy(false)
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {staffMode && (
        <Field label="Cliente *" className="sm:col-span-2">
          <select className="input" value={cid} onChange={(e) => setCid(e.target.value)}>
            <option value="">Seleccionar…</option>{customers.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
      )}
      <Field label="Nombre de contacto"><input className="input" value={f.contact_name} onChange={(e) => setF({ ...f, contact_name: e.target.value })} /></Field>
      <Field label="Teléfono *"><input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>

      <Field label="Vehículo" className="sm:col-span-2">
        <select className="input" value={f.vehicle_id} onChange={(e) => pickVehicle(e.target.value)}>
          <option value="">Otro vehículo (escribir datos)</option>
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.brand} {v.model} · {v.plate}</option>)}
        </select>
      </Field>
      <Field label="Placa"><input className="input uppercase" value={f.plate} onChange={(e) => setF({ ...f, plate: e.target.value })} /></Field>
      <Field label="Marca / modelo / color"><input className="input" value={f.vehicle_desc} onChange={(e) => setF({ ...f, vehicle_desc: e.target.value })} /></Field>

      <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 sm:col-span-2">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-dark" onClick={locate} disabled={locating}>{locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />} Compartir mi ubicación GPS</button>
          {f.lat != null && <a className="text-sm font-semibold text-amber-700 underline" href={mapsLink(f.lat, f.lng)!} target="_blank" rel="noreferrer">Ver en el mapa ({f.lat}, {f.lng})</a>}
        </div>
        <Field label="Dirección o referencia" className="mt-3"><input className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="Ej. Av. Principal esquina calle 5, frente a la gasolinera" /></Field>
      </div>

      <Field label="Tipo de emergencia"><select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{opts(EMERGENCY_TYPE).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
      <Field label="Urgencia"><select className="input" value={f.urgency} onChange={(e) => setF({ ...f, urgency: e.target.value })}>{opts(URGENCY).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
      <Field label="¿Qué pasó? *" className="sm:col-span-2"><textarea className="input min-h-[90px]" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Cuéntanos qué le ocurre al vehículo: ruidos, luces del tablero, si hay humo…" /></Field>

      <div className="sm:col-span-2">
        <input ref={fileRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => { setFiles((x) => [...x, ...Array.from(e.target.files || [])]); e.target.value = '' }} />
        <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}><Camera className="h-4 w-4" /> Agregar fotos o video de la avería</button>
        {files.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2">
            {files.map((file, i) => (
              <li key={i} className="flex items-center gap-1 rounded bg-steel-100 px-2 py-1 text-xs">{file.name.slice(0, 24)}
                <button onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="Quitar"><X className="h-3.5 w-3.5" /></button></li>
            ))}
          </ul>
        )}
      </div>

      <div className="sm:col-span-2">
        <button className="btn w-full bg-red-600 py-3 font-display text-xl text-white hover:bg-red-500" onClick={submit} disabled={busy}>
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />} {staffMode ? 'Registrar solicitud de auxilio' : 'Enviar solicitud de auxilio'}
        </button>
      </div>
    </div>
  )
}
