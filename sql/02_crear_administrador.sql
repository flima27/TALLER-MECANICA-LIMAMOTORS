-- =====================================================================
--  SCRIPT 2 DE 2: convertir tu usuario en ADMINISTRADOR
--
--  ANTES de ejecutarlo:
--    1) En Supabase entra a  Authentication > Users > Add user > Create new user
--    2) Escribe tu correo y tu contraseña, y marca "Auto Confirm User"
--    3) Vuelve aquí y cambia SOLO el correo de la línea de abajo
--       (debe ser exactamente el mismo que creaste en el paso 2)
--    4) Pega el script en SQL Editor y presiona Run
-- =====================================================================

do $$
declare
  v_email text := 'CAMBIA_ESTE_CORREO@ejemplo.com';   -- <<< CAMBIA SOLO ESTO
  v_name  text := 'Administrador';                     -- (opcional) tu nombre
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(v_email);
  if v_id is null then
    raise exception 'No encontré ese correo en Authentication > Users. Revisa que esté escrito igual que al crear el usuario.';
  end if;

  insert into public.profiles (id, email, full_name, role, active)
  values (v_id, v_email, v_name, 'admin', true)
  on conflict (id) do update set role = 'admin', active = true, full_name = excluded.full_name;

  -- El administrador no es un "cliente": se quita su ficha de cliente si se creó sola
  begin
    delete from public.customers where user_id = v_id;
  exception when foreign_key_violation then
    update public.customers set user_id = null where user_id = v_id;
  end;

  raise notice 'Listo: % ahora es ADMINISTRADOR. Ya puedes entrar al sistema.', v_email;
end $$;
