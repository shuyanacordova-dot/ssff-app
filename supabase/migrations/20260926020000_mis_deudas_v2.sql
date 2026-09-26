-- Mis deudas v2 (pedido por Shuyana 2026-09-25): tipos de deuda, cuotas fijas / abonos libres / gasto fijo mensual,
-- pagos por mes (periodo) y opción de registrar el pago también como egreso de caja.
-- Solo la Superadministradora ve y modifica este apartado (políticas existentes). "ambito" prepara que más adelante
-- Erick (Focus) y la administración de Sacha gestionen sus propios pagos.
alter table public.deudas_negocio alter column empresa_id drop not null; -- null = deuda general de las 3 sucursales
alter table public.deudas_negocio add column if not exists tipo text not null default 'proveedor'
  check (tipo in ('proveedor', 'prestamo_banco', 'tarjeta', 'prestamo_personal', 'gasto_fijo'));
alter table public.deudas_negocio add column if not exists modalidad text not null default 'libre'
  check (modalidad in ('cuotas', 'libre', 'mensual'));
alter table public.deudas_negocio add column if not exists cuotas_total integer check (cuotas_total is null or cuotas_total > 0);
alter table public.deudas_negocio add column if not exists cuotas_previas integer not null default 0 check (cuotas_previas >= 0);
alter table public.deudas_negocio add column if not exists monto_cuota numeric(12,2) check (monto_cuota is null or monto_cuota > 0);
alter table public.deudas_negocio add column if not exists dia_pago integer check (dia_pago is null or dia_pago between 1 and 31);
alter table public.deudas_negocio add column if not exists fecha_inicio date;
alter table public.deudas_negocio add column if not exists ambito text not null default 'general'
  check (ambito in ('general', 'focus', 'sacha'));

alter table public.pagos_deuda_negocio add column if not exists periodo date;
alter table public.pagos_deuda_negocio add column if not exists gasto_id uuid references public.gastos(id);

create or replace function public.registrar_pago_deuda_v2(
  p_deuda uuid, p_monto numeric, p_fecha date, p_metodo text,
  p_referencia text default null, p_notas text default null, p_periodo date default null, p_egreso_sucursal uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_usuario uuid; v_deuda record; v_pago uuid; v_gasto uuid; v_empresa uuid;
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Guayaquil')::date);
begin
  if not public.es_superadmin() then raise exception 'Acceso restringido a la administración general'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto debe ser mayor que cero'; end if;
  if p_metodo not in ('efectivo', 'transferencia', 'tarjeta', 'otro') then raise exception 'Método de pago inválido'; end if;
  select id into v_usuario from public.usuarios where auth_user_id = auth.uid() and activo = true limit 1;

  select * into v_deuda from public.deudas_negocio where id = p_deuda and estado = 'pendiente' for update;
  if v_deuda.id is null then raise exception 'La deuda no está disponible'; end if;
  if v_deuda.modalidad in ('cuotas', 'libre') and p_monto > v_deuda.saldo + 0.001 then
    raise exception 'El pago supera el saldo pendiente (%).', v_deuda.saldo;
  end if;

  if p_egreso_sucursal is not null then
    select empresa_id into v_empresa from public.sucursales where id = p_egreso_sucursal;
    if v_empresa is null then raise exception 'Sucursal no encontrada para el egreso.'; end if;
    insert into public.gastos (empresa_id, sucursal_id, fecha, clasificacion, concepto, monto, origen, observaciones, created_by)
    values (v_empresa, p_egreso_sucursal, v_fecha,
            case v_deuda.tipo when 'proveedor' then 'pago_proveedor' when 'gasto_fijo' then 'gastos_mensuales' else 'ajuste' end,
            v_deuda.proveedor, p_monto, 'caja', nullif(trim(concat_ws(' · ', v_deuda.concepto, p_notas)), ''), v_usuario)
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
$$;
revoke all on function public.registrar_pago_deuda_v2(uuid, numeric, date, text, text, text, date, uuid) from public, anon;
grant execute on function public.registrar_pago_deuda_v2(uuid, numeric, date, text, text, text, date, uuid) to authenticated;
