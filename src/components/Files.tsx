import { useEffect, useRef, useState } from 'react'
import { Upload, Trash2, FileText, Camera } from 'lucide-react'
import { supabase, BUCKET } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useQuery } from '../lib/hooks'
import { errMsg, fmtDateTime } from '../lib/util'
import { Spinner, useToast, confirmAsk } from './ui'

const safe = (n: string) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_')

function FileThumb({ f, onDelete, canDelete }: { f: any; onDelete: () => void; canDelete: boolean }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    supabase.storage.from(BUCKET).createSignedUrl(f.path, 3600).then(({ data }) => alive && setUrl(data?.signedUrl || null))
    return () => { alive = false }
  }, [f.path])
  const isImg = (f.mime || '').startsWith('image/')
  const isVid = (f.mime || '').startsWith('video/')
  return (
    <div className="group relative overflow-hidden rounded-md border border-steel-200 bg-steel-50">
      <div className="flex aspect-[4/3] items-center justify-center bg-steel-100">
        {!url ? <Spinner /> : isImg ? (
          <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={f.file_name || 'foto'} className="h-full w-full object-cover" loading="lazy" /></a>
        ) : isVid ? (
          <video src={url} controls className="h-full w-full object-cover" />
        ) : (
          <a href={url} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 px-2 text-center text-xs text-steel-600">
            <FileText className="h-8 w-8" /> <span className="line-clamp-2 break-all">{f.file_name}</span>
          </a>
        )}
      </div>
      <div className="flex items-center justify-between gap-1 px-2 py-1.5 text-[11px] text-steel-500">
        <span className="truncate">{f.phase && f.phase !== 'otro' ? (f.phase === 'antes' ? 'Antes · ' : 'Después · ') : ''}{fmtDateTime(f.created_at)}</span>
        {canDelete && (
          <button onClick={onDelete} className="rounded p-1 text-red-600 hover:bg-red-50" aria-label="Eliminar archivo"><Trash2 className="h-3.5 w-3.5" /></button>
        )}
      </div>
    </div>
  )
}

export default function FileManager(p: {
  folder: 'vehiculos' | 'emergencias' | 'ordenes' | 'trabajos' | 'cotizaciones' | 'pagos' | 'compras' | 'documentos'
  entityType: string
  entityId: string
  customerId?: string | null
  readOnly?: boolean
  phase?: boolean          // muestra selector antes/después
  label?: string
  onChange?: () => void
}) {
  const { profile, role } = useAuth()
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [phase, setPhase] = useState<'antes' | 'despues' | 'otro'>('otro')
  const { data: files, reload } = useQuery(async () => {
    const { data, error } = await supabase.from('files').select('*').eq('entity_type', p.entityType).eq('entity_id', p.entityId).order('created_at', { ascending: false })
    if (error) throw error
    return data as any[]
  }, [p.entityType, p.entityId])

  const upload = async (list: FileList | null) => {
    if (!list || !list.length) return
    setUploading(true)
    try {
      for (const file of Array.from(list)) {
        if (file.size > 50 * 1024 * 1024) { toast(`${file.name} pesa más de 50 MB`, 'error'); continue }
        const path = `${p.folder}/${p.entityId}/${Date.now()}-${safe(file.name)}`
        const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined })
        if (up.error) throw up.error
        const { error } = await supabase.from('files').insert({
          path, file_name: file.name, mime: file.type, size: file.size, folder: p.folder,
          entity_type: p.entityType, entity_id: p.entityId, customer_id: p.customerId ?? null,
          phase: p.phase ? phase : null, uploaded_by: profile?.id,
        })
        if (error) { await supabase.storage.from(BUCKET).remove([path]); throw error }
      }
      toast('Archivo subido'); reload(); p.onChange?.()
    } catch (e) { toast(errMsg(e), 'error') }
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const remove = async (f: any) => {
    if (!confirmAsk('¿Eliminar este archivo?')) return
    const { error } = await supabase.from('files').delete().eq('id', f.id)
    if (error) return toast(errMsg(error), 'error')
    await supabase.storage.from(BUCKET).remove([f.path])
    reload(); p.onChange?.()
  }

  return (
    <div>
      {!p.readOnly && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {p.phase && (
            <select className="input w-auto" value={phase} onChange={(e) => setPhase(e.target.value as any)}>
              <option value="otro">Sin etiqueta</option><option value="antes">Antes del trabajo</option><option value="despues">Después del trabajo</option>
            </select>
          )}
          <input ref={inputRef} type="file" multiple accept="image/*,video/*,application/pdf" className="hidden" onChange={(e) => upload(e.target.files)} />
          <button className="btn-secondary" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? <Spinner className="h-4 w-4" /> : <Camera className="h-4 w-4" />} {p.label || 'Subir foto o video'}
          </button>
          <span className="text-xs text-steel-400">Máx. 50 MB por archivo</span>
        </div>
      )}
      {!files ? <Spinner /> : files.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-steel-400"><Upload className="h-4 w-4" /> Aún no hay archivos.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {files.map((f) => (
            <FileThumb key={f.id} f={f} onDelete={() => remove(f)}
              canDelete={!p.readOnly && (role === 'admin' || f.uploaded_by === profile?.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
