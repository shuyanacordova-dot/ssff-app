
-- Las ventas ya tenían columna paciente_id pero nunca se llenaba: el
-- carrito no permitía elegir paciente. Se agrega el parámetro a la
-- función que cierra la venta.
create or replace function public.registrar_venta(p_empresa uuid, p_sucursal uuid, p_cliente text, p_items jsonb, p_pagos jsonb default '[]'::jsonb, p_paciente uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $function$
declare v_user uuid; v_role text; v_sale uuid; v_sub numeric := 0; v_paid numeric := 0; r record; p record; v_producto record; v_stock_disponible numeric;
begin
  select u.id, ro.nombre into v_user, v_role
  from public.usuarios u join public.roles ro on ro.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and (ro.nombre = 'superadmin' or u.empresa_id = p_empresa);

  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('ventas', 'crear')) then
    raise exception 'No autorizado';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un producto';
  end if;

  insert into public.ventas(empresa_id, sucursal_id, paciente_id, cliente_nombre, estado, created_by)
  values (p_empresa, p_sucursal, p_paciente, nullif(p_cliente, ''), 'borrador', v_user)
  returning id into v_sale;

  for r in select * from jsonb_to_recordset(p_items) as x(producto_id uuid, cantidad numeric, descuento numeric) loop
    select pr.id, pr.nombre, pr.categoria, pr.precio_venta, pr.controla_inventario into v_producto
    from public.productos_catalogo pr where pr.id = r.producto_id and pr.empresa_id = p_empresa and pr.activo;
    if not found then raise exception 'Producto no disponible'; end if;

    if v_producto.controla_inventario and v_producto.categoria = 'montura' and p_sucursal is not null then
      select coalesce(cantidad, 0) into v_stock_disponible from public.inventario_stock where producto_id = v_producto.id and sucursal_id = p_sucursal;
      if coalesce(v_stock_disponible, 0) < r.cantidad then
        raise exception 'No hay stock de "%" en esta sucursal.', v_producto.nombre;
      end if;
    end if;

    insert into public.venta_items(venta_id, producto_id, descripcion, cantidad, precio_unitario, descuento, total_linea)
    values (v_sale, v_producto.id, v_producto.nombre, r.cantidad, v_producto.precio_venta, coalesce(r.descuento, 0), greatest(0, r.cantidad * v_producto.precio_venta - coalesce(r.descuento, 0)));

    if v_producto.controla_inventario and p_sucursal is not null then
      insert into public.movimientos_inventario (producto_id, sucursal_id, tipo, cantidad, motivo, venta_id, created_by)
      values (v_producto.id, p_sucursal, 'salida', r.cantidad, 'Venta', v_sale, v_user);
    end if;
  end loop;

  select coalesce(sum(total_linea), 0) into v_sub from public.venta_items where venta_id = v_sale;

  for p in select * from jsonb_to_recordset(p_pagos) as x(metodo text, monto numeric, referencia text, banco text) loop
    if p.monto <= 0 or p.metodo not in ('efectivo', 'transferencia', 'tarjeta', 'credito', 'otro') then
      raise exception 'Pago inválido';
    end if;
    insert into public.pagos_venta(venta_id, metodo, monto, referencia, banco, recibido_por)
    values (v_sale, p.metodo, p.monto, nullif(p.referencia, ''), nullif(p.banco, ''), v_user);
    v_paid := v_paid + p.monto;
  end loop;

  if v_paid > v_sub then raise exception 'Los pagos no pueden superar el total'; end if;

  update public.ventas set subtotal = v_sub, total = v_sub, pagado = v_paid, saldo = v_sub - v_paid, estado = 'completada', actualizado_en = now() where id = v_sale;
  return v_sale;
end;
$function$;

-- Su propia especificación dice que el optometrista puede "realizar
-- ventas", pero el rol no tenía ningún permiso sobre el recurso
-- 'ventas' — no podía vender ni ver el historial de compras de un
-- paciente en su ficha clínica.
insert into public.permisos_rol (rol_id, recurso, accion)
select r.id, 'ventas', accion.a
from public.roles r cross join (values ('crear'), ('leer')) as accion(a)
where r.nombre = 'optometra'
on conflict do nothing;
;
