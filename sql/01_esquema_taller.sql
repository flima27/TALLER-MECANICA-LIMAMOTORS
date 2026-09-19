-- =====================================================================
--  SISTEMA INTEGRAL DE TALLER MECÁNICO Y AUXILIO 24/7
--  SCRIPT 1 DE 2: crea toda la base de datos
--  Cómo usarlo: Supabase > SQL Editor > New query > pegar TODO > Run
--  (Es seguro ejecutarlo en un proyecto nuevo. No lo ejecutes dos veces.)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PERFILES (un perfil por cada usuario de Authentication)
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null default '',
  phone text,
  role text not null default 'cliente'
    check (role in ('admin','recepcionista','mecanico','almacenero','cliente')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Funciones de ayuda para la seguridad (leen el rol del usuario conectado)
create or replace function public.auth_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.has_role(variadic roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role() = any(roles), false)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role() = 'admin', false)
$$;

-- ---------------------------------------------------------------------
-- 2. CLIENTES Y VEHÍCULOS
-- ---------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles(id) on delete set null,
  full_name text not null,
  phone text,
  email text,
  doc_id text,
  address text,
  notes text,
  created_at timestamptz not null default now()
);

create or replace function public.my_customer_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.customers where user_id = auth.uid() limit 1
$$;

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  brand text not null,
  model text not null,
  year int,
  plate text not null,
  vin text,
  color text,
  fuel_type text,
  engine text,
  mileage int,
  notes text,
  created_at timestamptz not null default now()
);
create index on public.vehicles (customer_id);
create index on public.vehicles (plate);

-- ---------------------------------------------------------------------
-- 3. SERVICIOS
-- ---------------------------------------------------------------------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  category text,
  description text,
  base_price numeric(12,2) not null default 0,
  est_minutes int,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. PROVEEDORES, ALMACENES Y PRODUCTOS
-- ---------------------------------------------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  nit text,
  phone text,
  address text,
  email text,
  contact text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  barcode text,
  name text not null,
  kind text not null default 'repuesto'
    check (kind in ('repuesto','lubricante','aceite','filtro','material','accesorio')),
  category text,
  brand text,
  model text,
  part_number text,
  description text,
  supplier_id uuid references public.suppliers(id) on delete set null,
  purchase_price numeric(12,2) not null default 0,
  sale_price numeric(12,2) not null default 0,
  min_stock numeric(12,2) not null default 0,
  unit text not null default 'unidad',
  location text,
  compatibility text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.warehouse_stock (
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  qty numeric(12,2) not null default 0 constraint warehouse_stock_qty_check check (qty >= 0),
  primary key (warehouse_id, product_id)
);

-- ---------------------------------------------------------------------
-- 5. EMERGENCIAS (AUXILIO 24/7)
-- ---------------------------------------------------------------------
create table public.emergency_requests (
  id uuid primary key default gen_random_uuid(),
  number bigint generated by default as identity unique,
  customer_id uuid not null references public.customers(id),
  vehicle_id uuid references public.vehicles(id) on delete set null,
  contact_name text,
  phone text,
  plate text,
  vehicle_desc text,
  lat double precision,
  lng double precision,
  address text,
  type text not null default 'otro'
    check (type in ('no_arranca','bateria','electrico','llanta','sobrecalentamiento','falla_motor','combustible','mecanico','accidente','otro')),
  description text,
  urgency text not null default 'media' check (urgency in ('baja','media','alta','critica')),
  status text not null default 'pendiente'
    check (status in ('pendiente','asignado','en_camino','en_atencion','finalizado','cancelado')),
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.emergency_requests (customer_id);
create index on public.emergency_requests (status);

create table public.emergency_status_history (
  id uuid primary key default gen_random_uuid(),
  emergency_id uuid not null references public.emergency_requests(id) on delete cascade,
  status text not null,
  note text,
  changed_by uuid references public.profiles(id) on delete set null default auth.uid(),
  changed_at timestamptz not null default now()
);
create index on public.emergency_status_history (emergency_id);

-- ---------------------------------------------------------------------
-- 6. ÓRDENES DE TRABAJO
-- ---------------------------------------------------------------------
create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated by default as identity unique,
  customer_id uuid not null references public.customers(id),
  vehicle_id uuid not null references public.vehicles(id),
  origin text not null default 'presencial'
    check (origin in ('presencial','solicitud_cliente','auxilio','mantenimiento','interno')),
  emergency_id uuid references public.emergency_requests(id) on delete set null,
  mileage int,
  reported_problem text,
  initial_diagnosis text,
  diagnosis text,
  work_done text,
  observations text,
  discount numeric(12,2) not null default 0,
  status text not null default 'abierta'
    check (status in ('abierta','diagnostico','cotizacion','aprobada','en_proceso','pausada','terminada','entregada','cancelada')),
  mechanic_id uuid references public.profiles(id) on delete set null,
  opened_at timestamptz not null default now(),
  finished_at timestamptz,
  delivered_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null default auth.uid()
);
create index on public.work_orders (customer_id);
create index on public.work_orders (vehicle_id);
create index on public.work_orders (mechanic_id);
create index on public.work_orders (status);

