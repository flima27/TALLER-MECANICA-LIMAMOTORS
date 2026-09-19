import { ReactNode, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom'
import {
  LayoutDashboard, Users, Car, Wrench, ClipboardList, FileText, Siren, HardHat, Boxes, Warehouse, Truck, ShoppingCart,
  Hammer, CreditCard, CalendarClock, Tag, Bell, BarChart3, UserCog, History, LogOut, Menu, X, PackagePlus, PackageMinus,
  ArrowLeftRight, AlertTriangle, User, ScanLine, Package,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { ROLE_LABEL, Role } from '../lib/constants'
import { supabase } from '../lib/supabase'

type Item = { to: string; label: string; icon: any }
const I = (to: string, label: string, icon: any): Item => ({ to, label, icon })

export const NAV: Record<Role, Item[]> = {
  admin: [
    I('dashboard', 'Panel general', LayoutDashboard), I('emergencias', 'Emergencias 24/7', Siren), I('ordenes', 'Órdenes de trabajo', ClipboardList),
    I('cotizaciones', 'Cotizaciones', FileText), I('clientes', 'Clientes', Users), I('vehiculos', 'Vehículos', Car),
    I('servicios', 'Servicios', Wrench), I('mecanicos', 'Mecánicos', HardHat), I('productos', 'Productos', Package), I('inventario', 'Inventario', Boxes),
    I('almacenes', 'Almacenes', Warehouse), I('proveedores', 'Proveedores', Truck), I('compras', 'Compras', ShoppingCart),
    I('herramientas', 'Herramientas', Hammer), I('pagos', 'Pagos', CreditCard), I('mantenimientos', 'Mantenimientos', CalendarClock),
    I('promociones', 'Promociones', Tag), I('reportes', 'Reportes', BarChart3), I('usuarios', 'Usuarios', UserCog),
    I('notificaciones', 'Notificaciones', Bell), I('perfil', 'Mi perfil', User),
  ],
  recepcionista: [
    I('dashboard', 'Panel', LayoutDashboard), I('emergencias', 'Emergencias 24/7', Siren), I('ordenes', 'Órdenes de trabajo', ClipboardList),
    I('cotizaciones', 'Cotizaciones', FileText), I('clientes', 'Clientes', Users), I('vehiculos', 'Vehículos', Car),
    I('pagos', 'Pagos', CreditCard), I('historial', 'Historial', History), I('mantenimientos', 'Mantenimientos', CalendarClock),
    I('inventario', 'Consultar inventario', Boxes), I('notificaciones', 'Notificaciones', Bell), I('perfil', 'Mi perfil', User),
  ],
  mecanico: [
    I('dashboard', 'Panel', LayoutDashboard), I('trabajos', 'Trabajos asignados', ClipboardList), I('emergencias', 'Auxilios asignados', Siren),
    I('herramientas', 'Herramientas', Hammer), I('notificaciones', 'Notificaciones', Bell), I('perfil', 'Mi perfil', User),
  ],
  almacenero: [
    I('dashboard', 'Panel', LayoutDashboard), I('productos', 'Productos', Package), I('inventario', 'Inventario', ScanLine),
    I('stock-bajo', 'Stock bajo', AlertTriangle), I('entradas', 'Entradas', PackagePlus), I('salidas', 'Salidas', PackageMinus),
    I('movimientos', 'Movimientos', ArrowLeftRight), I('almacenes', 'Almacenes', Warehouse), I('compras', 'Compras', ShoppingCart),
    I('proveedores', 'Proveedores', Truck), I('herramientas', 'Herramientas', Hammer), I('ordenes', 'Uso en órdenes', ClipboardList),
    I('notificaciones', 'Notificaciones', Bell), I('perfil', 'Mi perfil', User),
  ],
  cliente: [
    I('dashboard', 'Inicio', LayoutDashboard), I('auxilio', 'Auxilio 24/7', Siren), I('vehiculos', 'Mis vehículos', Car),
    I('ordenes', 'Mis órdenes', ClipboardList), I('cotizaciones', 'Cotizaciones', FileText), I('pagos', 'Pagos', CreditCard),
    I('historial', 'Historial', History), I('mantenimientos', 'Mantenimientos', CalendarClock), I('promociones', 'Promociones', Tag),
    I('notificaciones', 'Notificaciones', Bell), I('perfil', 'Mi perfil', User),
  ],
}

export default function Layout() {
  const { profile, role, base, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const loc = useLocation()
  useEffect(() => setOpen(false), [loc.pathname])

  useEffect(() => {
    if (!profile) return
    let alive = true
    const load = async () => {
      const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('read', false)
      if (alive) setUnread(count || 0)
    }
    load()
    const t = setInterval(load, 45000)
    const ch = supabase.channel('notif-' + profile.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` }, load)
      .subscribe()
    return () => { alive = false; clearInterval(t); supabase.removeChannel(ch) }
  }, [profile?.id, loc.pathname])

  const items = NAV[role as Role] || []
  const nav: ReactNode = (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
      {items.map((it) => (
        <NavLink key={it.to} to={`${base}/${it.to}`}
          className={({ isActive }) => `flex items-center gap-3 rounded-md px-3 py-2 text-[15px] font-medium transition-colors ${isActive ? 'bg-amber-400 text-ink' : 'text-steel-300 hover:bg-ink-700 hover:text-white'}`}>
          <it.icon className="h-[18px] w-[18px] shrink-0" />
          <span className="flex-1">{it.label}</span>
          {it.to === 'notificaciones' && unread > 0 && (
            <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white">{unread}</span>
          )}
        </NavLink>
      ))}
    </nav>
  )

  const brand = (
    <div className="flex items-center gap-2.5 px-4 py-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-amber-400 text-ink"><Wrench className="h-5 w-5" /></div>
      <div className="leading-tight">
        <div className="font-display text-xl font-semibold text-white">Taller 24/7</div>
        <div className="text-[11px] text-steel-400">Mecánica y auxilio automotriz</div>
      </div>
    </div>
  )

  const userBox = (
    <div className="border-t border-ink-600 p-3">
      <div className="mb-2 px-1">
        <div className="truncate text-sm font-semibold text-white">{profile?.full_name || profile?.email}</div>
        <div className="text-xs text-steel-400">{role && ROLE_LABEL[role]}</div>
      </div>
      <button onClick={signOut} className="btn w-full justify-start text-steel-300 hover:bg-ink-700 hover:text-white"><LogOut className="h-4 w-4" /> Cerrar sesión</button>
    </div>
  )

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 flex-col bg-ink lg:flex">{brand}{nav}{userBox}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/60" onClick={() => setOpen(false)} />
          <aside className="relative flex h-full w-72 max-w-[85%] flex-col bg-ink">
            <button className="absolute right-2 top-3 rounded p-1 text-steel-300" onClick={() => setOpen(false)} aria-label="Cerrar menú"><X className="h-5 w-5" /></button>
            {brand}{nav}{userBox}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between bg-ink px-3 py-2.5 lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded p-1.5 text-white" aria-label="Abrir menú"><Menu className="h-6 w-6" /></button>
          <span className="font-display text-lg font-semibold text-white">Taller 24/7</span>
          <Link to={`${base}/notificaciones`} className="relative rounded p-1.5 text-white" aria-label="Notificaciones">
            <Bell className="h-6 w-6" />
            {unread > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{unread}</span>}
          </Link>
        </header>
        <main className="flex-1 overflow-y-auto p-4 pb-24 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl"><Outlet /></div>
        </main>
        {role === 'cliente' && (
          <Link to={`${base}/auxilio`}
            className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full bg-red-600 px-5 py-3 font-display text-lg font-semibold text-white shadow-lg hover:bg-red-500 lg:bottom-6 lg:right-6">
            <Siren className="h-5 w-5" /> Pedir auxilio
          </Link>
        )}
      </div>
    </div>
  )
}
