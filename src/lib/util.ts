export const fmtMoney = (v: any) =>
  'Bs ' + Number(v || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const fmtNum = (v: any) => Number(v || 0).toLocaleString('es-BO', { maximumFractionDigits: 2 })

export const fmtDate = (v?: string | null) => {
  if (!v) return '—'
  const d = new Date(v.length === 10 ? v + 'T00:00:00' : v)
  return d.toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' })
}

export const fmtDateTime = (v?: string | null) => {
  if (!v) return '—'
  return new Date(v).toLocaleString('es-BO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export const orderNo = (n: any) => 'OT-' + String(n ?? 0).padStart(5, '0')
export const quoteNo = (n: any) => 'COT-' + String(n ?? 0).padStart(5, '0')
export const emergNo = (n: any) => 'AUX-' + String(n ?? 0).padStart(5, '0')

export const todayISO = () => new Date().toISOString().slice(0, 10)

export function errMsg(e: any): string {
  const m: string = e?.message || String(e || 'Error desconocido')
  if (m.includes('warehouse_stock_qty_check')) return 'Stock insuficiente en ese almacén.'
  if (m.includes('duplicate key')) return 'Ya existe un registro con ese código o valor único.'
  if (m.includes('violates foreign key')) return 'No se puede eliminar o guardar: está relacionado con otros registros.'
  if (m.includes('row-level security')) return 'No tienes permiso para realizar esta acción.'
  if (m.includes('Invalid login credentials')) return 'Correo o contraseña incorrectos.'
  if (m.includes('Email not confirmed')) return 'El correo no está confirmado. En Supabase desactiva "Confirm email" (ver guía).'
  if (m.includes('User already registered')) return 'Ese correo ya está registrado.'
  if (m.includes('Password should be')) return 'La contraseña debe tener al menos 6 caracteres.'
  if (m.includes('Failed to fetch')) return 'No hay conexión con el servidor. Revisa tu internet y la configuración de Supabase.'
  return m
}

export function downloadCSV(name: string, cols: { key: string; label: string }[], rows: any[]) {
  const esc = (v: any) => {
    const s = v == null ? '' : String(v)
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const head = cols.map((c) => esc(c.label)).join(',')
  const body = rows.map((r) => cols.map((c) => esc(r[c.key])).join(',')).join('\n')
  const blob = new Blob(['\ufeff' + head + '\n' + body], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name + '.csv'
  a.click()
  URL.revokeObjectURL(a.href)
}

/** Descarga todas las filas superando el límite de 1000 por consulta */
export async function fetchAll(make: (from: number, to: number) => any): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await make(from, from + 999)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

export function mapsLink(lat?: number | null, lng?: number | null) {
  return lat != null && lng != null ? `https://www.google.com/maps?q=${lat},${lng}` : null
}
