-- Provisión: saldo real al 12-oct-2026 y abono automático desde Egresos.
-- Cada egreso cuyo concepto diga "Provisión" (con o sin tilde, cualquier caja, banco o atajo)
-- se descuenta solo de la deuda de Provisión en Mis deudas. Editar o borrar el egreso corrige el abono.
-- Los pagos hechos desde Mis deudas no se tocan (ya traen su propio egreso enlazado).
-- OPTEC no lleva deuda: sus facturas no se suman.

alter table public.pagos_deuda_negocio add column if not exists automatico boolean not null default false;

-- 1) Saldo real indicado por Shuyana (ya incluye las facturas que estaban en correo no deseado).
update public.deudas_negocio
   set monto_original = 458.45, saldo = 458.45, estado = 'pendiente',
       concepto = 'Deuda al 12 de octubre', fecha_deuda = date '2026-10-12',
       notas = 'Saldo confirmado por Shuyana el 12-oct-2026 (incluye facturas recibidas hasta esa fecha). Los egresos con concepto "Provisión" se descuentan solo.',
       actualizado_en = now()
 where tipo = 'proveedor' and proveedor = 'Provisión' and estado <> 'anulada';

-- 2) Sincroniza el abono automático de un egreso.
create or replace function app_private.sincronizar_pago_provision(p_gasto uuid, p_quitar boolean default false)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_pago record; v_gasto public.gastos; v_deuda uuid;
begin
  -- Revertir el abono automático anterior de este egreso, si lo hay.
  for v_pago in select * from public.pagos_deuda_negocio where gasto_id = p_gasto and automatico loop
    update public.deudas_negocio
       set saldo = saldo + v_pago.monto, estado = 'pendiente', actualizado_en = now()
     where id = v_pago.deuda_id;
    delete from public.pagos_deuda_negocio where id = v_pago.id;
  end loop;
  if p_quitar then return; end if;

  select * into v_gasto from public.gastos where id = p_gasto;
  if v_gasto.id is null then return; end if;
  -- Si el egreso nació de un pago en Mis deudas, ese pago ya descontó la deuda.
  if exists (select 1 from public.pagos_deuda_negocio where gasto_id = p_gasto) then return; end if;
  if translate(lower(coalesce(v_gasto.concepto, '')), 'óò', 'oo') not like '%provision%' then return; end if;

  select id into v_deuda from public.deudas_negocio
   where tipo = 'proveedor' and proveedor = 'Provisión' and estado in ('pendiente', 'pagada')
   order by creado_en limit 1;
  if v_deuda is null then return; end if;

  insert into public.pagos_deuda_negocio (deuda_id, monto, fecha_pago, metodo, notas, created_by, periodo, gasto_id, automatico)
  values (v_deuda, v_gasto.monto, v_gasto.fecha,
          case when v_gasto.origen = 'banco' then 'transferencia' else 'efectivo' end,
          'Automático desde Egresos', v_gasto.created_by, date_trunc('month', v_gasto.fecha)::date, v_gasto.id, true);

  update public.deudas_negocio
     set saldo = greatest(saldo - v_gasto.monto, 0),
         estado = case when saldo - v_gasto.monto <= 0.001 then 'pagada' else 'pendiente' end,
         actualizado_en = now()
   where id = v_deuda;
end;
$$;

-- 3) Disparador diferido: corre al final de la transacción, cuando un pago de Mis deudas ya enlazó su egreso.
create or replace function app_private.tg_gasto_pago_provision()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform app_private.sincronizar_pago_provision(new.id);
  return null;
end;
$$;

drop trigger if exists gastos_pago_provision on public.gastos;
create constraint trigger gastos_pago_provision
  after insert or update of concepto, monto, fecha, origen on public.gastos
  deferrable initially deferred
  for each row execute function app_private.tg_gasto_pago_provision();

-- 4) Borrar un egreso devuelve su abono automático a la deuda.
create or replace function public.eliminar_gasto(p_gasto uuid, p_motivo text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'app_private'
as $function$
declare v_user uuid; v_antes public.gastos;
begin
  if not public.es_superadmin() then raise exception 'Solo la Superadministradora puede borrar egresos.'; end if;
  if char_length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'Escribe por qué se borra el egreso.'; end if;
  select * into v_antes from public.gastos where id = p_gasto for update;
  if v_antes.id is null then raise exception 'El egreso ya no existe.'; end if;
  select id into v_user from public.usuarios where auth_user_id = (select auth.uid()) and activo limit 1;

  perform app_private.revertir_movimiento_de_gasto(p_gasto);
  perform app_private.sincronizar_pago_provision(p_gasto, true);
  update public.pagos_deuda_negocio set gasto_id = null where gasto_id = p_gasto;
  insert into public.gastos_auditoria (gasto_id, accion, antes, motivo, usuario_id)
  values (p_gasto, 'eliminado', to_jsonb(v_antes), trim(p_motivo), v_user);
  delete from public.gastos where id = p_gasto;
end;
$function$;
