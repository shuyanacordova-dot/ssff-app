-- Canje en cuentas por cobrar (pedido por Shuyana 2026-09-25): excepción que baja el saldo de una venta
-- SIN contar como abono, cobro, ingreso de caja ni venta. Solo la Superadministradora puede registrarlo.
-- Queda registrado en canjes_venta (quién, cuánto, por qué, cuándo).
create table if not exists public.canjes_venta (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references public.ventas(id),
  empresa_id uuid not null references public.empresas(id),
  monto numeric(12,2) not null check (monto > 0),
  motivo text not null check (char_length(trim(motivo)) >= 3),
  creado_por uuid references public.usuarios(id),
  creado_en timestamptz not null default now()
);
create index if not exists canjes_venta_venta_idx on public.canjes_venta (venta_id);
alter table public.canjes_venta enable row level security;
revoke all on public.canjes_venta from public, anon, authenticated;
grant select on public.canjes_venta to authenticated;
drop policy if exists canjes_venta_superadmin on public.canjes_venta;
create policy canjes_venta_superadmin on public.canjes_venta for select to authenticated using (public.es_superadmin());

-- La regla de ventas completadas solo permitía bajar el saldo con un abono. Se agrega una única excepción:
-- el canje registrado por la función de abajo, a nombre de la Superadministradora (pagado no cambia).
create or replace function app_private.validar_transicion_venta()
returns trigger
language plpgsql
set search_path to 'public', 'app_private'
as $function$
declare
  v_role text;
  v_actor uuid;
  v_abono numeric;
begin
  if old.estado = 'anulada' then
    raise exception 'Una venta anulada no puede modificarse.';
  end if;

  select ro.nombre, u.id into v_role, v_actor
  from public.usuarios u
  join public.roles ro on ro.id = u.rol_id
  where u.auth_user_id = (select auth.uid())
    and u.activo
    and (ro.nombre = 'superadmin' or u.empresa_id = old.empresa_id);

  if new.estado = 'anulada' and old.estado <> 'anulada' then
    if v_role is distinct from 'superadmin' then
      raise exception 'Solo la Superadministradora puede anular una venta.';
    end if;
    if new.motivo_anulacion is null or char_length(trim(new.motivo_anulacion)) < 5 then
      raise exception 'Indica el motivo de la anulación (mínimo 5 caracteres).';
    end if;
    new.anulada_en := now();
    new.anulada_por := v_actor;
    return new;
  end if;

  if old.estado = 'completada' and coalesce(current_setting('app.canje_venta', true), '') = 'on'
     and v_role = 'superadmin'
     and new.pagado = old.pagado and new.subtotal = old.subtotal and new.descuento = old.descuento and new.total = old.total
     and new.saldo < old.saldo and new.saldo >= 0 then
    return new;
  end if;

  if old.estado = 'completada' and (
    new.pagado <> old.pagado or new.saldo <> old.saldo or
    new.subtotal <> old.subtotal or new.descuento <> old.descuento or new.total <> old.total
  ) then
    if new.subtotal <> old.subtotal or new.descuento <> old.descuento or new.total <> old.total then
      raise exception 'El total de una venta completada no puede modificarse directamente.';
    end if;
    v_abono := new.pagado - old.pagado;
    if v_abono <= 0 or round(new.saldo - (old.saldo - v_abono), 2) <> 0 then
      raise exception 'Los pagos deben registrarse como abonos válidos.';
    end if;
    if v_role is null or not (v_role = 'superadmin' or public.tiene_permiso('ventas', 'crear')) then
      raise exception 'No autorizado para registrar abonos.';
    end if;
  end if;

  return new;
end;
$function$;

create or replace function public.registrar_canje_venta(p_venta uuid, p_monto numeric, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $$
declare v_user uuid; v_empresa uuid; v_estado text; v_saldo numeric; v_id uuid;
begin
  if not public.es_superadmin() then
    raise exception 'Solo la Superadministradora puede registrar canjes.';
  end if;
  select id into v_user from public.usuarios where auth_user_id = (select auth.uid()) and activo limit 1;
  select empresa_id, estado, saldo into v_empresa, v_estado, v_saldo from public.ventas where id = p_venta for update;
  if v_empresa is null then raise exception 'Venta no encontrada.'; end if;
  if v_estado <> 'completada' then raise exception 'Solo se pueden canjear saldos de ventas completadas.'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto del canje debe ser mayor a cero.'; end if;
  if p_monto > v_saldo then raise exception 'El canje no puede superar el saldo pendiente.'; end if;
  if p_motivo is null or char_length(trim(p_motivo)) < 3 then raise exception 'Escribe el motivo del canje.'; end if;

  insert into public.canjes_venta (venta_id, empresa_id, monto, motivo, creado_por)
  values (p_venta, v_empresa, p_monto, trim(p_motivo), v_user) returning id into v_id;

  perform set_config('app.canje_venta', 'on', true);
  update public.ventas set saldo = saldo - p_monto, actualizado_en = now() where id = p_venta;
  perform set_config('app.canje_venta', 'off', true);
  return v_id;
end;
$$;

revoke all on function public.registrar_canje_venta(uuid, numeric, text) from public, anon;
grant execute on function public.registrar_canje_venta(uuid, numeric, text) to authenticated;
