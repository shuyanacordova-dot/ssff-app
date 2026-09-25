-- Anular venta con dos opciones (pedido por Shuyana 2026-09-25):
--   'devolver': el producto vuelve al inventario y el dinero pagado se devuelve HOY (egreso de caja o banco,
--               clasificación "ajuste", concepto "Devolución venta folio N").
--   'credito' : el producto vuelve al inventario y el dinero queda como SALDO A FAVOR del paciente (por empresa),
--               usable en una próxima venta o abono con el método "saldo_favor".
-- En ambos casos los abonos originales siguen contando como ingreso del día en que entraron (el dinero sí entró);
-- las anulaciones antiguas (anulacion_modo null, p. ej. duplicados) siguen excluidas como antes.
-- El método "saldo_favor" NO es dinero nuevo: no cuenta en caja, resumen ni ingresos.

alter table public.ventas add column if not exists anulacion_modo text
  check (anulacion_modo is null or anulacion_modo in ('devolver', 'credito'));

alter table public.pagos_venta drop constraint if exists pagos_venta_metodo_check;
alter table public.pagos_venta add constraint pagos_venta_metodo_check
  check (metodo in ('efectivo', 'transferencia', 'tarjeta', 'credito', 'otro', 'saldo_favor'));

create table if not exists public.creditos_paciente (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes_clinicos(id),
  empresa_id uuid not null references public.empresas(id),
  monto numeric(12,2) not null check (monto <> 0),
  tipo text not null check (tipo in ('anulacion', 'uso')),
  venta_origen_id uuid references public.ventas(id),
  venta_uso_id uuid references public.ventas(id),
  pago_id uuid references public.pagos_venta(id),
  motivo text,
  creado_por uuid references public.usuarios(id),
  creado_en timestamptz not null default now()
);
create index if not exists creditos_paciente_paciente_idx on public.creditos_paciente (paciente_id, empresa_id);
alter table public.creditos_paciente enable row level security;
revoke all on public.creditos_paciente from public, anon, authenticated;
grant select on public.creditos_paciente to authenticated;
drop policy if exists creditos_paciente_leer on public.creditos_paciente;
create policy creditos_paciente_leer on public.creditos_paciente for select to authenticated
  using (public.es_superadmin() or exists (
    select 1 from public.usuarios u where u.auth_user_id = (select auth.uid()) and u.activo and u.empresa_id = creditos_paciente.empresa_id));

create or replace function public.saldo_favor_paciente(p_paciente uuid, p_empresa uuid)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(sum(monto), 0)::numeric from public.creditos_paciente
  where paciente_id = p_paciente and empresa_id = p_empresa
    and (public.es_superadmin() or exists (
      select 1 from public.usuarios u where u.auth_user_id = (select auth.uid()) and u.activo and u.empresa_id = p_empresa));
$$;
revoke all on function public.saldo_favor_paciente(uuid, uuid) from public, anon;
grant execute on function public.saldo_favor_paciente(uuid, uuid) to authenticated;

