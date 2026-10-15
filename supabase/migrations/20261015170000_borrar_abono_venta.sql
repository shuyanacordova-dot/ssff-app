-- Borrar abonos desde Resumen del día (2026-10-15, pedido de Shuyana): solo la Superadministradora, con motivo y huella.
-- Nada se pierde sin rastro: el abono borrado queda copiado en pagos_venta_eliminados y en el historial de la venta.

create table if not exists public.pagos_venta_eliminados (
  id uuid primary key default gen_random_uuid(),
  pago_id uuid not null,
  venta_id uuid not null references public.ventas(id),
  empresa_id uuid references public.empresas(id),
  pago jsonb not null,
  extras jsonb not null default '{}'::jsonb,
  motivo text not null,
  eliminado_por uuid references public.usuarios(id),
  eliminado_en timestamptz not null default now()
);
alter table public.pagos_venta_eliminados enable row level security;
revoke all on public.pagos_venta_eliminados from public, anon, authenticated;
grant select on public.pagos_venta_eliminados to authenticated;
create policy pagos_venta_eliminados_superadmin on public.pagos_venta_eliminados for select to authenticated using (public.es_superadmin());

-- El control de cambios de una venta completada solo dejaba subir lo pagado. Se agrega una excepción estrecha:
-- la Superadministradora, dentro de eliminar_abono_venta (marca de sesión), puede bajar lo pagado sin tocar totales.
create or replace function app_private.validar_transicion_venta()
returns trigger language plpgsql set search_path to 'public', 'app_private'
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
    if v_role is distinct from 'superadmin' and not exists (
        select 1 from public.usuarios ua where ua.auth_user_id = (select auth.uid()) and ua.activo
          and ua.puede_anular_ventas and ua.empresa_id = old.empresa_id) then
      raise exception 'No tienes permiso para anular esta venta.';
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

  if old.estado = 'completada' and coalesce(current_setting('app.borrar_abono', true), '') = 'on'
     and v_role = 'superadmin'
     and new.estado = 'completada'
     and new.subtotal = old.subtotal and new.descuento = old.descuento and new.total = old.total
     and new.pagado < old.pagado and new.pagado >= 0
     and round(new.saldo - (old.saldo + (old.pagado - new.pagado)), 2) = 0 then
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

create or replace function public.eliminar_abono_venta(p_pago uuid, p_motivo text)
returns void language plpgsql security definer set search_path to 'public', 'app_private'
as $$
declare
  v_user uuid; v_pago public.pagos_venta; v_venta public.ventas;
  v_extras jsonb := '{}'::jsonb; v_creditos jsonb; v_correcciones jsonb;
begin
  if not public.es_superadmin() then raise exception 'Solo la Superadministradora puede borrar abonos.'; end if;
  if char_length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'Escribe por qué se borra el abono.'; end if;
  select * into v_pago from public.pagos_venta where id = p_pago for update;
  if v_pago.id is null then raise exception 'El abono ya no existe.'; end if;
  if v_pago.monto <= 0 then raise exception 'Solo se pueden borrar abonos de monto positivo.'; end if;
  select * into v_venta from public.ventas where id = v_pago.venta_id for update;
  if v_venta.estado <> 'completada' then raise exception 'La venta está anulada: no se pueden cambiar sus abonos.'; end if;
  if v_pago.acreditacion_id is not null then
    raise exception 'Esta tarjeta ya fue acreditada en el banco; primero hay que corregir la acreditación.';
  end if;
  if exists (select 1 from public.referidos r where r.venta_id = v_venta.id and r.estado = 'recompensado') then
    raise exception 'Esta venta ya otorgó una recompensa de referidos; no se puede reabrir su saldo.';
  end if;
  if v_venta.pagado - v_pago.monto < 0 then raise exception 'El abono es mayor que lo pagado de la venta; revísalo antes de borrar.'; end if;
  select id into v_user from public.usuarios where auth_user_id = (select auth.uid()) and activo limit 1;

  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into v_creditos from public.creditos_paciente c where c.pago_id = p_pago;
  select coalesce(jsonb_agg(to_jsonb(h)), '[]'::jsonb) into v_correcciones from public.correccion_hora_abonos h where h.pago_id = p_pago;
  v_extras := jsonb_build_object('creditos_paciente', v_creditos, 'correccion_hora_abonos', v_correcciones,
                                 'venta_antes', jsonb_build_object('pagado', v_venta.pagado, 'saldo', v_venta.saldo, 'total', v_venta.total, 'folio', v_venta.folio));
  -- Si se pagó con saldo a favor, se devuelve ese saldo al paciente al borrar el uso.
  delete from public.creditos_paciente where pago_id = p_pago;
  delete from public.correccion_hora_abonos where pago_id = p_pago;

  perform set_config('app.borrar_abono', 'on', true);
  update public.ventas set pagado = pagado - v_pago.monto, saldo = saldo + v_pago.monto, actualizado_en = now() where id = v_venta.id;
  perform set_config('app.borrar_abono', 'off', true);

  insert into public.pagos_venta_eliminados (pago_id, venta_id, empresa_id, pago, extras, motivo, eliminado_por)
  values (p_pago, v_venta.id, v_venta.empresa_id, to_jsonb(v_pago), v_extras, trim(p_motivo), v_user);
  insert into public.historial_ventas_eventos (venta_id, empresa_id, evento, detalle, creado_por)
  values (v_venta.id, v_venta.empresa_id, 'venta_actualizada',
          jsonb_build_object('accion', 'abono_eliminado', 'metodo', v_pago.metodo, 'monto', v_pago.monto, 'motivo', trim(p_motivo)), v_user);
  delete from public.pagos_venta where id = p_pago;
end;
$$;

revoke all on function public.eliminar_abono_venta(uuid, text) from public, anon;
grant execute on function public.eliminar_abono_venta(uuid, text) to authenticated;
