
-- Columnas para registrar la anulación de una venta (auditoría)
alter table public.ventas
  add column if not exists motivo_anulacion text,
  add column if not exists anulada_en timestamptz,
  add column if not exists anulada_por uuid references public.usuarios(id);

-- El rol real es 'caja' (no 'cajero'); además el acceso general a ventas
-- ahora se basa en el sistema de permisos por rol (tabla permisos_rol),
-- igual que el resto del sistema.
create or replace function app_private.puede_ventas_empresa(p_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'app_private'
as $function$
  select exists (
    select 1
    from public.usuarios u
    join public.roles r on r.id = u.rol_id
    where u.auth_user_id = (select auth.uid())
      and u.activo
      and (r.nombre = 'superadmin' or u.empresa_id = p_empresa)
      and (r.nombre = 'superadmin' or public.tiene_permiso('ventas', 'leer'))
  );
$function$;

-- registrar_venta ahora exige el permiso 'crear' sobre 'ventas'
-- (antes cualquiera de una lista de roles hardcodeada, incluyendo el rol
-- inexistente 'cajero', podía cerrar una venta).
create or replace function public.registrar_venta(p_empresa uuid, p_sucursal uuid, p_cliente text, p_items jsonb, p_pagos jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $function$
declare v_user uuid; v_role text; v_sale uuid; v_sub numeric := 0; v_paid numeric := 0; r record; p record;
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
    insert into public.venta_items(venta_id, producto_id, descripcion, cantidad, precio_unitario, descuento, total_linea)
    select v_sale, pr.id, pr.nombre, r.cantidad, pr.precio_venta, coalesce(r.descuento, 0), greatest(0, r.cantidad * pr.precio_venta - coalesce(r.descuento, 0))
    from public.productos_catalogo pr
    where pr.id = r.producto_id and pr.empresa_id = p_empresa and pr.activo;
    if not found then raise exception 'Producto no disponible'; end if;
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

-- Registrar un abono posterior sobre una venta con saldo pendiente
create or replace function public.registrar_abono_venta(p_venta uuid, p_metodo text, p_monto numeric, p_referencia text default null, p_banco text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $function$
declare v_user uuid; v_role text; v_empresa uuid; v_estado text; v_saldo numeric;
begin
  select empresa_id, estado, saldo into v_empresa, v_estado, v_saldo from public.ventas where id = p_venta;
  if v_empresa is null then raise exception 'Venta no encontrada'; end if;

  select u.id, ro.nombre into v_user, v_role
  from public.usuarios u join public.roles ro on ro.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and (ro.nombre = 'superadmin' or u.empresa_id = v_empresa);

  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('ventas', 'crear')) then
    raise exception 'No autorizado';
  end if;
  if v_estado <> 'completada' then raise exception 'Solo se pueden abonar ventas completadas.'; end if;
  if p_metodo not in ('efectivo', 'transferencia', 'tarjeta', 'credito', 'otro') then raise exception 'Método de pago inválido'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto debe ser mayor a cero.'; end if;
  if p_monto > v_saldo then raise exception 'El abono no puede superar el saldo pendiente.'; end if;

  insert into public.pagos_venta(venta_id, metodo, monto, referencia, banco, recibido_por)
  values (p_venta, p_metodo, p_monto, nullif(p_referencia, ''), nullif(p_banco, ''), v_user);

  update public.ventas set pagado = pagado + p_monto, saldo = saldo - p_monto, actualizado_en = now() where id = p_venta;
  return p_venta;
end;
$function$;

-- Protege ventas completadas/anuladas: exige autorización y motivo para
-- anular, impide reabrir una venta anulada, e impide alterar el total o
-- el saldo de una venta cerrada fuera del flujo de abonos.
create or replace function app_private.validar_transicion_venta()
returns trigger
language plpgsql
security invoker
set search_path to 'public', 'app_private'
as $function$
declare v_role text; v_actor uuid; v_abono numeric;
begin
  if old.estado = 'anulada' then
    raise exception 'Una venta anulada no puede modificarse.';
  end if;

  select ro.nombre, u.id into v_role, v_actor
  from public.usuarios u join public.roles ro on ro.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and (ro.nombre = 'superadmin' or u.empresa_id = old.empresa_id);

  if new.estado = 'anulada' and old.estado <> 'anulada' then
    if v_role is null or not (v_role = 'superadmin' or public.tiene_permiso('ventas', 'editar')) then
      raise exception 'Solo administración puede anular una venta.';
    end if;
    if new.motivo_anulacion is null or char_length(trim(new.motivo_anulacion)) < 5 then
      raise exception 'Indica el motivo de la anulación (mínimo 5 caracteres).';
    end if;
    new.anulada_en := now();
    new.anulada_por := v_actor;
    return new;
  end if;

  if old.estado = 'completada' and (new.pagado <> old.pagado or new.saldo <> old.saldo or new.subtotal <> old.subtotal or new.descuento <> old.descuento or new.total <> old.total) then
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

drop trigger if exists trg_validar_transicion_venta on public.ventas;
create trigger trg_validar_transicion_venta
before update on public.ventas
for each row execute function app_private.validar_transicion_venta();

-- Una vez anulada, sus líneas y pagos quedan congelados
create or replace function app_private.bloquear_cambios_venta_anulada()
returns trigger
language plpgsql
security invoker
set search_path to 'public', 'app_private'
as $function$
declare v_estado text; v_venta uuid;
begin
  v_venta := coalesce(new.venta_id, old.venta_id);
  select estado into v_estado from public.ventas where id = v_venta;
  if v_estado = 'anulada' then
    raise exception 'No se pueden modificar los detalles de una venta anulada.';
  end if;
  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_bloquear_items_venta_anulada on public.venta_items;
create trigger trg_bloquear_items_venta_anulada
before insert or update or delete on public.venta_items
for each row execute function app_private.bloquear_cambios_venta_anulada();

drop trigger if exists trg_bloquear_pagos_venta_anulada on public.pagos_venta;
create trigger trg_bloquear_pagos_venta_anulada
before insert or update or delete on public.pagos_venta
for each row execute function app_private.bloquear_cambios_venta_anulada();
;
