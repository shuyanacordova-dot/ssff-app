
-- El catálogo no distinguía qué productos son físicos (controlan stock)
-- de los que no (servicios, tratamientos), ni guardaba proveedor.
alter table public.productos_catalogo
  add column if not exists proveedor text,
  add column if not exists controla_inventario boolean not null default true;
update public.productos_catalogo set controla_inventario = false where categoria in ('servicio', 'tratamiento');

-- Stock por sucursal (un producto puede tener existencias distintas en
-- cada sucursal de la misma empresa).
create table public.inventario_stock (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos_catalogo(id) on delete cascade,
  sucursal_id uuid not null references public.sucursales(id),
  cantidad numeric not null default 0,
  stock_minimo numeric not null default 0,
  actualizado_en timestamptz not null default now(),
  unique (producto_id, sucursal_id)
);

-- Historial de movimientos: entradas, salidas, ajustes y transferencias
-- entre sucursales. Las transferencias se guardan como dos filas (salida
-- + entrada) unidas por grupo_transferencia_id.
create table public.movimientos_inventario (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos_catalogo(id),
  sucursal_id uuid not null references public.sucursales(id),
  tipo text not null check (tipo in ('entrada', 'salida', 'ajuste', 'transferencia_salida', 'transferencia_entrada')),
  cantidad numeric not null,
  motivo text,
  venta_id uuid references public.ventas(id),
  grupo_transferencia_id uuid,
  created_by uuid not null references public.usuarios(id),
  creado_en timestamptz not null default now(),
  check (tipo = 'ajuste' or cantidad > 0),
  check (tipo <> 'ajuste' or cantidad <> 0)
);

-- Aplica el movimiento al stock (crea la fila de stock si no existía).
create or replace function app_private.aplicar_movimiento_inventario()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $function$
declare v_delta numeric;
begin
  v_delta := case when new.tipo in ('salida', 'transferencia_salida') then -new.cantidad else new.cantidad end;
  insert into public.inventario_stock (producto_id, sucursal_id, cantidad)
  values (new.producto_id, new.sucursal_id, v_delta)
  on conflict (producto_id, sucursal_id) do update set cantidad = public.inventario_stock.cantidad + v_delta, actualizado_en = now();
  return new;
end;
$function$;

create trigger trg_aplicar_movimiento_inventario
  after insert on public.movimientos_inventario
  for each row execute function app_private.aplicar_movimiento_inventario();

alter table public.inventario_stock enable row level security;
alter table public.movimientos_inventario enable row level security;

