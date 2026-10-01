-- Mis deudas (Shuyana 2026-09-30):
-- 1) Nuevo tipo "salario" (Shuvisión se organiza en gastos fijos, salarios, préstamos, tarjetas y proveedores).
-- 2) Sueldo de Tiffany $1.000 mensual (día de pago y sucursal se pueden editar en pantalla).
-- 3) Todo pago de deuda hecho con dinero de las ópticas queda como egreso CON sucursal: si sale de una cuenta bancaria,
--    la sucursal de esa cuenta (antes quedaba sin sucursal si no se elegía y no restaba del "a cuenta" del mes).
--    Se corrigen los 2 pagos del 30-09 que quedaron sin sucursal (Internet Focus $20 y Mastercard $150, ambos desde
--    Pichincha de Shuvision).

alter table public.deudas_negocio drop constraint if exists deudas_negocio_tipo_check;
alter table public.deudas_negocio add constraint deudas_negocio_tipo_check
  check (tipo in ('proveedor', 'prestamo_banco', 'tarjeta', 'prestamo_personal', 'gasto_fijo', 'salario'));

insert into public.deudas_negocio (tipo, modalidad, proveedor, concepto, empresa_id, ambito, monto_original, saldo, monto_cuota, dia_pago,
  fecha_inicio, estado, frecuencia, notas, created_by)
select 'salario', 'mensual', 'Tiffany', 'Sueldo', '51820b6b-9fc1-495c-b2ea-ab50547e2ce3'::uuid, 'general', 1000, 1000, 1000, 30,
  '2026-09-30', 'pendiente', 'mensual', 'Día de pago y sucursal por confirmar.', '535f7c2d-fc42-4a4c-a7f6-fb8b8a5598b6'::uuid
where not exists (select 1 from public.deudas_negocio where proveedor = 'Tiffany' and tipo = 'salario' and estado <> 'anulada');

update public.gastos g set sucursal_id = c.sucursal_id
from public.pagos_deuda_negocio p, public.cuentas_bancarias c
where p.gasto_id = g.id and c.id = g.cuenta_bancaria_id and g.sucursal_id is null and c.sucursal_id is not null;

create or replace function public.registrar_pago_deuda_v3(p_deuda uuid, p_monto numeric, p_fecha date, p_metodo text,
  p_referencia text default null, p_notas text default null, p_periodo date default null, p_egreso_sucursal uuid default null, p_cuenta uuid default null)
returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_usuario uuid; v_deuda record; v_pago uuid; v_gasto uuid; v_empresa uuid; v_cuenta record; v_sucursal uuid;
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Guayaquil')::date);
  v_clasif text;
begin
  if not public.es_superadmin() then raise exception 'Acceso restringido a la administración general'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto debe ser mayor que cero'; end if;
  if p_metodo not in ('efectivo', 'transferencia', 'tarjeta', 'otro') then raise exception 'Método de pago inválido'; end if;
  if p_cuenta is not null and p_metodo = 'efectivo' then raise exception 'Un pago en efectivo no sale de una cuenta bancaria.'; end if;
  select id into v_usuario from public.usuarios where auth_user_id = auth.uid() and activo = true limit 1;

  select * into v_deuda from public.deudas_negocio where id = p_deuda and estado = 'pendiente' for update;
  if v_deuda.id is null then raise exception 'La deuda no está disponible'; end if;
  if v_deuda.modalidad in ('cuotas', 'libre') and p_monto > v_deuda.saldo + 0.001 then
    raise exception 'El pago supera el saldo pendiente (%).', v_deuda.saldo;
  end if;
  v_clasif := case v_deuda.tipo when 'proveedor' then 'pago_proveedor' when 'gasto_fijo' then 'gastos_mensuales' when 'salario' then 'salarios' else 'ajuste' end;

  if p_cuenta is not null then
    select * into v_cuenta from public.cuentas_bancarias where id = p_cuenta and activo;
    if v_cuenta.id is null then raise exception 'Cuenta bancaria no encontrada.'; end if;
    -- La sucursal elegida (si es de la misma empresa de la cuenta) o la sucursal dueña de la cuenta.
    v_sucursal := coalesce((select id from public.sucursales where id = p_egreso_sucursal and empresa_id = v_cuenta.empresa_id), v_cuenta.sucursal_id);
    insert into public.gastos (empresa_id, sucursal_id, fecha, clasificacion, concepto, monto, origen, cuenta_bancaria_id, observaciones, created_by)
    values (v_cuenta.empresa_id, v_sucursal, v_fecha, v_clasif, v_deuda.proveedor, p_monto, 'banco', p_cuenta,
            nullif(trim(concat_ws(' · ', v_deuda.concepto, p_notas)), ''), v_usuario)
    returning id into v_gasto;
  elsif p_egreso_sucursal is not null then
    select empresa_id into v_empresa from public.sucursales where id = p_egreso_sucursal;
    if v_empresa is null then raise exception 'Sucursal no encontrada para el egreso.'; end if;
    insert into public.gastos (empresa_id, sucursal_id, fecha, clasificacion, concepto, monto, origen, observaciones, created_by)
    values (v_empresa, p_egreso_sucursal, v_fecha, v_clasif, v_deuda.proveedor, p_monto, 'caja',
            nullif(trim(concat_ws(' · ', v_deuda.concepto, p_notas)), ''), v_usuario)
    returning id into v_gasto;
  end if;

  insert into public.pagos_deuda_negocio (deuda_id, monto, fecha_pago, metodo, referencia, notas, created_by, periodo, gasto_id)
  values (p_deuda, p_monto, v_fecha, p_metodo, nullif(trim(p_referencia), ''), nullif(trim(p_notas), ''), v_usuario,
          date_trunc('month', coalesce(p_periodo, v_fecha))::date, v_gasto)
  returning id into v_pago;

  if v_deuda.modalidad in ('cuotas', 'libre') then
    update public.deudas_negocio
       set saldo = greatest(saldo - p_monto, 0),
           estado = case when saldo - p_monto <= 0.001 then 'pagada' else 'pendiente' end,
           actualizado_en = now()
     where id = p_deuda;
  else
    update public.deudas_negocio set actualizado_en = now() where id = p_deuda;
  end if;
  return v_pago;
end;
$function$;
