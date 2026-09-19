import { Role } from './constants'

/** Ruta del detalle de una orden según el rol */
export const orderPath = (role: Role | null, base: string, id: string) =>
  role === 'mecanico' ? `${base}/trabajos/${id}` : `${base}/ordenes/${id}`