create or replace function app_private.puede_inventario_empresa(p_producto uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'app_private'
as $function$
  select exists (
    select 1 from public.usuarios u join public.roles r on r.id = u.rol_id join public.productos_catalogo p on p.id = p_producto
    where u.auth_user_id = (select auth.uid()) and u.activo
      and (r.nombre = 'superadmin' or u.empresa_id = p.empresa_id)
      and (r.nombre = 'superadmin' or public.tiene_permiso('inventario', 'leer'))
  );
$function$;

create policy inventario_stock_rls on public.inventario_stock for all
  using (app_private.puede_inventario_empresa(producto_id)) with check (app_private.puede_inventario_empresa(producto_id));
create policy movimientos_inventario_rls on public.movimientos_inventario for all
  using (app_private.puede_inventario_empresa(producto_id)) with check (app_private.puede_inventario_empresa(producto_id));

-- Movimiento manual: entrada, salida o ajuste. Exige permiso de edición
-- de inventario (solo administración), no solo lectura.
create or replace function public.registrar_movimiento_inventario(
  p_producto uuid, p_sucursal uuid, p_tipo text, p_cantidad numeric, p_motivo text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $function$
declare v_user uuid; v_role text; v_empresa uuid; v_stock numeric; v_id uuid;
begin
  select empresa_id into v_empresa from public.productos_catalogo where id = p_producto;
  if v_empresa is null then raise exception 'Producto no encontrado'; end if;

  select u.id, r.nombre into v_user, v_role
  from public.usuarios u join public.roles r on r.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and (r.nombre = 'superadmin' or u.empresa_id = v_empresa);
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('inventario', 'editar')) then
    raise exception 'No autorizado';
  end if;
  if p_tipo not in ('entrada', 'salida', 'ajuste') then raise exception 'Tipo de movimiento inválido.'; end if;
  if p_tipo <> 'ajuste' and (p_cantidad is null or p_cantidad <= 0) then raise exception 'La cantidad debe ser mayor a cero.'; end if;
  if p_tipo = 'ajuste' and (p_cantidad is null or p_cantidad = 0) then raise exception 'El ajuste no puede ser cero.'; end if;

  if p_tipo = 'salida' then
    select coalesce(cantidad, 0) into v_stock from public.inventario_stock where producto_id = p_producto and sucursal_id = p_sucursal;
    if coalesce(v_stock, 0) < p_cantidad then raise exception 'No hay suficiente stock en esa sucursal (disponible: %).', coalesce(v_stock, 0); end if;
  end if;

  insert into public.movimientos_inventario (producto_id, sucursal_id, tipo, cantidad, motivo, created_by)
  values (p_producto, p_sucursal, p_tipo, p_cantidad, nullif(trim(p_motivo), ''), v_user)
  returning id into v_id;
  return v_id;
end;
$function$;

-- Transferencia entre sucursales de la misma empresa: dos movimientos
-- atómicos (salida en origen, entrada en destino).
create or replace function public.transferir_inventario(
  p_producto uuid, p_sucursal_origen uuid, p_sucursal_destino uuid, p_cantidad numeric, p_motivo text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $function$
declare v_user uuid; v_role text; v_empresa uuid; v_stock numeric; v_grupo uuid := gen_random_uuid();
begin
  select empresa_id into v_empresa from public.productos_catalogo where id = p_producto;
  if v_empresa is null then raise exception 'Producto no encontrado'; end if;
  if p_sucursal_origen = p_sucursal_destino then raise exception 'Elige dos sucursales distintas.'; end if;

  select u.id, r.nombre into v_user, v_role
  from public.usuarios u join public.roles r on r.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and (r.nombre = 'superadmin' or u.empresa_id = v_empresa);
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('inventario', 'editar')) then
    raise exception 'No autorizado';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then raise exception 'La cantidad debe ser mayor a cero.'; end if;

  select coalesce(cantidad, 0) into v_stock from public.inventario_stock where producto_id = p_producto and sucursal_id = p_sucursal_origen;
  if coalesce(v_stock, 0) < p_cantidad then raise exception 'No hay suficiente stock en la sucursal de origen (disponible: %).', coalesce(v_stock, 0); end if;

  insert into public.movimientos_inventario (producto_id, sucursal_id, tipo, cantidad, motivo, grupo_transferencia_id, created_by)
  values (p_producto, p_sucursal_origen, 'transferencia_salida', p_cantidad, nullif(trim(p_motivo), ''), v_grupo, v_user);
  insert into public.movimientos_inventario (producto_id, sucursal_id, tipo, cantidad, motivo, grupo_transferencia_id, created_by)
  values (p_producto, p_sucursal_destino, 'transferencia_entrada', p_cantidad, nullif(trim(p_motivo), ''), v_grupo, v_user);
  return v_grupo;
end;
$function$;

-- registrar_venta ahora descuenta stock automáticamente por cada línea
-- de un producto que controla inventario, si la venta tiene sucursal.
create or replace function public.registrar_venta(p_empresa uuid, p_sucursal uuid, p_cliente text, p_items jsonb, p_pagos jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $function$
declare v_user uuid; v_role text; v_sale uuid; v_sub numeric := 0; v_paid numeric := 0; r record; p record; v_producto record;
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

  insert into public.ventas(empresa_id, sucursal_id, cliente_nombre, estado, created_by)
  values (p_empresa, p_sucursal, nullif(p_cliente, ''), 'borrador', v_user)
  returning id into v_sale;

  for r in select * from jsonb_to_recordset(p_items) as x(producto_id uuid, cantidad numeric, descuento numeric) loop
    select pr.id, pr.nombre, pr.precio_venta, pr.controla_inventario into v_producto
    from public.productos_catalogo pr where pr.id = r.producto_id and pr.empresa_id = p_empresa and pr.activo;
    if not found then raise exception 'Producto no disponible'; end if;

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

revoke all on function public.registrar_movimiento_inventario(uuid, uuid, text, numeric, text) from public, anon;
grant execute on function public.registrar_movimiento_inventario(uuid, uuid, text, numeric, text) to authenticated;
revoke all on function public.transferir_inventario(uuid, uuid, uuid, numeric, text) from public, anon;
grant execute on function public.transferir_inventario(uuid, uuid, uuid, numeric, text) to authenticated;
;
