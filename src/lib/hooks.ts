import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { errMsg } from './util'

/** Ejecuta una consulta y la vuelve a ejecutar cuando cambian las dependencias */
export function useQuery<T = any>(fn: () => Promise<T>, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    setLoading(true)
    fnRef.current()
      .then((d) => { if (alive) { setData(d); setError(null) } })
      .catch((e) => { if (alive) setError(errMsg(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, loading, error, reload }
}

export type OptionsFrom = {
  table: string
  value?: string
  label: string | ((r: any) => string)
  order?: string
  filter?: (q: any) => any
  select?: string
}

/** Carga las opciones de un desplegable desde una tabla */
export function useOptions(src?: OptionsFrom | null) {
  const [options, setOptions] = useState<{ value: string; label: string; row?: any }[]>([])
  useEffect(() => {
    if (!src) return
    let alive = true
    let q: any = supabase.from(src.table).select(src.select || '*').limit(1000)
    if (src.filter) q = src.filter(q)
    q = q.order(src.order || (typeof src.label === 'string' ? src.label : 'created_at'))
    q.then(({ data }: any) => {
      if (!alive) return
      setOptions((data || []).map((r: any) => ({
        value: r[src.value || 'id'],
        label: typeof src.label === 'function' ? src.label(r) : r[src.label],
        row: r,
      })))
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src?.table])
  return options
}
