# Sistema Integral de Taller Mecánico y Auxilio 24/7 — Guía de instalación

No necesitas saber programar. Son 4 pasos y tardas unos 20 minutos.
Lo único que conecta la aplicación con tu base de datos son **2 datos**: *Project URL* y *anon key*.

---

## PASO 1 — Crear el proyecto en Supabase
1. Entra a https://supabase.com e inicia sesión.
2. Pulsa **New project**. Ponle un nombre (ej. "taller"), elige una contraseña para la base de datos (guárdala) y la región más cercana. Espera 1–2 minutos a que se cree.

## PASO 2 — Crear las tablas (Script 1)
1. En Supabase, menú izquierdo: **SQL Editor** → **New query**.
2. Abre el archivo `sql/01_esquema_taller.sql`, copia **todo** su contenido y pégalo.
3. Pulsa **Run**. Debe decir "Success". (Ejecútalo **una sola vez**.)
   Esto crea todas las tablas, la seguridad por roles, los avisos automáticos, el almacenamiento privado de fotos, 4 almacenes y 16 servicios de ejemplo.

## PASO 3 — Crear tu usuario Administrador (Script 2)
1. Menú izquierdo: **Authentication** → **Users** → **Add user** → **Create new user**.
2. Escribe tu correo y una contraseña, y marca **Auto Confirm User**. Pulsa **Create user**.
3. Menú izquierdo: **Authentication** → **Sign In / Providers** → **Email** y **desactiva "Confirm email"** (así los clientes y el personal pueden entrar sin confirmar correo). Guarda.
4. Vuelve a **SQL Editor** → **New query**. Abre `sql/02_crear_administrador.sql`, cambia **solo** el correo (`CAMBIA_ESTE_CORREO@ejemplo.com`) por el que creaste, pega y pulsa **Run**.

## PASO 4 — Conectar la aplicación (2 datos)
1. En Supabase: **Project Settings** (engranaje) → **API** (o "API Keys").
2. Copia:
   - **Project URL** (empieza con `https://` y termina en `.supabase.co`)
   - **anon / publishable key** (la clave *pública*, NUNCA la "service_role")
3. Abre el archivo **`dist/config.js`** con el Bloc de notas y reemplaza:
```
window.APP_CONFIG = {
  SUPABASE_URL: "https://xxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi..."
};
```
Guarda el archivo.

## PASO 5 — Publicar en Netlify (la forma más fácil)
1. Entra a https://app.netlify.com/drop (crea una cuenta gratis si no tienes).
2. **Arrastra la carpeta `dist`** completa a la zona indicada.
3. Netlify te da un enlace (ej. `https://algo.netlify.app`). ¡Ese es tu sistema! Puedes cambiar el nombre en *Site configuration → Change site name* o conectar tu dominio.

> Si más adelante cambias `dist/config.js`, vuelve a arrastrar la carpeta `dist` (Deploys → arrastrar).

**Alternativa con GitHub:** sube la carpeta completa a un repositorio, en Netlify elige *Import from Git*; ya trae la configuración (`npm run build`, carpeta `dist`). En ese caso edita `public/config.js` en lugar de `dist/config.js`.

---

## Primer ingreso
Abre tu enlace e ingresa con el correo y contraseña del administrador (Paso 3).

### Crear al personal
Administrador → **Usuarios** → **Crear usuario**: nombre, correo, contraseña inicial y **rol**
(Recepcionista, Mecánico, Almacenero, Administrador o Cliente). Esa persona ya puede ingresar con esos datos.
También puedes cambiar el rol, desactivar a alguien o enviarle un correo para restablecer su contraseña.

### Clientes
- Se pueden **registrar solos** desde la pantalla de ingreso ("Crear cuenta de cliente"), o los registra recepción.
- Un cliente solo ve **sus** vehículos, órdenes, cotizaciones, pagos y auxilios.

### Qué ve cada rol
| Rol | Acceso |
|---|---|
| Administrador | Todo: paneles, reportes, usuarios, catálogo, inventario, compras, pagos |
| Recepcionista | Emergencias, órdenes, cotizaciones, clientes, vehículos, pagos, historial, mantenimientos |
| Mecánico | Solo sus trabajos y auxilios asignados, repuestos/mano de obra, fotos antes/después, herramientas |
| Almacenero | Productos, inventario, entradas/salidas, compras, proveedores, herramientas (sin datos de clientes) |
| Cliente | Pedir auxilio 24/7 con GPS, sus vehículos, solicitar servicio, aprobar cotizaciones, pagos, historial |

---

## Notas importantes
- **Fotos y videos:** se guardan en un almacenamiento **privado** (`taller-files`) que ya crea el Script 1. No hay que crear nada a mano. Máximo 50 MB por archivo.
- **Stock automático:** cuando el mecánico agrega un repuesto a una orden, el stock baja solo; al registrar una compra, sube solo. Si no hay stock, el sistema no deja usarlo.
- **Ubicación GPS del auxilio:** el navegador del cliente pide permiso; funciona solo en páginas `https` (Netlify ya lo es).
- **Respaldos:** Supabase guarda copias diarias en planes de pago; en el plan gratis exporta tus datos periódicamente (Reportes → Descargar CSV).
- **Seguridad:** la clave *anon* es pública por diseño; los datos están protegidos por las reglas de seguridad (RLS) que crea el Script 1. Nunca pegues la clave *service_role* en la aplicación.
- **Problemas frecuentes:**
  - *"Falta conectar la base de datos"* → revisa `config.js` (Paso 4) y vuelve a subir `dist`.
  - *"Correo o contraseña incorrectos"* → confirma que el usuario existe en Authentication y marcaste Auto Confirm.
  - *Ingreso pero no soy administrador* → ejecuta el Script 2 con el correo exacto.
  - *"El correo no está confirmado"* → desactiva "Confirm email" (Paso 3.3).
