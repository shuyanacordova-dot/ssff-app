create or replace function public.anular_venta(p_venta uuid, p_motivo text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_empresa uuid;
  v_estado text;
  v_es_superadmin boolean;
  v_user uuid;
  r record;
begin
  if char_length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Indica el motivo de la anulación (mínimo 5 caracteres).';
  end if;

  select exists (
    select 1
    from public.usuarios u
    join public.roles r on r.id = u.rol_id
    where u.auth_user_id = (select auth.uid())
      and u.activo
      and r.nombre = 'superadmin'
  ) into v_es_superadmin;

  if not v_es_superadmin then
    raise exception 'Solo la Superadministradora puede anular una venta.';
  end if;

  select u.id into v_user from public.usuarios u where u.auth_user_id = (select auth.uid()) and u.activo;

  select v.empresa_id, v.estado
    into v_empresa, v_estado
  from public.ventas v
  where v.id = p_venta
  for update;

  if not found then
    raise exception 'No se encontró la venta.';
  end if;

  if v_estado <> 'completada' then
    raise exception 'Solo se pueden anular ventas completadas.';
  end if;

  update public.ventas
  set estado = 'anulada',
      motivo_anulacion = btrim(p_motivo)
  where id = p_venta;

  for r in select producto_id, sucursal_id, cantidad from public.movimientos_inventario where venta_id = p_venta and tipo = 'salida' loop
    insert into public.movimientos_inventario (producto_id, sucursal_id, tipo, cantidad, motivo, venta_id, created_by)
    values (r.producto_id, r.sucursal_id, 'entrada', r.cantidad, 'Reversión por anulación de venta', p_venta, v_user);
  end loop;
end;
$function$;;
