
-- Igual que registrar_cierre_caja pero de solo lectura: permite mostrar
-- en vivo lo que el sistema ya calculó (ventas, cobros por método,
-- egresos, depósitos, caja esperada) antes de guardar el cuadre. Así
-- el cuadre deja de depender de escribir el acumulado OPTOX: solo hace
-- falta contar la caja física y compararla con lo que el sistema
-- ya sabe.
create or replace function public.previsualizar_cierre_caja(p_empresa uuid, p_sucursal uuid, p_fecha date)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $function$
declare
  v_user uuid; v_role text; v_fecha date := coalesce(p_fecha, current_date);
  v_caja_anterior numeric := 0; v_ventas_brutas numeric := 0;
  v_efectivo numeric := 0; v_tarjeta numeric := 0; v_pich numeric := 0; v_guay numeric := 0; v_intl numeric := 0; v_credito numeric := 0; v_otro numeric := 0;
  v_egresos_efectivo numeric := 0; v_egresos_banco numeric := 0; v_depositos numeric := 0; v_caja_esperada numeric;
  v_ya_existe boolean;
begin
  select u.id, r.nombre into v_user, v_role
  from public.usuarios u join public.roles r on r.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and (r.nombre = 'superadmin' or u.empresa_id = p_empresa);
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('cuadre_caja', 'leer')) then
    raise exception 'No autorizado';
  end if;

  select exists(select 1 from public.cierres_caja where empresa_id = p_empresa and sucursal_id = p_sucursal and fecha = v_fecha) into v_ya_existe;

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

  return jsonb_build_object(
    'ya_existe', v_ya_existe, 'caja_anterior', v_caja_anterior, 'ventas_brutas', v_ventas_brutas,
    'cobro_efectivo', v_efectivo, 'cobro_tarjeta', v_tarjeta, 'cobro_transferencia_pichincha', v_pich,
    'cobro_transferencia_guayaquil', v_guay, 'cobro_transferencia_internacional', v_intl,
    'cobro_credito', v_credito, 'cobro_otro', v_otro,
    'egresos_efectivo', v_egresos_efectivo, 'egresos_banco', v_egresos_banco, 'depositos', v_depositos,
    'caja_esperada', v_caja_esperada
  );
end;
$function$;

revoke all on function public.previsualizar_cierre_caja(uuid, uuid, date) from public, anon;
grant execute on function public.previsualizar_cierre_caja(uuid, uuid, date) to authenticated;
;
