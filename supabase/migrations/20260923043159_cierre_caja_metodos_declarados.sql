alter table public.cierres_caja
  add column if not exists declarado_efectivo numeric not null default 0,
  add column if not exists declarado_tarjeta numeric not null default 0,
  add column if not exists declarado_transferencia_pichincha numeric not null default 0,
  add column if not exists declarado_transferencia_guayaquil numeric not null default 0,
  add column if not exists declarado_transferencia_internacional numeric not null default 0,
  add column if not exists diferencia_cobros_declarados numeric not null default 0,
  add column if not exists check_metodos_pago boolean not null default false;

create or replace function public.previsualizar_cierre_caja(p_empresa uuid, p_sucursal uuid, p_fecha date)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $function$
declare
  v_user uuid; v_role text; v_fecha date := coalesce(p_fecha, current_date);
  v_fecha_caja_anterior date; v_caja_anterior numeric := 0; v_ventas_brutas numeric := 0;
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

  select exists(
    select 1 from public.cierres_caja
    where empresa_id = p_empresa and sucursal_id = p_sucursal and fecha = v_fecha
  ) into v_ya_existe;

  select fecha, caja_fisica into v_fecha_caja_anterior, v_caja_anterior
  from public.cierres_caja
  where empresa_id = p_empresa and sucursal_id = p_sucursal and fecha < v_fecha
  order by fecha desc limit 1;
  v_caja_anterior := coalesce(v_caja_anterior, 0);

  select coalesce(sum(total), 0) into v_ventas_brutas from public.ventas
  where empresa_id = p_empresa and sucursal_id = p_sucursal and estado = 'completada' and creado_en::date = v_fecha;

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
  where v.empresa_id = p_empresa and v.sucursal_id = p_sucursal and v.estado <> 'anulada' and p.creado_en::date = v_fecha;

  select coalesce(sum(monto), 0) into v_egresos_efectivo from public.gastos
  where empresa_id = p_empresa and sucursal_id = p_sucursal and origen = 'caja' and fecha = v_fecha;
  select coalesce(sum(monto), 0) into v_egresos_banco from public.gastos
  where empresa_id = p_empresa and sucursal_id = p_sucursal and origen = 'banco' and fecha = v_fecha;

  return jsonb_build_object(
    'ya_existe', v_ya_existe, 'fecha_caja_anterior', v_fecha_caja_anterior, 'caja_anterior', v_caja_anterior,
    'ventas_brutas', v_ventas_brutas, 'cobro_efectivo', v_efectivo, 'cobro_tarjeta', v_tarjeta,
    'cobro_transferencia_pichincha', v_pich, 'cobro_transferencia_guayaquil', v_guay,
    'cobro_transferencia_internacional', v_intl, 'cobro_credito', v_credito, 'cobro_otro', v_otro,
    'egresos_efectivo', v_egresos_efectivo, 'egresos_banco', v_egresos_banco
  );
end;
$function$;

create or replace function public.registrar_cierre_caja(
  p_empresa uuid,
  p_sucursal uuid,
  p_fecha date,
  p_declarado_efectivo numeric,
  p_declarado_tarjeta numeric,
  p_declarado_transferencia_pichincha numeric,
  p_declarado_transferencia_guayaquil numeric,
  p_declarado_transferencia_internacional numeric,
  p_caja_fisica numeric,
  p_deposito_pichincha numeric default 0,
  p_deposito_guayaquil numeric default 0,
  p_deposito_internacional numeric default 0,
  p_observaciones text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $function$
declare
  v_user uuid; v_role text; v_fecha date := coalesce(p_fecha, current_date);
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

  select caja_fisica into v_caja_anterior from public.cierres_caja
  where empresa_id = p_empresa and sucursal_id = p_sucursal and fecha < v_fecha
  order by fecha desc limit 1;
  v_caja_anterior := coalesce(v_caja_anterior, 0);

  select coalesce(sum(total), 0) into v_ventas_brutas from public.ventas
  where empresa_id = p_empresa and sucursal_id = p_sucursal and estado = 'completada' and creado_en::date = v_fecha;

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
  where v.empresa_id = p_empresa and v.sucursal_id = p_sucursal and v.estado <> 'anulada' and p.creado_en::date = v_fecha;

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

revoke all on function public.previsualizar_cierre_caja(uuid, uuid, date) from public, anon;
grant execute on function public.previsualizar_cierre_caja(uuid, uuid, date) to authenticated;

revoke all on function public.registrar_cierre_caja(uuid, uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.registrar_cierre_caja(uuid, uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) to authenticated;
