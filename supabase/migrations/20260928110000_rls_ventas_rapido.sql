-- Yuli (vendedora) no podía abrir Cobros: la regla de acceso de ventas llamaba a puede_ventas_empresa() por CADA venta
-- (≈5.700 veces, ~3 s solo en ventas, y otra vez por cada ítem y pago) y la página se quedaba sin cargar.
-- Ahora se calcula UNA vez la lista de empresas a las que la persona puede ver ventas. Mismo permiso, mismo resultado.
create or replace function app_private.empresas_ventas_usuario()
returns uuid[] language sql stable security definer set search_path to 'public', 'app_private'
as $$
  select case
    when exists (select 1 from public.usuarios u join public.roles r on r.id = u.rol_id
                 where u.auth_user_id = (select auth.uid()) and u.activo and r.nombre = 'superadmin')
      then (select coalesce(array_agg(e.id), '{}') from public.empresas e)
    else (select coalesce(array_agg(u.empresa_id), '{}') from public.usuarios u
          where u.auth_user_id = (select auth.uid()) and u.activo and public.tiene_permiso('ventas', 'leer'))
  end;
$$;
revoke all on function app_private.empresas_ventas_usuario() from public, anon;
grant execute on function app_private.empresas_ventas_usuario() to authenticated;

drop policy if exists ventas_ventas on public.ventas;
create policy ventas_ventas on public.ventas for all to authenticated
  using ((select app_private.empresas_ventas_usuario()) @> array[empresa_id])
  with check ((select app_private.empresas_ventas_usuario()) @> array[empresa_id]);

drop policy if exists items_ventas on public.venta_items;
create policy items_ventas on public.venta_items for all to authenticated
  using (exists (select 1 from public.ventas v where v.id = venta_items.venta_id and v.(select app_private.empresas_ventas_usuario()) @> array[empresa_id]))
  with check (exists (select 1 from public.ventas v where v.id = venta_items.venta_id and v.(select app_private.empresas_ventas_usuario()) @> array[empresa_id]));

drop policy if exists pagos_ventas on public.pagos_venta;
create policy pagos_ventas on public.pagos_venta for all to authenticated
  using (exists (select 1 from public.ventas v where v.id = pagos_venta.venta_id and v.(select app_private.empresas_ventas_usuario()) @> array[empresa_id]))
  with check (exists (select 1 from public.ventas v where v.id = pagos_venta.venta_id and v.(select app_private.empresas_ventas_usuario()) @> array[empresa_id]));

-- Mismo arreglo para el catálogo de productos (1.826 filas, se carga al abrir cada venta) y garantías.
drop policy if exists productos_ventas on public.productos_catalogo;
create policy productos_ventas on public.productos_catalogo for all to authenticated
  using ((select app_private.empresas_ventas_usuario()) @> array[empresa_id])
  with check ((select app_private.empresas_ventas_usuario()) @> array[empresa_id]);

drop policy if exists garantias_ventas on public.garantias;
create policy garantias_ventas on public.garantias for all to public
  using ((select app_private.empresas_ventas_usuario()) @> array[empresa_id]);
