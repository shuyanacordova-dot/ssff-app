-- Caja lista para el arranque del 25-sep-2026:
-- 1) El "día" de ventas y cobros se calcula en hora de Ecuador (la base de datos está en UTC; antes los cobros
--    hechos después de las 19:00 caían en el día siguiente).
-- 2) Apertura de caja: efectivo con el que abre cada sucursal. Tiene prioridad sobre el cierre anterior.

create table if not exists public.aperturas_caja (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  sucursal_id uuid not null references public.sucursales(id),
  fecha date not null,
  monto numeric not null check (monto >= 0),
  observaciones text,
  created_by uuid references public.usuarios(id),
  creado_en timestamptz not null default now(),
  unique (sucursal_id, fecha)
);
alter table public.aperturas_caja enable row level security;
revoke all on public.aperturas_caja from public, anon, authenticated;
grant select on public.aperturas_caja to authenticated;
create policy aperturas_caja_lectura on public.aperturas_caja for select to authenticated using (
  exists (select 1 from public.usuarios u join public.roles r on r.id = u.rol_id
          where u.auth_user_id = (select auth.uid()) and u.activo
            and (r.nombre = 'superadmin' or (u.empresa_id = aperturas_caja.empresa_id and public.tiene_permiso('cuadre_caja', 'leer'))))
);

create or replace function public.registrar_apertura_caja(p_empresa uuid, p_sucursal uuid, p_fecha date, p_monto numeric, p_observaciones text default null)
returns uuid language plpgsql security definer set search_path to 'public', 'app_private'
as $function$
declare v_user uuid; v_role text; v_id uuid;
begin
  select u.id, r.nombre into v_user, v_role
  from public.usuarios u join public.roles r on r.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and (r.nombre = 'superadmin' or u.empresa_id = p_empresa);
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('cuadre_caja', 'crear')) then
    raise exception 'No autorizado';
  end if;
  if p_monto is null or p_monto < 0 then raise exception 'Ingresa el efectivo con el que abre la caja.'; end if;
  if not exists (select 1 from public.sucursales where id = p_sucursal and empresa_id = p_empresa) then
    raise exception 'La sucursal no pertenece a la empresa.';
  end if;
  if exists (select 1 from public.cierres_caja where sucursal_id = p_sucursal and fecha = p_fecha) then
    raise exception 'Ese día ya tiene cuadre registrado; no se puede cambiar la apertura.';
  end if;
  insert into public.aperturas_caja (empresa_id, sucursal_id, fecha, monto, observaciones, created_by)
  values (p_empresa, p_sucursal, p_fecha, p_monto, nullif(trim(p_observaciones), ''), v_user)
  on conflict (sucursal_id, fecha) do update set monto = excluded.monto, observaciones = excluded.observaciones, created_by = excluded.created_by, creado_en = now()
  returning id into v_id;
  return v_id;
end;
$function$;
revoke all on function public.registrar_apertura_caja(uuid, uuid, date, numeric, text) from public, anon;
grant execute on function public.registrar_apertura_caja(uuid, uuid, date, numeric, text) to authenticated;

-- Caja de partida de un día: apertura de ese día, o lo más reciente entre aperturas anteriores y cierres anteriores.
create or replace function app_private.caja_de_partida(p_empresa uuid, p_sucursal uuid, p_fecha date, out fecha_ref date, out monto numeric, out origen text)
language sql stable security definer set search_path to 'public', 'app_private'
as $function$
  select x.fecha, x.monto, x.origen from (
    select a.fecha, a.monto, 'apertura'::text origen, a.fecha::timestamp orden from public.aperturas_caja a
      where a.empresa_id = p_empresa and a.sucursal_id = p_sucursal and a.fecha <= p_fecha
    union all
    select c.fecha, c.caja_fisica, 'cierre', c.fecha::timestamp + interval '23 hours 59 minutes' from public.cierres_caja c
      where c.empresa_id = p_empresa and c.sucursal_id = p_sucursal and c.fecha < p_fecha
  ) x order by x.orden desc limit 1;
$function$;
revoke all on function app_private.caja_de_partida(uuid, uuid, date) from public, anon;
grant execute on function app_private.caja_de_partida(uuid, uuid, date) to authenticated;

