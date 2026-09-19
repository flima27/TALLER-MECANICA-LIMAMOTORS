import { ReactNode } from 'react'
import { Navigate, RouteObject, useRoutes } from 'react-router-dom'
import { Wrench } from 'lucide-react'
import { useAuth } from './lib/auth'
import { isConfigured } from './lib/supabase'
import { Role, ROLE_BASE } from './lib/constants'
import { Loading } from './components/ui'
import Layout from './components/Layout'
import Login from './pages/Login'
import Orders from './pages/Orders'
import WorkOrderDetail from './pages/WorkOrderDetail'
import { QuotationsList, QuotationDetail, ClientQuotations } from './pages/Quotations'
import { AdminDashboard, ReceptionDashboard, MechanicDashboard, StoreDashboard, ClientDashboard } from './pages/Dashboards'
import { EmergencyList, EmergencyDetail, ClientEmergency } from './pages/Emergencies'
import { ClientsPage, CustomerDetail, VehiclesPage, VehicleDetail, HistoryPage, ServicesPage, PromotionsAdmin, PromotionsView } from './pages/Masters'
import { SuppliersPage, WarehousesPage, ToolsPage, MaintenancePage } from './pages/Operations'
import { Products, Inventory, LowStock, Movements, Purchases } from './pages/Inventory'
import { UsersPage, MechanicsPage, ProfilePage } from './pages/Users'
import { PaymentsPage } from './pages/Payments'
import Notifications from './pages/Notifications'
import Reports from './pages/Reports'

const R = (path: string, element: ReactNode): RouteObject => ({ path, element })

function childrenFor(role: Role): RouteObject[] {
  const common = [R('notificaciones', <Notifications />), R('perfil', <ProfilePage />), R('*', <Navigate to="dashboard" replace />)]
  const orders = [R('ordenes', <Orders />), R('ordenes/:id', <WorkOrderDetail />), R('ordenes/:id/:tab', <WorkOrderDetail />)]
  switch (role) {
    case 'admin':
      return [
        R('dashboard', <AdminDashboard />),
        R('emergencias', <EmergencyList />), R('emergencias/:id', <EmergencyDetail />),
        ...orders,
        R('cotizaciones', <QuotationsList />), R('cotizaciones/:id', <QuotationDetail />),
        R('clientes', <ClientsPage />), R('clientes/:id', <CustomerDetail />),
        R('vehiculos', <VehiclesPage />), R('vehiculos/:id', <VehicleDetail />),
        R('servicios', <ServicesPage />), R('mecanicos', <MechanicsPage />),
        R('productos', <Products />), R('inventario', <Inventory />),
        R('almacenes', <WarehousesPage />), R('proveedores', <SuppliersPage />), R('compras', <Purchases />),
        R('herramientas', <ToolsPage />), R('pagos', <PaymentsPage />), R('mantenimientos', <MaintenancePage />),
        R('promociones', <PromotionsAdmin />), R('reportes', <Reports />), R('usuarios', <UsersPage />),
        ...common,
      ]
    case 'recepcionista':
      return [
        R('dashboard', <ReceptionDashboard />),
        R('emergencias', <EmergencyList />), R('emergencias/:id', <EmergencyDetail />),
        ...orders,
        R('cotizaciones', <QuotationsList />), R('cotizaciones/:id', <QuotationDetail />),
        R('clientes', <ClientsPage />), R('clientes/:id', <CustomerDetail />),
        R('vehiculos', <VehiclesPage />), R('vehiculos/:id', <VehicleDetail />),
        R('pagos', <PaymentsPage />), R('historial', <HistoryPage />), R('mantenimientos', <MaintenancePage />),
        R('inventario', <Inventory />),
        ...common,
      ]
    case 'mecanico':
      return [
        R('dashboard', <MechanicDashboard />),
        R('trabajos', <Orders />), R('trabajos/:id', <WorkOrderDetail />), R('trabajos/:id/:tab', <WorkOrderDetail />),
        R('emergencias', <EmergencyList />), R('emergencias/:id', <EmergencyDetail />),
        R('herramientas', <ToolsPage />),
        ...common,
      ]
    case 'almacenero':
      return [
        R('dashboard', <StoreDashboard />),
        R('productos', <Products />), R('inventario', <Inventory />), R('stock-bajo', <LowStock />),
        R('entradas', <Movements mode="entrada" />), R('salidas', <Movements mode="salida" />), R('movimientos', <Movements mode="all" />),
        R('almacenes', <WarehousesPage />), R('compras', <Purchases />), R('proveedores', <SuppliersPage />),
        R('herramientas', <ToolsPage />),
        ...orders,
        ...common,
      ]
    case 'cliente':
      return [
        R('dashboard', <ClientDashboard />),
        R('auxilio', <ClientEmergency />),
        R('vehiculos', <VehiclesPage />), R('vehiculos/:id', <VehicleDetail />),
        ...orders,
        R('cotizaciones', <ClientQuotations />),
        R('pagos', <PaymentsPage />), R('historial', <HistoryPage />), R('mantenimientos', <MaintenancePage />),
        R('promociones', <PromotionsView />),
        ...common,
      ]
  }
}

function NotConfigured() {
  return (
    <div className="flex min-h-full items-center justify-center bg-ink p-6">
      <div className="max-w-lg rounded-xl bg-white p-8">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-amber-400"><Wrench className="h-6 w-6" /></div>
        <h1 className="text-3xl font-semibold">Falta conectar la base de datos</h1>
        <p className="mt-3 text-sm text-steel-600">
          La aplicación está instalada correctamente, pero todavía no tiene los datos de tu proyecto de Supabase.
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-steel-700">
          <li>Abre el archivo <code className="rounded bg-steel-100 px-1">public/config.js</code>.</li>
          <li>Pega tu <b>Project URL</b> y tu <b>clave pública (anon / publishable key)</b> de Supabase.</li>
          <li>Vuelve a publicar la aplicación en Netlify.</li>
        </ol>
      </div>
    </div>
  )
}

function Routed({ role }: { role: Role }) {
  const base = ROLE_BASE[role]
  const el = useRoutes([
    { path: '/', element: <Navigate to={`${base}/dashboard`} replace /> },
    { path: '/login', element: <Navigate to="/" replace /> },
    { path: base, element: <Layout />, children: childrenFor(role) },
    { path: '*', element: <Navigate to="/" replace /> },
  ])
  return el
}

export default function App() {
  const { loading, profile, session } = useAuth()
  const anon = useRoutes([{ path: '/login', element: <Login /> }, { path: '*', element: <Navigate to="/login" replace /> }])
  if (!isConfigured) return <NotConfigured />
  if (loading) return <div className="flex h-full items-center justify-center"><Loading /></div>
  if (!session || !profile) return anon
  return <Routed role={profile.role} />
}