create table public.work_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.work_orders(id) on delete cascade,
  kind text not null check (kind in ('servicio','mano_obra','repuesto','lubricante','material','otro')),
  service_id uuid references public.services(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  description text not null,
  qty numeric(12,2) not null default 1 check (qty > 0),
  unit_price numeric(12,2) not null default 0,
  added_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.work_order_items (order_id);

-- ---------------------------------------------------------------------
-- 7. COTIZACIONES
-- ---------------------------------------------------------------------
create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  number bigint generated by default as identity unique,
  order_id uuid references public.work_orders(id) on delete set null,
  customer_id uuid not null references public.customers(id),
  vehicle_id uuid references public.vehicles(id) on delete set null,
  status text not null default 'borrador'
    check (status in ('borrador','enviada','aprobada','rechazada')),
  discount numeric(12,2) not null default 0,
  notes text,
  valid_until date,
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  decision_note text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.quotations (customer_id);
create index on public.quotations (order_id);

create table public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  kind text not null check (kind in ('servicio','mano_obra','repuesto','lubricante','material','otro')),
  service_id uuid references public.services(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  description text not null,
  qty numeric(12,2) not null default 1 check (qty > 0),
  unit_price numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
create index on public.quotation_items (quotation_id);

-- ---------------------------------------------------------------------
-- 8. PAGOS
-- ---------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.work_orders(id),
  customer_id uuid not null references public.customers(id),
  amount numeric(12,2) not null check (amount > 0),
  method text not null default 'efectivo' check (method in ('efectivo','transferencia','qr','otro')),
  status text not null default 'pagado' check (status in ('pagado','pendiente','anulado')),
  paid_at timestamptz not null default now(),
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.payments (order_id);
create index on public.payments (customer_id);

-- ---------------------------------------------------------------------
-- 9. MOVIMIENTOS DE INVENTARIO, COMPRAS Y HERRAMIENTAS
-- ---------------------------------------------------------------------
create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  warehouse_id uuid not null references public.warehouses(id),
  to_warehouse_id uuid references public.warehouses(id),
  type text not null check (type in ('entrada','salida','transferencia')),
  reason text not null default 'ajuste'
    check (reason in ('compra','devolucion','ajuste','venta','uso_orden','traslado','baja')),
  qty numeric(12,2) not null check (qty > 0),
  order_id uuid references public.work_orders(id) on delete set null,
  purchase_id uuid,
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.inventory_movements (product_id);
create index on public.inventory_movements (created_at);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  number bigint generated by default as identity unique,
  supplier_id uuid references public.suppliers(id) on delete set null,
  warehouse_id uuid not null references public.warehouses(id),
  invoice_number text,
  purchase_date date not null default current_date,
  total numeric(12,2) not null default 0,
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  product_id uuid not null references public.products(id),
  qty numeric(12,2) not null check (qty > 0),
  unit_cost numeric(12,2) not null default 0
);
create index on public.purchase_items (purchase_id);

create table public.tools (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  brand text,
  model text,
  status text not null default 'disponible'
    check (status in ('disponible','prestada','mantenimiento','danada','baja')),
  location text,
  holder_id uuid references public.profiles(id) on delete set null,
  acquired_at date,
  notes text,
  created_at timestamptz not null default now()
);

create table public.tool_movements (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.tools(id) on delete cascade,
  action text not null check (action in ('prestamo','devolucion','mantenimiento','danada','baja','otro')),
  holder_id uuid references public.profiles(id) on delete set null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 10. MANTENIMIENTOS, PROMOCIONES, NOTIFICACIONES, ARCHIVOS
-- ---------------------------------------------------------------------
create table public.maintenance_schedules (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  service_name text not null,
  last_date date,
  last_km int,
  next_date date,
  next_km int,
  done boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);
create index on public.maintenance_schedules (customer_id);
create index on public.maintenance_schedules (next_date);

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default 'promocion'
    check (kind in ('promocion','descuento','paquete','campana','combo')),
  description text,
  discount_percent numeric(5,2),
  price numeric(12,2),
  valid_from date,
  valid_to date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, read);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  path text not null unique,
  file_name text,
  mime text,
  size bigint,
  folder text not null
    check (folder in ('vehiculos','emergencias','ordenes','trabajos','cotizaciones','pagos','compras','documentos')),
  entity_type text not null,
  entity_id uuid,
  customer_id uuid references public.customers(id) on delete set null,
  phase text check (phase in ('antes','despues','otro')),
  caption text,
  uploaded_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.files (entity_type, entity_id);

-- ---------------------------------------------------------------------
-- 11. VISTAS ÚTILES (respetan la seguridad de cada usuario)
-- ---------------------------------------------------------------------
create view public.product_stock with (security_invoker = true) as
select p.id, p.code, p.name, p.kind, p.category, p.brand, p.unit, p.min_stock,
       p.sale_price, p.purchase_price, p.location, p.active,
       coalesce((select sum(ws.qty) from public.warehouse_stock ws where ws.product_id = p.id), 0) as total_qty
from public.products p;

create view public.low_stock_products with (security_invoker = true) as
select * from public.product_stock where active and total_qty <= min_stock;

create view public.order_balances with (security_invoker = true) as
select o.id as order_id, o.number, o.customer_id, o.status,
       greatest(coalesce((select sum(i.qty * i.unit_price) from public.work_order_items i where i.order_id = o.id), 0) - o.discount, 0) as total,
       coalesce((select sum(p.amount) from public.payments p where p.order_id = o.id and p.status = 'pagado'), 0) as paid
from public.work_orders o;

-- ---------------------------------------------------------------------
-- 12. NOTIFICACIONES AUTOMÁTICAS (funciones internas)
-- ---------------------------------------------------------------------
create or replace function public.notify_role(p_roles text[], p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, title, body, link)
  select id, p_title, p_body, p_link from public.profiles where role = any(p_roles) and active;
$$;

create or replace function public.notify_user(p_user uuid, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, title, body, link)
  select p_user, p_title, p_body, p_link where p_user is not null;
$$;

create or replace function public.notify_customer(p_customer uuid, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, title, body, link)
  select user_id, p_title, p_body, p_link from public.customers where id = p_customer and user_id is not null;
$$;

revoke execute on function public.notify_role(text[], text, text, text) from public, anon, authenticated;
revoke execute on function public.notify_user(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.notify_customer(uuid, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 13. TRIGGERS: usuarios nuevos
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_cid uuid;
begin
  v_name := coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(coalesce(new.email, 'usuario'), '@', 1));
  insert into public.profiles (id, email, full_name, phone, role)
  values (new.id, new.email, v_name, new.raw_user_meta_data->>'phone', 'cliente')
  on conflict (id) do nothing;

  -- Si recepción ya había registrado a este cliente con el mismo correo, se enlaza
  select id into v_cid from public.customers
   where user_id is null and new.email is not null and lower(email) = lower(new.email) limit 1;
  if v_cid is not null then
    update public.customers set user_id = new.id where id = v_cid;
  else
    insert into public.customers (user_id, full_name, phone, email)
    values (new.id, v_name, new.raw_user_meta_data->>'phone', new.email);
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if not public.is_admin() then
      if new.role <> old.role or new.active <> old.active or new.id <> old.id then
        raise exception 'No tienes permiso para cambiar el rol o el estado de un usuario';
      end if;
    elsif old.id = auth.uid() and (new.role <> 'admin' or not new.active) then
      raise exception 'No puedes quitarte a ti mismo el rol de administrador ni desactivarte';
    end if;
  end if;
  return new;
end $$;

create trigger trg_protect_profile before update on public.profiles
  for each row execute function public.protect_profile();

create or replace function public.sync_customer_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role <> old.role then
    if new.role <> 'cliente' then
      begin
        delete from public.customers where user_id = new.id;
      exception when foreign_key_violation then
        update public.customers set user_id = null where user_id = new.id;
      end;
    elsif not exists (select 1 from public.customers where user_id = new.id) then
      insert into public.customers (user_id, full_name, phone, email)
      values (new.id, new.full_name, new.phone, new.email);
    end if;
  end if;
  return new;
end $$;

create trigger trg_sync_customer_role after update of role on public.profiles
  for each row execute function public.sync_customer_role();

-- ---------------------------------------------------------------------
-- 14. TRIGGERS: inventario
-- ---------------------------------------------------------------------
create or replace function public.apply_inventory_movement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_total numeric;
  v_min numeric;
  v_name text;
begin
  if new.type = 'entrada' then
    insert into public.warehouse_stock (warehouse_id, product_id, qty)
    values (new.warehouse_id, new.product_id, new.qty)
    on conflict (warehouse_id, product_id) do update set qty = public.warehouse_stock.qty + excluded.qty;
  elsif new.type = 'salida' then
    update public.warehouse_stock set qty = qty - new.qty
     where warehouse_id = new.warehouse_id and product_id = new.product_id;
    if not found then
      raise exception 'Stock insuficiente: el producto no tiene existencias en ese almacén';
    end if;
  else
    if new.to_warehouse_id is null or new.to_warehouse_id = new.warehouse_id then
      raise exception 'Elige un almacén de destino distinto al de origen';
    end if;
    update public.warehouse_stock set qty = qty - new.qty
     where warehouse_id = new.warehouse_id and product_id = new.product_id;
    if not found then
      raise exception 'Stock insuficiente: el producto no tiene existencias en el almacén de origen';
    end if;
    insert into public.warehouse_stock (warehouse_id, product_id, qty)
    values (new.to_warehouse_id, new.product_id, new.qty)
    on conflict (warehouse_id, product_id) do update set qty = public.warehouse_stock.qty + excluded.qty;
  end if;

  if new.type = 'salida' then
    select coalesce(sum(qty), 0) into v_total from public.warehouse_stock where product_id = new.product_id;
    select min_stock, name into v_min, v_name from public.products where id = new.product_id;
    if v_total <= v_min then
      perform public.notify_role(array['admin','almacenero'], 'Stock bajo',
        v_name || ': quedan ' || v_total::text || ' (mínimo ' || v_min::text || ')', '/stock-bajo');
    end if;
  end if;
  return new;
end $$;

create trigger trg_apply_inventory_movement after insert on public.inventory_movements
  for each row execute function public.apply_inventory_movement();

create or replace function public.order_item_stock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.product_id is not null then
      if new.warehouse_id is null then
        raise exception 'Elige el almacén del que sale el producto';
      end if;
      insert into public.inventory_movements (product_id, warehouse_id, type, reason, qty, order_id, notes, created_by)
      values (new.product_id, new.warehouse_id, 'salida', 'uso_orden', new.qty, new.order_id, 'Utilizado en orden de trabajo', auth.uid());
    end if;
    return new;
  else
    if old.product_id is not null and old.warehouse_id is not null then
      insert into public.inventory_movements (product_id, warehouse_id, type, reason, qty, order_id, notes, created_by)
      values (old.product_id, old.warehouse_id, 'entrada', 'devolucion', old.qty,
              (select id from public.work_orders where id = old.order_id),
              'Devuelto al quitarlo de la orden', auth.uid());
    end if;
    return old;
  end if;
end $$;

create trigger trg_order_item_stock_ins after insert on public.work_order_items
  for each row execute function public.order_item_stock();
create trigger trg_order_item_stock_del after delete on public.work_order_items
  for each row execute function public.order_item_stock();

create or replace function public.guard_order_item() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_order uuid;
begin
  v_order := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
  select status into v_status from public.work_orders where id = v_order;
  -- En cascada (al borrar la orden) la orden ya no existe: se permite
  if v_status is not null and v_status in ('entregada','cancelada') and not public.is_admin() then
    raise exception 'La orden está cerrada: solo un administrador puede modificar sus ítems';
  end if;
  if tg_op = 'UPDATE' and old.product_id is not null and
     (old.product_id is distinct from new.product_id or old.qty <> new.qty or old.warehouse_id is distinct from new.warehouse_id) then
    raise exception 'Para cambiar un producto o su cantidad, quítalo y vuelve a agregarlo';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger trg_guard_order_item before insert or update or delete on public.work_order_items
  for each row execute function public.guard_order_item();

create or replace function public.purchase_item_stock() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_wh uuid;
begin
  select warehouse_id into v_wh from public.purchases where id = new.purchase_id;
  insert into public.inventory_movements (product_id, warehouse_id, type, reason, qty, purchase_id, notes, created_by)
  values (new.product_id, v_wh, 'entrada', 'compra', new.qty, new.purchase_id, 'Compra registrada', auth.uid());
  update public.products set purchase_price = new.unit_cost where id = new.product_id and new.unit_cost > 0;
  update public.purchases set total = total + (new.qty * new.unit_cost) where id = new.purchase_id;
  return new;
end $$;

create trigger trg_purchase_item_stock after insert on public.purchase_items
  for each row execute function public.purchase_item_stock();

-- ---------------------------------------------------------------------
-- 15. TRIGGERS: emergencias, órdenes, pagos (historial y avisos)
-- ---------------------------------------------------------------------
create or replace function public.emergency_changes() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_label text;
begin
  if tg_op = 'INSERT' then
    insert into public.emergency_status_history (emergency_id, status, note, changed_by)
    values (new.id, new.status, 'Solicitud registrada', auth.uid());
    perform public.notify_role(array['admin','recepcionista'], 'Nueva emergencia #' || new.number::text,
      coalesce(new.contact_name, 'Cliente') || ' — urgencia ' || new.urgency, '/emergencias');
  else
    new.updated_at := now();
    if new.status <> old.status then
      insert into public.emergency_status_history (emergency_id, status, changed_by)
      values (new.id, new.status, auth.uid());
      v_label := replace(new.status, '_', ' ');
      perform public.notify_customer(new.customer_id, 'Tu auxilio #' || new.number::text || ' está: ' || v_label, null, '/auxilio');
    end if;
  end if;
  return new;
end $$;

create trigger trg_emergency_ins after insert on public.emergency_requests
  for each row execute function public.emergency_changes();
create trigger trg_emergency_upd before update on public.emergency_requests
  for each row execute function public.emergency_changes();

create or replace function public.emergency_assigned() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then
    perform public.notify_user(new.assigned_to, 'Te asignaron el auxilio #' || new.number::text,
      coalesce(new.address, 'Ver ubicación en la solicitud'), '/emergencias');
  end if;
  return new;
end $$;

create trigger trg_emergency_assigned after update on public.emergency_requests
  for each row execute function public.emergency_assigned();

create or replace function public.order_changes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.origin = 'solicitud_cliente' then
      perform public.notify_role(array['admin','recepcionista'], 'Nueva solicitud de servicio #' || new.number::text,
        left(coalesce(new.reported_problem, ''), 120), '/ordenes/' || new.id::text);
    else
      perform public.notify_role(array['admin'], 'Nueva orden #' || new.number::text, null, '/ordenes/' || new.id::text);
    end if;
    return new;
  end if;

  -- UPDATE
  if auth.uid() is not null and public.auth_role() = 'mecanico' then
    if old.status in ('entregada','cancelada') then
      raise exception 'La orden está cerrada';
    end if;
    if new.customer_id <> old.customer_id or new.vehicle_id <> old.vehicle_id
       or new.mechanic_id is distinct from old.mechanic_id or new.discount <> old.discount then
      raise exception 'El mecánico no puede cambiar cliente, vehículo, mecánico ni descuento';
    end if;
    if new.status <> old.status and new.status not in ('diagnostico','en_proceso','pausada','terminada') then
      raise exception 'Estado no permitido para el mecánico';
    end if;
  end if;

  if new.status <> old.status then
    if new.status = 'terminada' then new.finished_at := now(); end if;
    if new.status = 'entregada' then new.delivered_at := now(); end if;
    if new.status = 'terminada' then
      perform public.notify_customer(new.customer_id, 'Tu vehículo está listo (orden #' || new.number::text || ')', null, '/ordenes/' || new.id::text);
      perform public.notify_role(array['admin','recepcionista'], 'Trabajo terminado: orden #' || new.number::text, null, '/ordenes/' || new.id::text);
    end if;
  end if;
  if new.mechanic_id is distinct from old.mechanic_id and new.mechanic_id is not null then
    perform public.notify_user(new.mechanic_id, 'Nuevo trabajo asignado: orden #' || new.number::text, left(coalesce(new.reported_problem, ''), 120), '/trabajos/' || new.id::text);
  end if;
  return new;
end $$;

create trigger trg_order_ins after insert on public.work_orders
  for each row execute function public.order_changes();
create trigger trg_order_upd before update on public.work_orders
  for each row execute function public.order_changes();

create or replace function public.quotation_sent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'enviada' and (tg_op = 'INSERT' or old.status <> 'enviada') then
    perform public.notify_customer(new.customer_id, 'Nueva cotización #' || new.number::text, 'Revísala y apruébala o recházala', '/cotizaciones');
  end if;
  return new;
end $$;

create trigger trg_quotation_sent after insert or update of status on public.quotations
  for each row execute function public.quotation_sent();

create or replace function public.payment_received() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pagado' then
    perform public.notify_role(array['admin'], 'Pago recibido', 'Bs ' || new.amount::text, '/pagos');
    perform public.notify_customer(new.customer_id, 'Registramos tu pago', 'Bs ' || new.amount::text, '/pagos');
  end if;
  return new;
end $$;

create trigger trg_payment_received after insert on public.payments
  for each row execute function public.payment_received();

-- ---------------------------------------------------------------------
-- 16. FUNCIONES QUE USA EL CLIENTE DESDE SU PORTAL
-- ---------------------------------------------------------------------
create or replace function public.respond_quotation(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare q public.quotations;
begin
  select * into q from public.quotations where id = p_id;
  if not found or q.customer_id is distinct from public.my_customer_id() then
    raise exception 'Cotización no encontrada';
  end if;
  if q.status <> 'enviada' then
    raise exception 'Esta cotización ya fue respondida o aún no está disponible';
  end if;
  update public.quotations
     set status = case when p_approve then 'aprobada' else 'rechazada' end,
         decided_at = now(), decided_by = auth.uid(), decision_note = p_note
   where id = p_id;
  if q.order_id is not null then
    update public.work_orders
       set status = case when p_approve then 'aprobada' else 'diagnostico' end
     where id = q.order_id and status in ('abierta','diagnostico','cotizacion');
  end if;
  perform public.notify_role(array['admin','recepcionista'],
    case when p_approve then 'Cotización aprobada #' else 'Cotización rechazada #' end || q.number::text,
    p_note, '/cotizaciones/' || q.id::text);
end $$;

create or replace function public.cancel_emergency(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e public.emergency_requests;
begin
  select * into e from public.emergency_requests where id = p_id;
  if not found or e.customer_id is distinct from public.my_customer_id() then
    raise exception 'Solicitud no encontrada';
  end if;
  if e.status not in ('pendiente','asignado') then
    raise exception 'Ya no se puede cancelar: el mecánico ya va en camino';
  end if;
  update public.emergency_requests set status = 'cancelado' where id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- 17. SEGURIDAD (RLS): cada rol solo ve y hace lo que le corresponde
-- ---------------------------------------------------------------------
create or replace function public.can_view_order(p_order uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.work_orders o where o.id = p_order and (
      public.has_role('admin','recepcionista','almacenero')
      or (public.has_role('mecanico') and o.mechanic_id = auth.uid())
      or (public.has_role('cliente') and o.customer_id = public.my_customer_id())
    )
  )
$$;

create or replace function public.can_edit_order(p_order uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.work_orders o where o.id = p_order and (
      public.has_role('admin','recepcionista')
      or (public.has_role('mecanico') and o.mechanic_id = auth.uid())
    )
  )
$$;

create or replace function public.mechanic_sees_customer(p_customer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role('mecanico') and (
    exists (select 1 from public.work_orders o where o.customer_id = p_customer and o.mechanic_id = auth.uid())
    or exists (select 1 from public.emergency_requests e where e.customer_id = p_customer and e.assigned_to = auth.uid())
  )
$$;

create or replace function public.mechanic_sees_vehicle(p_vehicle uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role('mecanico') and (
    exists (select 1 from public.work_orders o where o.vehicle_id = p_vehicle and o.mechanic_id = auth.uid())
    or exists (select 1 from public.emergency_requests e where e.vehicle_id = p_vehicle and e.assigned_to = auth.uid())
  )
$$;

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.vehicles enable row level security;
alter table public.services enable row level security;
alter table public.suppliers enable row level security;
alter table public.warehouses enable row level security;
alter table public.products enable row level security;
alter table public.warehouse_stock enable row level security;
alter table public.emergency_requests enable row level security;
alter table public.emergency_status_history enable row level security;
alter table public.work_orders enable row level security;
alter table public.work_order_items enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
alter table public.payments enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.tools enable row level security;
alter table public.tool_movements enable row level security;
alter table public.maintenance_schedules enable row level security;
alter table public.promotions enable row level security;
alter table public.notifications enable row level security;
alter table public.files enable row level security;

-- PROFILES
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_role('admin','recepcionista','almacenero','mecanico'));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- CUSTOMERS
create policy customers_select on public.customers for select to authenticated
  using (public.has_role('admin','recepcionista') or user_id = auth.uid() or public.mechanic_sees_customer(id));
create policy customers_insert on public.customers for insert to authenticated
  with check (public.has_role('admin','recepcionista'));
create policy customers_update on public.customers for update to authenticated
  using (public.has_role('admin','recepcionista') or user_id = auth.uid())
  with check (public.has_role('admin','recepcionista') or user_id = auth.uid());
create policy customers_delete on public.customers for delete to authenticated using (public.is_admin());

-- VEHICLES
create policy vehicles_select on public.vehicles for select to authenticated
  using (public.has_role('admin','recepcionista') or customer_id = public.my_customer_id() or public.mechanic_sees_vehicle(id));
create policy vehicles_insert on public.vehicles for insert to authenticated
  with check (public.has_role('admin','recepcionista') or (public.has_role('cliente') and customer_id = public.my_customer_id()));
create policy vehicles_update on public.vehicles for update to authenticated
  using (public.has_role('admin','recepcionista') or (public.has_role('cliente') and customer_id = public.my_customer_id()))
  with check (public.has_role('admin','recepcionista') or (public.has_role('cliente') and customer_id = public.my_customer_id()));
create policy vehicles_delete on public.vehicles for delete to authenticated using (public.is_admin());

-- SERVICES
create policy services_select on public.services for select to authenticated using (public.auth_role() is not null);
create policy services_write on public.services for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- SUPPLIERS
create policy suppliers_select on public.suppliers for select to authenticated
  using (public.has_role('admin','almacenero'));
create policy suppliers_write on public.suppliers for all to authenticated
  using (public.has_role('admin','almacenero')) with check (public.has_role('admin','almacenero'));

-- WAREHOUSES
create policy warehouses_select on public.warehouses for select to authenticated
  using (public.has_role('admin','recepcionista','almacenero','mecanico'));
create policy warehouses_write on public.warehouses for all to authenticated
  using (public.has_role('admin','almacenero')) with check (public.has_role('admin','almacenero'));

-- PRODUCTS
create policy products_select on public.products for select to authenticated
  using (public.has_role('admin','recepcionista','almacenero','mecanico'));
create policy products_write on public.products for all to authenticated
  using (public.has_role('admin','almacenero')) with check (public.has_role('admin','almacenero'));

-- WAREHOUSE_STOCK (solo lectura: lo actualizan los movimientos)
create policy warehouse_stock_select on public.warehouse_stock for select to authenticated
  using (public.has_role('admin','recepcionista','almacenero','mecanico'));

-- INVENTORY_MOVEMENTS
create policy movements_select on public.inventory_movements for select to authenticated
  using (public.has_role('admin','recepcionista','almacenero'));
create policy movements_insert on public.inventory_movements for insert to authenticated
  with check (public.has_role('admin','almacenero'));

-- PURCHASES
create policy purchases_select on public.purchases for select to authenticated
  using (public.has_role('admin','almacenero'));
create policy purchases_write on public.purchases for all to authenticated
  using (public.has_role('admin','almacenero')) with check (public.has_role('admin','almacenero'));
create policy purchase_items_select on public.purchase_items for select to authenticated
  using (public.has_role('admin','almacenero'));
create policy purchase_items_insert on public.purchase_items for insert to authenticated
  with check (public.has_role('admin','almacenero'));
create policy purchase_items_delete on public.purchase_items for delete to authenticated
  using (public.is_admin());

-- TOOLS
create policy tools_select on public.tools for select to authenticated
  using (public.has_role('admin','almacenero','mecanico'));
create policy tools_write on public.tools for all to authenticated
  using (public.has_role('admin','almacenero')) with check (public.has_role('admin','almacenero'));
create policy tool_movements_select on public.tool_movements for select to authenticated
  using (public.has_role('admin','almacenero','mecanico'));
create policy tool_movements_insert on public.tool_movements for insert to authenticated
  with check (public.has_role('admin','almacenero'));

-- EMERGENCIAS
create policy emergency_select on public.emergency_requests for select to authenticated
  using (public.has_role('admin','recepcionista')
         or customer_id = public.my_customer_id()
         or (public.has_role('mecanico') and assigned_to = auth.uid()));
create policy emergency_insert on public.emergency_requests for insert to authenticated
  with check (
    public.has_role('admin','recepcionista')
    or (public.has_role('cliente') and customer_id = public.my_customer_id()
        and status = 'pendiente' and assigned_to is null
        and (vehicle_id is null or exists (select 1 from public.vehicles v where v.id = vehicle_id and v.customer_id = public.my_customer_id())))
  );
create policy emergency_update on public.emergency_requests for update to authenticated
  using (public.has_role('admin','recepcionista') or (public.has_role('mecanico') and assigned_to = auth.uid()))
  with check (public.has_role('admin','recepcionista') or (public.has_role('mecanico') and assigned_to = auth.uid()));
create policy emergency_delete on public.emergency_requests for delete to authenticated using (public.is_admin());

create policy emergency_history_select on public.emergency_status_history for select to authenticated
  using (exists (select 1 from public.emergency_requests e where e.id = emergency_id));

-- ÓRDENES DE TRABAJO
create policy orders_select on public.work_orders for select to authenticated
  using (public.has_role('admin','recepcionista','almacenero')
         or (public.has_role('mecanico') and mechanic_id = auth.uid())
         or (public.has_role('cliente') and customer_id = public.my_customer_id()));
create policy orders_insert on public.work_orders for insert to authenticated
  with check (
    public.has_role('admin','recepcionista')
    or (public.has_role('cliente') and customer_id = public.my_customer_id()
        and origin = 'solicitud_cliente' and status = 'abierta' and mechanic_id is null
        and exists (select 1 from public.vehicles v where v.id = vehicle_id and v.customer_id = public.my_customer_id()))
  );
create policy orders_update on public.work_orders for update to authenticated
  using (public.has_role('admin','recepcionista') or (public.has_role('mecanico') and mechanic_id = auth.uid()))
  with check (public.has_role('admin','recepcionista') or (public.has_role('mecanico') and mechanic_id = auth.uid()));
create policy orders_delete on public.work_orders for delete to authenticated using (public.is_admin());

create policy order_items_select on public.work_order_items for select to authenticated
  using (public.can_view_order(order_id));
create policy order_items_insert on public.work_order_items for insert to authenticated
  with check (public.can_edit_order(order_id));
create policy order_items_update on public.work_order_items for update to authenticated
  using (public.can_edit_order(order_id)) with check (public.can_edit_order(order_id));
create policy order_items_delete on public.work_order_items for delete to authenticated
  using (public.can_edit_order(order_id));

-- COTIZACIONES
create policy quotations_select on public.quotations for select to authenticated
  using (public.has_role('admin','recepcionista')
         or (public.has_role('cliente') and customer_id = public.my_customer_id() and status <> 'borrador'));
create policy quotations_write on public.quotations for all to authenticated
  using (public.has_role('admin','recepcionista')) with check (public.has_role('admin','recepcionista'));
create policy quotation_items_select on public.quotation_items for select to authenticated
  using (exists (select 1 from public.quotations q where q.id = quotation_id));
create policy quotation_items_write on public.quotation_items for all to authenticated
  using (public.has_role('admin','recepcionista')) with check (public.has_role('admin','recepcionista'));

-- PAGOS
create policy payments_select on public.payments for select to authenticated
  using (public.has_role('admin','recepcionista') or customer_id = public.my_customer_id());
create policy payments_insert on public.payments for insert to authenticated
  with check (public.has_role('admin','recepcionista'));
create policy payments_update on public.payments for update to authenticated
  using (public.has_role('admin','recepcionista')) with check (public.has_role('admin','recepcionista'));
create policy payments_delete on public.payments for delete to authenticated using (public.is_admin());

-- MANTENIMIENTOS
create policy maintenance_select on public.maintenance_schedules for select to authenticated
  using (public.has_role('admin','recepcionista') or customer_id = public.my_customer_id());
create policy maintenance_write on public.maintenance_schedules for all to authenticated
  using (public.has_role('admin','recepcionista')) with check (public.has_role('admin','recepcionista'));

-- PROMOCIONES
create policy promotions_select on public.promotions for select to authenticated
  using (public.has_role('admin','recepcionista') or (active and public.auth_role() is not null));
create policy promotions_write on public.promotions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- NOTIFICACIONES
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());
create policy notifications_insert on public.notifications for insert to authenticated
  with check (public.has_role('admin','recepcionista'));

-- ARCHIVOS (fotos, videos, comprobantes)
create policy files_select on public.files for select to authenticated using (
  public.has_role('admin','recepcionista')
  or uploaded_by = auth.uid()
  or (public.has_role('cliente') and customer_id = public.my_customer_id())
  or (public.has_role('mecanico') and (
        (entity_type = 'order' and public.can_view_order(entity_id))
        or (entity_type = 'emergency' and exists (select 1 from public.emergency_requests e where e.id = entity_id and e.assigned_to = auth.uid()))
        or (entity_type = 'vehicle' and public.mechanic_sees_vehicle(entity_id))))
  or (public.has_role('almacenero') and folder in ('compras','documentos'))
);
create policy files_insert on public.files for insert to authenticated with check (
  uploaded_by = auth.uid() and (
    public.is_admin()
    or (public.has_role('recepcionista') and folder in ('vehiculos','emergencias','ordenes','trabajos','cotizaciones','pagos','documentos'))
    or (public.has_role('mecanico') and folder in ('emergencias','ordenes','trabajos','documentos'))
    or (public.has_role('almacenero') and folder in ('compras','documentos'))
    or (public.has_role('cliente') and folder in ('vehiculos','emergencias') and customer_id = public.my_customer_id())
  )
);
create policy files_delete on public.files for delete to authenticated
  using (public.is_admin() or uploaded_by = auth.uid());

-- ---------------------------------------------------------------------
-- 18. ALMACENAMIENTO DE ARCHIVOS (bucket privado "taller-files")
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('taller-files', 'taller-files', false)
on conflict (id) do nothing;

create policy "taller_files_select" on storage.objects for select to authenticated
  using (bucket_id = 'taller-files'
         and exists (select 1 from public.files f where f.path = storage.objects.name));
create policy "taller_files_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'taller-files' and public.auth_role() is not null);
create policy "taller_files_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'taller-files' and (public.is_admin() or owner_id = auth.uid()::text));

-- ---------------------------------------------------------------------
-- 19. DATOS INICIALES (almacenes y catálogo de servicios)
-- ---------------------------------------------------------------------
insert into public.warehouses (name, description) values
  ('Almacén principal', 'Almacén general del taller'),
  ('Almacén de repuestos', 'Repuestos y accesorios'),
  ('Almacén de lubricantes', 'Aceites, lubricantes y filtros'),
  ('Almacén de herramientas', 'Herramientas y equipos')
on conflict (name) do nothing;

insert into public.services (code, name, category, description, base_price, est_minutes) values
  ('SRV-001', 'Mecánica general', 'Mecánica', 'Revisión y reparaciones mecánicas generales', 0, 60),
  ('SRV-002', 'Electricidad automotriz', 'Electricidad', 'Diagnóstico y reparación del sistema eléctrico', 0, 60),
  ('SRV-003', 'Diagnóstico computarizado', 'Diagnóstico', 'Lectura de códigos y análisis con scanner', 0, 45),
  ('SRV-004', 'Mantenimiento preventivo', 'Mantenimiento', 'Revisión programada según kilometraje', 0, 90),
  ('SRV-005', 'Mantenimiento correctivo', 'Mantenimiento', 'Reparación de fallas detectadas', 0, 120),
  ('SRV-006', 'Reparación de motor', 'Motor', 'Reparación parcial o total del motor', 0, 480),
  ('SRV-007', 'Frenos', 'Frenos', 'Pastillas, discos, tambores, líquido de frenos', 0, 90),
  ('SRV-008', 'Suspensión', 'Suspensión', 'Amortiguadores, resortes, rótulas', 0, 120),
  ('SRV-009', 'Dirección', 'Dirección', 'Alineación, cremallera, terminales', 0, 90),
  ('SRV-010', 'Transmisión', 'Transmisión', 'Caja de cambios, embrague, diferencial', 0, 240),
  ('SRV-011', 'Cambio de aceite', 'Lubricación', 'Cambio de aceite de motor', 0, 30),
  ('SRV-012', 'Cambio de filtros', 'Lubricación', 'Filtros de aceite, aire, combustible y cabina', 0, 30),
  ('SRV-013', 'Lubricación', 'Lubricación', 'Engrase y lubricación general', 0, 30),
  ('SRV-014', 'Lavado', 'Estética', 'Lavado exterior e interior', 0, 45),
  ('SRV-015', 'Auxilio mecánico', 'Auxilio 24/7', 'Atención de emergencias en el lugar', 0, 60),
  ('SRV-016', 'Otros servicios', 'Otros', 'Servicios no clasificados', 0, 60)
on conflict (code) do nothing;