create or replace function public.previsualizar_cierre_caja(p_empresa uuid, p_sucursal uuid, p_fecha date)
returns jsonb language plpgsql security definer set search_path to 'public', 'app_private'
as $function$
declare
  v_user uuid; v_role text; v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Guayaquil')::date);
  v_fecha_caja_anterior date; v_caja_anterior numeric := 0; v_origen text; v_ventas_brutas numeric := 0;
  v_efectivo numeric := 0; v_tarjeta numeric := 0; v_pich numeric := 0; v_guay numeric := 0; v_intl numeric := 0; v_credito numeric := 0; v_otro numeric := 0;
  v_egresos_efectivo numeric := 0; v_egresos_banco numeric := 0;
  v_ya_existe boolean;
begin
  select u.id, r.nombre into v_user, v_role
  from public.usuarios u join public.roles r on r.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and (r.nombre = 'superadmin' or u.empresa_id = p_empresa);
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('cuadre_caja', 'leer')) then
    raise exception 'No autorizado';
  end if;

  select exists(select 1 from public.cierres_caja where empresa_id = p_empresa and sucursal_id = p_sucursal and fecha = v_fecha) into v_ya_existe;

  select c.fecha_ref, c.monto, c.origen into v_fecha_caja_anterior, v_caja_anterior, v_origen from app_private.caja_de_partida(p_empresa, p_sucursal, v_fecha) c;
  v_caja_anterior := coalesce(v_caja_anterior, 0);

  select coalesce(sum(total), 0) into v_ventas_brutas from public.ventas
  where empresa_id = p_empresa and sucursal_id = p_sucursal and estado = 'completada' and (creado_en at time zone 'America/Guayaquil')::date = v_fecha;

  select
    coalesce(sum(p.monto) filter (where p.metodo = 'efectivo'), 0),
    coalesce(sum(p.monto) filter (where p.metodo = 'tarjeta'), 0),
    coalesce(sum(p.monto) filter (where p.metodo = 'transferencia' and p.banco = 'pichincha'), 0),
    coalesce(sum(p.monto) filter (where p.metodo = 'transferencia' and p.banco = 'guayaquil'), 0),
    coalesce(sum(p.monto) filter (where p.metodo = 'transferencia' and p.banco = 'internacional'), 0),
    coalesce(sum(p.monto) filter (where p.metodo = 'credito'), 0),
    coalesce(sum(p.monto) filter (where p.metodo = 'otro' or (p.metodo = 'transferencia' and (p.banco is null or p.banco = 'otro'))), 0)
  into v_efectivo, v_tarjeta, v_pich, v_guay, v_intl, v_credito, v_otro
  from public.pagos_venta p join public.ventas v on v.id = p.venta_id
  where v.empresa_id = p_empresa and v.sucursal_id = p_sucursal and v.estado <> 'anulada' and (p.creado_en at time zone 'America/Guayaquil')::date = v_fecha;

  select coalesce(sum(monto), 0) into v_egresos_efectivo from public.gastos
  where empresa_id = p_empresa and sucursal_id = p_sucursal and origen = 'caja' and fecha = v_fecha;
  select coalesce(sum(monto), 0) into v_egresos_banco from public.gastos
  where empresa_id = p_empresa and sucursal_id = p_sucursal and origen = 'banco' and fecha = v_fecha;

  return jsonb_build_object(
    'ya_existe', v_ya_existe, 'fecha_caja_anterior', v_fecha_caja_anterior, 'caja_anterior', v_caja_anterior, 'origen_caja_anterior', v_origen,
    'ventas_brutas', v_ventas_brutas, 'cobro_efectivo', v_efectivo, 'cobro_tarjeta', v_tarjeta,
    'cobro_transferencia_pichincha', v_pich, 'cobro_transferencia_guayaquil', v_guay,
    'cobro_transferencia_internacional', v_intl, 'cobro_credito', v_credito, 'cobro_otro', v_otro,
    'egresos_efectivo', v_egresos_efectivo, 'egresos_banco', v_egresos_banco
  );
end;
$function$;

