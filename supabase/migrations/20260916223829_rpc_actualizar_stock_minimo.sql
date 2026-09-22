
-- El stock mínimo se editaba con un upsert directo a la tabla, pero la
-- política de inventario_stock solo exige permiso de lectura ('leer'),
-- así que un vendedor podría haberlo modificado. Se mueve a una función
-- que sí exige el permiso de edición, igual que el resto de escrituras
-- de inventario.
create or replace function public.actualizar_stock_minimo(p_producto uuid, p_sucursal uuid, p_minimo numeric)
returns void
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $function$
declare v_user uuid; v_role text; v_empresa uuid;
begin
  select empresa_id into v_empresa from public.productos_catalogo where id = p_producto;
  if v_empresa is null then raise exception 'Producto no encontrado'; end if;

  select u.id, r.nombre into v_user, v_role
  from public.usuarios u join public.roles r on r.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and (r.nombre = 'superadmin' or u.empresa_id = v_empresa);
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('inventario', 'editar')) then
    raise exception 'No autorizado';
  end if;
  if p_minimo is null or p_minimo < 0 then raise exception 'El mínimo no puede ser negativo.'; end if;

  insert into public.inventario_stock (producto_id, sucursal_id, stock_minimo)
  values (p_producto, p_sucursal, p_minimo)
  on conflict (producto_id, sucursal_id) do update set stock_minimo = p_minimo, actualizado_en = now();
end;
$function$;

revoke all on function public.actualizar_stock_minimo(uuid, uuid, numeric) from public, anon;
grant execute on function public.actualizar_stock_minimo(uuid, uuid, numeric) to authenticated;
;
