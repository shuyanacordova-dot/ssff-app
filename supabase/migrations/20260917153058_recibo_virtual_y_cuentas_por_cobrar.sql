
-- Frecuencia de cobro por paciente (para el módulo de cuentas por cobrar)
alter table public.pacientes_clinicos add column if not exists frecuencia_cobro text;
alter table public.pacientes_clinicos drop constraint if exists pacientes_clinicos_frecuencia_cobro_check;
alter table public.pacientes_clinicos add constraint pacientes_clinicos_frecuencia_cobro_check check (frecuencia_cobro is null or frecuencia_cobro in ('semanal','quincenal','mensual'));

-- Recibo virtual: token público no adivinable + fecha tentativa de entrega
alter table public.ventas add column if not exists recibo_token uuid not null default gen_random_uuid();
alter table public.ventas add column if not exists fecha_entrega_estimada date;
create unique index if not exists ventas_recibo_token_key on public.ventas (recibo_token);

-- Actualiza la frecuencia de cobro de un paciente
create or replace function public.actualizar_frecuencia_cobro(p_paciente uuid, p_frecuencia text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid; v_role text;
begin
  select u.id, ro.nombre into v_user, v_role
  from public.usuarios u join public.roles ro on ro.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo;
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('ventas', 'crear')) then
    raise exception 'No autorizado';
  end if;
  if p_frecuencia is not null and p_frecuencia not in ('semanal','quincenal','mensual') then
    raise exception 'Frecuencia inválida';
  end if;
  update public.pacientes_clinicos set frecuencia_cobro = p_frecuencia, actualizado_en = now() where id = p_paciente;
end;
$$;
revoke all on function public.actualizar_frecuencia_cobro(uuid, text) from public, anon;
grant execute on function public.actualizar_frecuencia_cobro(uuid, text) to authenticated;

-- Genera/actualiza el recibo virtual de una venta (fecha tentativa de entrega) y devuelve su token público
create or replace function public.actualizar_entrega_venta(p_venta uuid, p_fecha date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid; v_role text; v_empresa uuid; v_token uuid;
begin
  select v.empresa_id into v_empresa from public.ventas v where v.id = p_venta;
  if v_empresa is null then raise exception 'Venta no encontrada'; end if;

  select u.id, ro.nombre into v_user, v_role
  from public.usuarios u join public.roles ro on ro.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and (ro.nombre = 'superadmin' or u.empresa_id = v_empresa);
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('ventas', 'crear')) then
    raise exception 'No autorizado';
  end if;

  update public.ventas set fecha_entrega_estimada = p_fecha, actualizado_en = now() where id = p_venta returning recibo_token into v_token;
  return jsonb_build_object('recibo_token', v_token, 'fecha_entrega_estimada', p_fecha);
end;
$$;
revoke all on function public.actualizar_entrega_venta(uuid, date) from public, anon;
grant execute on function public.actualizar_entrega_venta(uuid, date) to authenticated;

-- Recibo público (sin login): solo expone lo necesario para el paciente, identificado por un token no adivinable
create or replace function public.obtener_recibo_publico(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_venta record; v_paciente_nombre text; v_empresa_nombre text; v_sucursal_nombre text; v_items jsonb; v_abonos jsonb;
begin
  select id, empresa_id, sucursal_id, paciente_id, cliente_nombre, estado, subtotal, descuento, total, pagado, saldo, fecha_entrega_estimada, creado_en
    into v_venta from public.ventas where recibo_token = p_token;
  if v_venta.id is null then raise exception 'Recibo no encontrado'; end if;

  select trim(coalesce(nombres,'') || ' ' || coalesce(apellidos,'')) into v_paciente_nombre from public.pacientes_clinicos where id = v_venta.paciente_id;
  select nombre into v_empresa_nombre from public.empresas where id = v_venta.empresa_id;
  select nombre into v_sucursal_nombre from public.sucursales where id = v_venta.sucursal_id;

  select coalesce(jsonb_agg(jsonb_build_object('descripcion', descripcion, 'cantidad', cantidad, 'precio_unitario', precio_unitario, 'total_linea', total_linea) order by id), '[]'::jsonb)
    into v_items from public.venta_items where venta_id = v_venta.id;
  select coalesce(jsonb_agg(jsonb_build_object('fecha', creado_en, 'monto', monto, 'metodo', metodo) order by creado_en), '[]'::jsonb)
    into v_abonos from public.pagos_venta where venta_id = v_venta.id;

  return jsonb_build_object(
    'paciente_nombre', coalesce(nullif(v_paciente_nombre, ''), v_venta.cliente_nombre, 'Cliente'),
    'empresa_nombre', v_empresa_nombre,
    'sucursal_nombre', v_sucursal_nombre,
    'estado', v_venta.estado,
    'items', v_items,
    'abonos', v_abonos,
    'subtotal', v_venta.subtotal,
    'descuento', v_venta.descuento,
    'total', v_venta.total,
    'pagado', v_venta.pagado,
    'saldo', v_venta.saldo,
    'fecha_entrega_estimada', v_venta.fecha_entrega_estimada,
    'creado_en', v_venta.creado_en
  );
end;
$$;
revoke all on function public.obtener_recibo_publico(uuid) from public;
grant execute on function public.obtener_recibo_publico(uuid) to anon, authenticated;
;