create or replace function public.registrar_cierre_caja(p_empresa uuid, p_sucursal uuid, p_fecha date, p_declarado_efectivo numeric, p_declarado_tarjeta numeric, p_declarado_transferencia_pichincha numeric, p_declarado_transferencia_guayaquil numeric, p_declarado_transferencia_internacional numeric, p_caja_fisica numeric, p_deposito_pichincha numeric default 0, p_deposito_guayaquil numeric default 0, p_deposito_internacional numeric default 0, p_observaciones text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'app_private'
as $function$
declare
  v_user uuid; v_role text; v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Guayaquil')::date);
  v_caja_anterior numeric := 0; v_ventas_brutas numeric := 0;
  v_efectivo numeric := 0; v_tarjeta numeric := 0; v_pich numeric := 0; v_guay numeric := 0; v_intl numeric := 0; v_credito numeric := 0; v_otro numeric := 0;
  v_egresos_efectivo numeric := 0; v_egresos_banco numeric := 0; v_depositos numeric := 0;
  v_caja_esperada numeric; v_diferencia numeric; v_diferencia_declarados numeric;
  v_check_cobros boolean; v_check_metodos boolean; v_check_caja boolean; v_correcto boolean;
  v_id uuid;
begin
  select u.id, r.nombre into v_user, v_role
  from public.usuarios u join public.roles r on r.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and (r.nombre = 'superadmin' or u.empresa_id = p_empresa);
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('cuadre_caja', 'crear')) then
    raise exception 'No autorizado';
  end if;

  if p_caja_fisica is null or p_caja_fisica < 0 then
    raise exception 'Ingresa un valor válido para el efectivo contado en caja.';
  end if;
  if p_declarado_efectivo is null or p_declarado_efectivo < 0
    or p_declarado_tarjeta is null or p_declarado_tarjeta < 0
    or p_declarado_transferencia_pichincha is null or p_declarado_transferencia_pichincha < 0
    or p_declarado_transferencia_guayaquil is null or p_declarado_transferencia_guayaquil < 0
    or p_declarado_transferencia_internacional is null or p_declarado_transferencia_internacional < 0 then
    raise exception 'Ingresa valores válidos para efectivo, tarjetas y transferencias.';
  end if;
  if coalesce(p_deposito_pichincha, 0) < 0 or coalesce(p_deposito_guayaquil, 0) < 0 or coalesce(p_deposito_internacional, 0) < 0 then
    raise exception 'Los depósitos no pueden ser negativos.';
  end if;

  select c.monto into v_caja_anterior from app_private.caja_de_partida(p_empresa, p_sucursal, v_fecha) c;
  v_caja_anterior := coalesce(v_caja_anterior, 0);

  select coalesce(sum(total), 0) into v_ventas_brutas from public.ventas
  where empresa_id = p_empresa and sucursal_id = p_sucursal and estado = 'completada' and (creado_en at time zone 'America/Guayaquil')::date = v_fecha;

  select
    coalesce(sum(p.monto) filter (where p.metodo = 'efectivo'), 0),
    coalesce(sum(p.monto) filter (where p.metodo = 'tarjeta'), 0),
    coalesce(sum(p.monto) filter (where p.metodo = 'transferencia' and p.banco = 'pichincha'), 0),
    coalesce(sum(p.monto) filter (where p.metodo = 'transferencia' and p.banco = 'guayaquil'), 0),
    coalesce(sum(p.monto) filter (where p.metodo = 'transferencia' and p.banco = 'internacional'), 0),
    coalesce(sum(p.monto) filter (where p.metodo = 'credito'), 0),
    coalesce(sum(p.monto) filter (where p.metodo = 'otro' or (p.metodo = 'transferencia' and (p.banco is null or p.banco = 'otro'))), 0)
  into v_efectivo, v_tarjeta, v_pich, v_guay, v_intl, v_credito, v_otro
  from public.pagos_venta p join public.ventas v on v.id = p.venta_id
  where v.empresa_id = p_empresa and v.sucursal_id = p_sucursal and v.estado <> 'anulada' and (p.creado_en at time zone 'America/Guayaquil')::date = v_fecha;

  select coalesce(sum(monto), 0) into v_egresos_efectivo from public.gastos
  where empresa_id = p_empresa and sucursal_id = p_sucursal and origen = 'caja' and fecha = v_fecha;
  select coalesce(sum(monto), 0) into v_egresos_banco from public.gastos
  where empresa_id = p_empresa and sucursal_id = p_sucursal and origen = 'banco' and fecha = v_fecha;

  v_depositos := coalesce(p_deposito_pichincha, 0) + coalesce(p_deposito_guayaquil, 0) + coalesce(p_deposito_internacional, 0);
  v_caja_esperada := v_caja_anterior + v_efectivo - v_egresos_efectivo - v_depositos;
  v_diferencia := p_caja_fisica - v_caja_esperada;
  v_diferencia_declarados :=
    (p_declarado_efectivo + p_declarado_tarjeta + p_declarado_transferencia_pichincha + p_declarado_transferencia_guayaquil + p_declarado_transferencia_internacional)
    - (v_efectivo + v_tarjeta + v_pich + v_guay + v_intl);
  v_check_caja := abs(v_diferencia) < 0.01;
  v_check_metodos := abs(p_declarado_efectivo - v_efectivo) < 0.01
    and abs(p_declarado_tarjeta - v_tarjeta) < 0.01
    and abs(p_declarado_transferencia_pichincha - v_pich) < 0.01
    and abs(p_declarado_transferencia_guayaquil - v_guay) < 0.01
    and abs(p_declarado_transferencia_internacional - v_intl) < 0.01;
  v_check_cobros := abs((v_efectivo + v_tarjeta + v_pich + v_guay + v_intl + v_credito + v_otro) - v_ventas_brutas) < 0.01;
  v_correcto := v_check_caja and v_check_metodos;

  insert into public.cierres_caja (
    empresa_id, sucursal_id, fecha, responsable_id, caja_anterior, caja_fisica,
    ventas_brutas, cobro_efectivo, cobro_tarjeta, cobro_transferencia_pichincha, cobro_transferencia_guayaquil, cobro_transferencia_internacional, cobro_credito, cobro_otro,
    declarado_efectivo, declarado_tarjeta, declarado_transferencia_pichincha, declarado_transferencia_guayaquil, declarado_transferencia_internacional,
    diferencia_cobros_declarados, check_metodos_pago,
    egresos_efectivo, egresos_banco, deposito_pichincha, deposito_guayaquil, deposito_internacional, depositos, caja_esperada, diferencia,
    check_cobros_ventas, check_caja_fisica, cuadre_correcto, observaciones
  ) values (
    p_empresa, p_sucursal, v_fecha, v_user, v_caja_anterior, p_caja_fisica,
    v_ventas_brutas, v_efectivo, v_tarjeta, v_pich, v_guay, v_intl, v_credito, v_otro,
    p_declarado_efectivo, p_declarado_tarjeta, p_declarado_transferencia_pichincha, p_declarado_transferencia_guayaquil, p_declarado_transferencia_internacional,
    v_diferencia_declarados, v_check_metodos,
    v_egresos_efectivo, v_egresos_banco, coalesce(p_deposito_pichincha, 0), coalesce(p_deposito_guayaquil, 0), coalesce(p_deposito_internacional, 0), v_depositos, v_caja_esperada, v_diferencia,
    v_check_cobros, v_check_caja, v_correcto, nullif(trim(p_observaciones), '')
  ) returning id into v_id;

  return jsonb_build_object(
    'id', v_id, 'cuadre_correcto', v_correcto, 'diferencia', v_diferencia,
    'diferencia_cobros_declarados', v_diferencia_declarados,
    'caja_esperada', v_caja_esperada, 'caja_fisica', p_caja_fisica,
    'check_cobros_ventas', v_check_cobros, 'check_metodos_pago', v_check_metodos
  );
end;
$function$;

-- Versión antigua sin uso (8 parámetros), reemplazada por la de 13 (lección L3).
drop function if exists public.registrar_cierre_caja(uuid, uuid, date, numeric, numeric, numeric, numeric, text);

revoke all on function public.previsualizar_cierre_caja(uuid, uuid, date) from public, anon;
grant execute on function public.previsualizar_cierre_caja(uuid, uuid, date) to authenticated;
revoke all on function public.registrar_cierre_caja(uuid, uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.registrar_cierre_caja(uuid, uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) to authenticated;
