export type Role = 'admin' | 'recepcionista' | 'mecanico' | 'almacenero' | 'cliente'

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador',
  recepcionista: 'Recepcionista',
  mecanico: 'Mecánico',
  almacenero: 'Almacenero',
  cliente: 'Cliente',
}

export const ROLE_BASE: Record<Role, string> = {
  admin: '/admin',
  recepcionista: '/recepcion',
  mecanico: '/mecanico',
  almacenero: '/almacen',
  cliente: '/cliente',
}

type Opt = { value: string; label: string }
export const opts = (o: Record<string, string>): Opt[] => Object.entries(o).map(([value, label]) => ({ value, label }))

export const ORDER_STATUS: Record<string, string> = {
  abierta: 'Abierta', diagnostico: 'Diagnóstico', cotizacion: 'Cotización', aprobada: 'Aprobada',
  en_proceso: 'En proceso', pausada: 'Pausada', terminada: 'Terminada', entregada: 'Entregada', cancelada: 'Cancelada',
}
export const ORDER_ORIGIN: Record<string, string> = {
  presencial: 'Atención presencial', solicitud_cliente: 'Solicitud del cliente', auxilio: 'Auxilio mecánico',
  mantenimiento: 'Mantenimiento programado', interno: 'Trabajo interno',
}
export const EMERGENCY_STATUS: Record<string, string> = {
  pendiente: 'Pendiente', asignado: 'Asignado', en_camino: 'En camino', en_atencion: 'En atención',
  finalizado: 'Finalizado', cancelado: 'Cancelado',
}
export const EMERGENCY_TYPE: Record<string, string> = {
  no_arranca: 'Vehículo no arranca', bateria: 'Batería descargada', electrico: 'Problema eléctrico',
  llanta: 'Llanta pinchada', sobrecalentamiento: 'Sobrecalentamiento', falla_motor: 'Falla de motor',
  combustible: 'Falta de combustible', mecanico: 'Problema mecánico', accidente: 'Accidente / avería', otro: 'Otro',
}
export const URGENCY: Record<string, string> = { baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica' }
export const QUOTE_STATUS: Record<string, string> = {
  borrador: 'Borrador', enviada: 'Enviada al cliente', aprobada: 'Aprobada', rechazada: 'Rechazada',
}
export const PAY_METHOD: Record<string, string> = { efectivo: 'Efectivo', transferencia: 'Transferencia', qr: 'QR', otro: 'Otro' }
export const PAY_STATUS: Record<string, string> = { pagado: 'Pagado', pendiente: 'Pendiente', anulado: 'Anulado' }
export const ITEM_KIND: Record<string, string> = {
  servicio: 'Servicio', mano_obra: 'Mano de obra', repuesto: 'Repuesto', lubricante: 'Lubricante', material: 'Material', otro: 'Otro',
}
export const PRODUCT_KIND: Record<string, string> = {
  repuesto: 'Repuesto', lubricante: 'Lubricante', aceite: 'Aceite', filtro: 'Filtro', material: 'Material', accesorio: 'Accesorio',
}
export const TOOL_STATUS: Record<string, string> = {
  disponible: 'Disponible', prestada: 'Prestada', mantenimiento: 'En mantenimiento', danada: 'Dañada', baja: 'Baja',
}
export const MOVE_REASON: Record<string, string> = {
  compra: 'Compra', devolucion: 'Devolución', ajuste: 'Ajuste', venta: 'Venta', uso_orden: 'Uso en orden',
  traslado: 'Traslado', baja: 'Baja',
}
export const PROMO_KIND: Record<string, string> = {
  promocion: 'Promoción', descuento: 'Descuento', paquete: 'Paquete', campana: 'Campaña', combo: 'Servicios combinados',
}
export const FUEL: Record<string, string> = {
  gasolina: 'Gasolina', diesel: 'Diésel', gnv: 'GNV', glp: 'GLP', hibrido: 'Híbrido', electrico: 'Eléctrico',
}

export const STATUS_TONE: Record<string, string> = {
  // órdenes
  abierta: 'bg-steel-100 text-steel-600', diagnostico: 'bg-sky-100 text-sky-800', cotizacion: 'bg-violet-100 text-violet-800',
  aprobada: 'bg-emerald-100 text-emerald-800', en_proceso: 'bg-amber-100 text-amber-700', pausada: 'bg-orange-100 text-orange-800',
  terminada: 'bg-teal-100 text-teal-800', entregada: 'bg-emerald-200 text-emerald-900', cancelada: 'bg-red-100 text-red-700',
  // emergencias
  pendiente: 'bg-red-100 text-red-700', asignado: 'bg-sky-100 text-sky-800', en_camino: 'bg-amber-100 text-amber-700',
  en_atencion: 'bg-violet-100 text-violet-800', finalizado: 'bg-emerald-100 text-emerald-800', cancelado: 'bg-steel-100 text-steel-500',
  // cotizaciones / pagos
  borrador: 'bg-steel-100 text-steel-600', enviada: 'bg-sky-100 text-sky-800', rechazada: 'bg-red-100 text-red-700',
  pagado: 'bg-emerald-100 text-emerald-800', anulado: 'bg-steel-100 text-steel-500',
  // herramientas
  disponible: 'bg-emerald-100 text-emerald-800', prestada: 'bg-amber-100 text-amber-700', mantenimiento: 'bg-sky-100 text-sky-800',
  danada: 'bg-red-100 text-red-700', baja: 'bg-steel-100 text-steel-500',
  // urgencia
  baja_u: 'bg-steel-100 text-steel-600', media: 'bg-sky-100 text-sky-800', alta: 'bg-orange-100 text-orange-800', critica: 'bg-red-600 text-white',
}
export const ALL_STATUS_LABEL: Record<string, string> = {
  ...ORDER_STATUS, ...EMERGENCY_STATUS, ...QUOTE_STATUS, ...PAY_STATUS, ...TOOL_STATUS,
}
