-- Editar o borrar egresos registrados por error (pedido de Shuyana 2026-09-28; solo Superadministradora).
-- Cada cambio deja una copia de antes/después en gastos_auditoria. Si el egreso era por banco, se revierte su
-- movimiento y el saldo de la cuenta; si venía de un pago de Mis deudas, el pago queda registrado pero sin egreso.

create table if not exists public.gastos_auditoria (
  id uuid primary key default gen_random_uuid(),
  gasto_id uuid not null,
  accion text not null check (accion in ('editado', 'eliminado')),
  antes jsonb not null,
  despues jsonb,
  motivo text,
  usuario_id uuid references public.usuarios(id),
  creado_en timestamptz not null default now()
);
alter table public.gastos_auditoria enable row level security;
revoke all on public.gastos_auditoria from public, anon, authenticated;
grant select on public.gastos_auditoria to authenticated;
create policy gastos_auditoria_superadmin on public.gastos_auditoria for select to authenticated using (public.es_superadmin());

-- Quita el movimiento bancario de un egreso y devuelve el dinero al saldo de la cuenta.
create or replace function app_private.revertir_movimiento_de_gasto(p_gasto uuid)
returns void language plpgsql security definer set search_path to 'public', 'app_private'
as $$
declare m record;
begin
  for m in select * from public.movimientos_bancarios where gasto_id = p_gasto loop
    update public.cuentas_bancarias
       set saldo_actual = saldo_actual + case when m.tipo = 'egreso' then m.monto else -m.monto end, actualizado_en = now()
     where id = m.cuenta_id;
    delete from public.movimientos_bancarios where id = m.id;
  end loop;
end;
$$;
revoke all on function app_private.revertir_movimiento_de_gasto(uuid) from public, anon, authenticated;

create or replace function public.editar_gasto(p_gasto uuid, p_fecha date, p_clasificacion text, p_concepto text, p_monto numeric,
  p_origen text, p_cuenta uuid, p_observaciones text, p_motivo text default null)
returns void language plpgsql security definer set search_path to 'public', 'app_private'
as $$
declare v_user uuid; v_antes public.gastos; v_despues public.gastos; v_cuenta record;
begin
  if not public.es_superadmin() then raise exception 'Solo la Superadministradora puede editar egresos.'; end if;
  select * into v_antes from public.gastos where id = p_gasto for update;
  if v_antes.id is null then raise exception 'El egreso ya no existe.'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto debe ser mayor a cero.'; end if;
  if char_length(trim(coalesce(p_concepto, ''))) = 0 then raise exception 'Escribe el concepto.'; end if;
  if p_origen not in ('caja', 'banco') then raise exception 'Elige si salió de la caja o del banco.'; end if;
  if p_origen = 'banco' then
    select * into v_cuenta from public.cuentas_bancarias where id = p_cuenta and activo;
    if v_cuenta.id is null then raise exception 'Elige la cuenta bancaria del egreso.'; end if;
  end if;
  select id into v_user from public.usuarios where auth_user_id = (select auth.uid()) and activo limit 1;

  perform app_private.revertir_movimiento_de_gasto(p_gasto);
  update public.gastos set fecha = coalesce(p_fecha, fecha), clasificacion = p_clasificacion, concepto = trim(p_concepto), monto = p_monto,
         origen = p_origen, cuenta_bancaria_id = case when p_origen = 'banco' then p_cuenta end, observaciones = nullif(trim(p_observaciones), '')
   where id = p_gasto returning * into v_despues;
  if p_origen = 'banco' then
    insert into public.movimientos_bancarios (cuenta_id, empresa_id, sucursal_id, fecha, tipo, monto, gasto_id, observaciones, created_by)
    values (p_cuenta, v_despues.empresa_id, v_despues.sucursal_id, v_despues.fecha, 'egreso', v_despues.monto, v_despues.id, v_despues.observaciones, v_user);
  end if;
  insert into public.gastos_auditoria (gasto_id, accion, antes, despues, motivo, usuario_id)
  values (p_gasto, 'editado', to_jsonb(v_antes), to_jsonb(v_despues), nullif(trim(p_motivo), ''), v_user);
end;
$$;

create or replace function public.eliminar_gasto(p_gasto uuid, p_motivo text)
returns void language plpgsql security definer set search_path to 'public', 'app_private'
as $$
declare v_user uuid; v_antes public.gastos;
begin
  if not public.es_superadmin() then raise exception 'Solo la Superadministradora puede borrar egresos.'; end if;
  if char_length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'Escribe por qué se borra el egreso.'; end if;
  select * into v_antes from public.gastos where id = p_gasto for update;
  if v_antes.id is null then raise exception 'El egreso ya no existe.'; end if;
  select id into v_user from public.usuarios where auth_user_id = (select auth.uid()) and activo limit 1;

  perform app_private.revertir_movimiento_de_gasto(p_gasto);
  update public.pagos_deuda_negocio set gasto_id = null where gasto_id = p_gasto;
  insert into public.gastos_auditoria (gasto_id, accion, antes, motivo, usuario_id)
  values (p_gasto, 'eliminado', to_jsonb(v_antes), trim(p_motivo), v_user);
  delete from public.gastos where id = p_gasto;
end;
$$;

revoke all on function public.editar_gasto(uuid, date, text, text, numeric, text, uuid, text, text), public.eliminar_gasto(uuid, text) from public, anon;
grant execute on function public.editar_gasto(uuid, date, text, text, numeric, text, uuid, text, text), public.eliminar_gasto(uuid, text) to authenticated;