create or replace function public.anular_venta_con_modo(p_venta uuid, p_motivo text, p_modo text, p_devolucion_origen text default 'caja', p_devolucion_banco text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid; v_empresa uuid; v_sucursal uuid; v_paciente uuid; v_estado text; v_pagado numeric; v_folio int;
  v_cuenta uuid; v_hoy date := (now() at time zone 'America/Guayaquil')::date; r record;
begin
  if char_length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Indica el motivo de la anulación (mínimo 5 caracteres).';
  end if;
  if not public.es_superadmin() then
    raise exception 'Solo la Superadministradora puede anular una venta.';
  end if;
  if p_modo not in ('devolver', 'credito') then
    raise exception 'Elige si el dinero se devuelve o queda como saldo a favor.';
  end if;
  select u.id into v_user from public.usuarios u where u.auth_user_id = (select auth.uid()) and u.activo;

  select v.empresa_id, v.sucursal_id, v.paciente_id, v.estado, v.pagado, v.folio
    into v_empresa, v_sucursal, v_paciente, v_estado, v_pagado, v_folio
  from public.ventas v where v.id = p_venta for update;
  if not found then raise exception 'No se encontró la venta.'; end if;
  if v_estado <> 'completada' then raise exception 'Solo se pueden anular ventas completadas.'; end if;
  if p_modo = 'credito' and v_pagado > 0 and v_paciente is null then
    raise exception 'La venta no tiene paciente: el saldo a favor solo se puede guardar a nombre de un paciente.';
  end if;
  if p_modo = 'devolver' and v_pagado > 0 then
    if p_devolucion_origen not in ('caja', 'banco') then raise exception 'Indica cómo se devuelve el dinero.'; end if;
    if p_devolucion_origen = 'banco' then
      select c.id into v_cuenta from public.cuentas_bancarias c where c.empresa_id = v_empresa and c.banco = p_devolucion_banco limit 1;
      if v_cuenta is null then raise exception 'Elige el banco desde el que se devuelve el dinero.'; end if;
    end if;
  end if;

  update public.ventas
     set estado = 'anulada', motivo_anulacion = btrim(p_motivo), anulacion_modo = p_modo
   where id = p_venta;

  for r in select producto_id, sucursal_id, cantidad from public.movimientos_inventario where venta_id = p_venta and tipo = 'salida' loop
    insert into public.movimientos_inventario (producto_id, sucursal_id, tipo, cantidad, motivo, venta_id, created_by)
    values (r.producto_id, r.sucursal_id, 'entrada', r.cantidad, 'Reversión por anulación de venta', p_venta, v_user);
  end loop;

  if v_pagado > 0 and p_modo = 'credito' then
    insert into public.creditos_paciente (paciente_id, empresa_id, monto, tipo, venta_origen_id, motivo, creado_por)
    values (v_paciente, v_empresa, v_pagado, 'anulacion', p_venta, btrim(p_motivo), v_user);
  elsif v_pagado > 0 and p_modo = 'devolver' then
    insert into public.gastos (empresa_id, sucursal_id, fecha, clasificacion, concepto, monto, origen, cuenta_bancaria_id, observaciones, created_by)
    values (v_empresa, v_sucursal, v_hoy, 'ajuste', 'Devolución venta folio ' || coalesce(v_folio::text, '?'), v_pagado,
            p_devolucion_origen, v_cuenta, btrim(p_motivo), v_user);
  end if;

  return jsonb_build_object('pagado', v_pagado, 'modo', p_modo);
end;
$function$;
revoke all on function public.anular_venta_con_modo(uuid, text, text, text, text) from public, anon;
grant execute on function public.anular_venta_con_modo(uuid, text, text, text, text) to authenticated;

-- Abonos: se agrega el método "saldo_favor" (descuenta del saldo a favor del paciente en esa empresa).
create or replace function public.registrar_abono_venta(p_venta uuid, p_metodo text, p_monto numeric, p_referencia text default null, p_banco text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $function$
declare v_user uuid; v_role text; v_empresa uuid; v_estado text; v_saldo numeric; v_paciente uuid; v_pago uuid;
begin
  select empresa_id, estado, saldo, paciente_id into v_empresa, v_estado, v_saldo, v_paciente from public.ventas where id = p_venta;
  if v_empresa is null then raise exception 'Venta no encontrada'; end if;
  select u.id, ro.nombre into v_user, v_role
  from public.usuarios u join public.roles ro on ro.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and (ro.nombre = 'superadmin' or u.empresa_id = v_empresa);
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('ventas', 'crear')) then raise exception 'No autorizado'; end if;
  if v_estado <> 'completada' then raise exception 'Solo se pueden abonar ventas completadas.'; end if;
  if p_metodo not in ('efectivo', 'transferencia', 'tarjeta', 'credito', 'otro', 'saldo_favor') then raise exception 'Método de pago inválido'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto debe ser mayor a cero.'; end if;
  if p_monto > v_saldo then raise exception 'El abono no puede superar el saldo pendiente.'; end if;
  if p_metodo = 'saldo_favor' then
    if v_paciente is null then raise exception 'La venta no tiene paciente para usar saldo a favor.'; end if;
    perform 1 from public.pacientes_clinicos where id = v_paciente for update;
    if p_monto > (select coalesce(sum(monto), 0) from public.creditos_paciente where paciente_id = v_paciente and empresa_id = v_empresa) then
      raise exception 'El paciente no tiene suficiente saldo a favor.';
    end if;
  end if;
  insert into public.pagos_venta(venta_id, metodo, monto, referencia, banco, recibido_por)
  values (p_venta, p_metodo, p_monto, nullif(p_referencia, ''), case when p_metodo = 'saldo_favor' then null else nullif(p_banco, '') end, v_user)
  returning id into v_pago;
  if p_metodo = 'saldo_favor' then
    insert into public.creditos_paciente (paciente_id, empresa_id, monto, tipo, venta_uso_id, pago_id, creado_por)
    values (v_paciente, v_empresa, -p_monto, 'uso', p_venta, v_pago, v_user);
  end if;
  update public.ventas set pagado = pagado + p_monto, saldo = saldo - p_monto, actualizado_en = now() where id = p_venta;
  return p_venta;
end;
$function$;

-- Ventas nuevas: también aceptan pagar con "saldo_favor".
create or replace function public.registrar_venta(p_empresa uuid, p_sucursal uuid, p_cliente text, p_items jsonb, p_pagos jsonb default '[]'::jsonb, p_paciente uuid default null::uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $function$
declare
  v_user uuid; v_role text; v_sale uuid; v_sub numeric := 0; v_paid numeric := 0; v_favor numeric := 0;
  r record; p record; v_producto record; v_stock_disponible numeric; v_pago uuid;
begin
  select u.id, ro.nombre into v_user, v_role
  from public.usuarios u join public.roles ro on ro.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and (ro.nombre = 'superadmin' or u.empresa_id = p_empresa);
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('ventas', 'crear')) then raise exception 'No autorizado'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Agrega al menos un producto'; end if;

  insert into public.ventas(empresa_id, sucursal_id, paciente_id, cliente_nombre, estado, created_by)
  values (p_empresa, p_sucursal, p_paciente, nullif(p_cliente, ''), 'borrador', v_user) returning id into v_sale;

  for r in select * from jsonb_to_recordset(p_items) as x(producto_id uuid, cantidad numeric, descuento numeric) loop
    select pr.id, pr.nombre, pr.categoria, pr.precio_venta, pr.controla_inventario into v_producto
    from public.productos_catalogo pr where pr.id = r.producto_id and pr.empresa_id = p_empresa and pr.activo;
    if not found then raise exception 'Producto no disponible'; end if;
    if v_producto.controla_inventario and v_producto.categoria in ('montura', 'gafas_sol') and p_sucursal is not null then
      select coalesce(cantidad, 0) into v_stock_disponible from public.inventario_stock where producto_id = v_producto.id and sucursal_id = p_sucursal;
      if coalesce(v_stock_disponible, 0) < r.cantidad then raise exception 'No hay stock de "%" en esta sucursal.', v_producto.nombre; end if;
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
    if p.monto <= 0 or p.metodo not in ('efectivo', 'transferencia', 'tarjeta', 'credito', 'otro', 'saldo_favor') then raise exception 'Pago inválido'; end if;
    insert into public.pagos_venta(venta_id, metodo, monto, referencia, banco, recibido_por)
    values (v_sale, p.metodo, p.monto, nullif(p.referencia, ''), case when p.metodo = 'saldo_favor' then null else nullif(p.banco, '') end, v_user)
    returning id into v_pago;
    if p.metodo = 'saldo_favor' then
      if p_paciente is null then raise exception 'Elige el paciente para usar su saldo a favor.'; end if;
      v_favor := v_favor + p.monto;
      insert into public.creditos_paciente (paciente_id, empresa_id, monto, tipo, venta_uso_id, pago_id, creado_por)
      values (p_paciente, p_empresa, -p.monto, 'uso', v_sale, v_pago, v_user);
    end if;
    v_paid := v_paid + p.monto;
  end loop;
  if v_paid > v_sub then raise exception 'Los pagos no pueden superar el total'; end if;
  if v_favor > 0 then
    perform 1 from public.pacientes_clinicos where id = p_paciente for update;
    if (select coalesce(sum(monto), 0) from public.creditos_paciente where paciente_id = p_paciente and empresa_id = p_empresa) < 0 then
      raise exception 'El paciente no tiene suficiente saldo a favor.';
    end if;
  end if;

  update public.ventas set subtotal = v_sub, total = v_sub, pagado = v_paid, saldo = v_sub - v_paid, estado = 'completada', actualizado_en = now() where id = v_sale;
  return v_sale;
end;
$function$;

-- Caja, cierre e informes: los abonos de ventas anuladas con devolución o saldo a favor siguen siendo ingreso
-- de su día; el método saldo_favor no es dinero nuevo.
do $$
declare f text; def text; n int;
begin
  foreach f in array array['previsualizar_cierre_caja', 'registrar_cierre_caja', 'obtener_informe_mensual'] loop
    select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = f;
    n := (length(def) - length(replace(def, 'estado <> ''anulada''', ''))) / length('estado <> ''anulada''');
    if n = 0 then raise exception 'No se encontró el filtro de anuladas en %', f; end if;
    def := replace(def, 'v2.estado <> ''anulada''', '(v2.estado <> ''anulada'' or v2.anulacion_modo is not null) and p.metodo <> ''saldo_favor''');
    def := replace(def, 'v.estado <> ''anulada''', '(v.estado <> ''anulada'' or v.anulacion_modo is not null) and p.metodo <> ''saldo_favor''');
    execute def;
  end loop;
end $$;
