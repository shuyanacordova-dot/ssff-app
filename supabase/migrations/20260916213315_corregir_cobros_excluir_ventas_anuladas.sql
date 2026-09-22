
-- Los cobros de una venta anulada no deben contar en el cuadre de caja
-- (ventas_brutas ya excluye las anuladas; los cobros deben ser
-- consistentes con eso, igual que motiva la separación venta≠cobro≠caja).
create or replace function public.registrar_cierre_caja(
  p_empresa uuid, p_sucursal uuid, p_fecha date, p_caja_fisica numeric,
  p_acumulado_optox_anterior numeric, p_acumulado_optox_actual numeric, p_observaciones text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $function$
declare
  v_user uuid; v_role text; v_fecha date := coalesce(p_fecha, current_date);
  v_caja_anterior numeric := 0;
  v_ventas_brutas numeric := 0;
  v_efectivo numeric := 0; v_tarjeta numeric := 0; v_pich numeric := 0; v_guay numeric := 0; v_intl numeric := 0; v_credito numeric := 0; v_otro numeric := 0;
  v_egresos_efectivo numeric := 0; v_egresos_banco numeric := 0; v_depositos numeric := 0;
  v_caja_esperada numeric; v_diferencia numeric;
  v_check_cobros boolean; v_check_acumulado boolean; v_check_caja boolean; v_correcto boolean;
  v_id uuid;
begin
  select u.id, r.nombre into v_user, v_role
  from public.usuarios u join public.roles r on r.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and (r.nombre = 'superadmin' or u.empresa_id = p_empresa);
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('cuadre_caja', 'crear')) then
    raise exception 'No autorizado';
  end if;
  if p_caja_fisica is null then raise exception 'Ingresa el efectivo contado en caja.'; end if;

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
  select coalesce(sum(monto), 0) into v_depositos from public.movimientos_bancarios
    where empresa_id = p_empresa and sucursal_id = p_sucursal and tipo = 'deposito_caja' and fecha = v_fecha;

  v_caja_esperada := v_caja_anterior + v_efectivo - v_egresos_efectivo - v_depositos;
  v_diferencia := p_caja_fisica - v_caja_esperada;
  v_check_caja := abs(v_diferencia) < 0.01;
  v_check_cobros := abs((v_efectivo + v_tarjeta + v_pich + v_guay + v_intl + v_credito + v_otro) - v_ventas_brutas) < 0.01;
  if p_acumulado_optox_anterior is not null and p_acumulado_optox_actual is not null then
    v_check_acumulado := abs((p_acumulado_optox_actual - p_acumulado_optox_anterior) - (v_ventas_brutas - (v_egresos_efectivo + v_egresos_banco))) < 0.01;
  else
    v_check_acumulado := null;
  end if;
  v_correcto := v_check_caja and v_check_cobros and coalesce(v_check_acumulado, true);

  insert into public.cierres_caja (
    empresa_id, sucursal_id, fecha, responsable_id, caja_anterior, caja_fisica, acumulado_optox_anterior, acumulado_optox_actual,
    ventas_brutas, cobro_efectivo, cobro_tarjeta, cobro_transferencia_pichincha, cobro_transferencia_guayaquil, cobro_transferencia_internacional, cobro_credito, cobro_otro,
    egresos_efectivo, egresos_banco, depositos, caja_esperada, diferencia, check_cobros_ventas, check_acumulado, check_caja_fisica, cuadre_correcto, observaciones
  ) values (
    p_empresa, p_sucursal, v_fecha, v_user, v_caja_anterior, p_caja_fisica, p_acumulado_optox_anterior, p_acumulado_optox_actual,
    v_ventas_brutas, v_efectivo, v_tarjeta, v_pich, v_guay, v_intl, v_credito, v_otro,
    v_egresos_efectivo, v_egresos_banco, v_depositos, v_caja_esperada, v_diferencia, v_check_cobros, v_check_acumulado, v_check_caja, v_correcto, nullif(trim(p_observaciones), '')
  ) returning id into v_id;
  return v_id;
end;
$function$;
;
