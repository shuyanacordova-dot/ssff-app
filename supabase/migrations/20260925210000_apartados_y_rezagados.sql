-- Cuentas por cobrar: Sistema de apartado y Lentes rezagados (pedido por Shuyana 2026-09-25).
-- Apartado: el paciente deja un abono, el producto queda separado (ya salió del stock con la venta) y se entrega
-- solo al pagar todo. Plazo: 90 días desde la venta. Liberar un apartado = anular la venta (devuelve el stock).
alter table public.ventas add column if not exists apartado boolean not null default false;
alter table public.ventas add column if not exists apartado_hasta date;

create or replace function public.marcar_apartado_venta(p_venta uuid, p_activo boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_user uuid; v_role text; v_empresa uuid; v_estado text; v_saldo numeric; v_fecha date;
begin
  select empresa_id, estado, saldo, (creado_en at time zone 'America/Guayaquil')::date
    into v_empresa, v_estado, v_saldo, v_fecha from public.ventas where id = p_venta;
  if v_empresa is null then raise exception 'Venta no encontrada.'; end if;
  select u.id, ro.nombre into v_user, v_role
  from public.usuarios u join public.roles ro on ro.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and (ro.nombre = 'superadmin' or u.empresa_id = v_empresa);
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('ventas', 'crear')) then
    raise exception 'No autorizado';
  end if;
  if v_estado <> 'completada' then raise exception 'Solo ventas completadas pueden ser apartados.'; end if;
  if p_activo and v_saldo <= 0 then raise exception 'La venta ya está pagada; no puede quedar como apartado.'; end if;
  update public.ventas
     set apartado = p_activo,
         apartado_hasta = case when p_activo then v_fecha + 90 else null end,
         actualizado_en = now()
   where id = p_venta;
end;
$$;
revoke all on function public.marcar_apartado_venta(uuid, boolean) from public, anon;
grant execute on function public.marcar_apartado_venta(uuid, boolean) to authenticated;

-- Lentes rezagados: se guarda desde cuándo la orden está lista para entregar (listo_entrega o notificado).
alter table public.ordenes_laboratorio add column if not exists listo_en timestamptz;

create or replace function app_private.marcar_listo_orden_laboratorio()
returns trigger
language plpgsql
set search_path to 'public', 'app_private'
as $$
begin
  if new.estado in ('listo_entrega', 'notificado') then
    if tg_op = 'INSERT' or old.estado not in ('listo_entrega', 'notificado') or old.listo_en is null then
      new.listo_en := coalesce(new.listo_en, now());
    end if;
  else
    new.listo_en := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_marcar_listo_orden_laboratorio on public.ordenes_laboratorio;
create trigger trg_marcar_listo_orden_laboratorio
before insert or update of estado on public.ordenes_laboratorio
for each row execute function app_private.marcar_listo_orden_laboratorio();

update public.ordenes_laboratorio set listo_en = coalesce(actualizado_en, creado_en)
where estado in ('listo_entrega', 'notificado') and listo_en is null;
