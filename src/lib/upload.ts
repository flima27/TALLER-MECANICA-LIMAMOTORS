import { supabase, BUCKET } from './supabase'

const safe = (n: string) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_')

/** Sube varios archivos a Storage y los registra en la tabla files. Devuelve cuántos se subieron. */
export async function uploadFilesTo(
  files: File[],
  o: { folder: string; entityType: string; entityId: string; customerId?: string | null; userId?: string; phase?: string | null },
) {
  let ok = 0
  for (const file of files) {
    if (file.size > 50 * 1024 * 1024) continue
    const path = `${o.folder}/${o.entityId}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${safe(file.name)}`
    const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined })
    if (up.error) continue
    const { error } = await supabase.from('files').insert({
      path, file_name: file.name, mime: file.type, size: file.size, folder: o.folder, entity_type: o.entityType,
      entity_id: o.entityId, customer_id: o.customerId ?? null, phase: o.phase ?? null, uploaded_by: o.userId,
    })
    if (error) await supabase.storage.from(BUCKET).remove([path])
    else ok++
  }
  return ok
}
