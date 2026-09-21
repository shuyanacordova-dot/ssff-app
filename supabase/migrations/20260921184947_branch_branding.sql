-- Identidad visual por sucursal. Todos los campos son opcionales:
-- cuando están vacíos, la aplicación hereda la identidad de la empresa.
alter table public.sucursales
  add column if not exists logo_url text,
  add column if not exists direccion text,
  add column if not exists telefono text,
  add column if not exists email text,
  add column if not exists color_primario text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sucursales_color_primario_formato'
      and conrelid = 'public.sucursales'::regclass
  ) then
    alter table public.sucursales
      add constraint sucursales_color_primario_formato
      check (color_primario is null or color_primario ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end $$;

-- Búsquedas de sucursales permitidas por usuario.
create index if not exists accesos_cruzados_usuario_activo_idx
  on public.accesos_cruzados (usuario_id, empresa_destino_id, sucursal_destino_id)
  where activo = true and paciente_id is null;

-- La lectura continúa disponible para usuarios autenticados.
-- Solo superadministración puede cambiar la identidad de una sucursal.
drop policy if exists "superadmin configura sucursales" on public.sucursales;
create policy "superadmin configura sucursales"
on public.sucursales
for update
to authenticated
using ((select public.es_superadmin()))
with check ((select public.es_superadmin()));

-- El recibo público conserva su token y ahora toma primero la identidad
-- de la sucursal que originó la venta.
create or replace function public.obtener_recibo_publico(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_venta record;
  v_paciente_nombre text;
  v_paciente_telefono text;
  v_empresa record;
  v_sucursal record;
  v_items jsonb;
  v_abonos jsonb;
begin
  select id, empresa_id, sucursal_id, paciente_id, cliente_nombre, estado, subtotal, descuento, total, pagado, saldo, fecha_entrega_estimada, creado_en, folio
    into v_venta
    from public.ventas
   where recibo_token = p_token;
  if v_venta.id is null then raise exception 'Recibo no encontrado'; end if;

  select trim(coalesce(nombres,'') || ' ' || coalesce(apellidos,'')), telefono
    into v_paciente_nombre, v_paciente_telefono
    from public.pacientes_clinicos
   where id = v_venta.paciente_id;
  select nombre, direccion, telefono, email, logo_url
    into v_empresa
    from public.empresas
   where id = v_venta.empresa_id;
  select nombre, direccion, telefono, email, logo_url
    into v_sucursal
    from public.sucursales
   where id = v_venta.sucursal_id;

  select coalesce(jsonb_agg(jsonb_build_object('descripcion', descripcion, 'cantidad', cantidad, 'precio_unitario', precio_unitario, 'total_linea', total_linea) order by id), '[]'::jsonb)
    into v_items from public.venta_items where venta_id = v_venta.id;
  select coalesce(jsonb_agg(jsonb_build_object('fecha', creado_en, 'monto', monto, 'metodo', metodo) order by creado_en), '[]'::jsonb)
    into v_abonos from public.pagos_venta where venta_id = v_venta.id;

  return jsonb_build_object(
    'paciente_nombre', coalesce(nullif(v_paciente_nombre, ''), v_venta.cliente_nombre, 'Cliente'),
    'paciente_telefono', v_paciente_telefono,
    'empresa_nombre', v_empresa.nombre,
    'empresa_direccion', coalesce(v_sucursal.direccion, v_empresa.direccion),
    'empresa_telefono', coalesce(v_sucursal.telefono, v_empresa.telefono),
    'empresa_email', coalesce(v_sucursal.email, v_empresa.email),
    'empresa_logo_url', coalesce(v_sucursal.logo_url, v_empresa.logo_url),
    'sucursal_nombre', v_sucursal.nombre,
    'folio', v_venta.folio,
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
$function$;

-- El recibo se comparte con un UUID no predecible. Declaramos los roles
-- explícitamente para evitar que PostgreSQL conceda EXECUTE a PUBLIC.
revoke all on function public.obtener_recibo_publico(uuid) from public;
grant execute on function public.obtener_recibo_publico(uuid) to anon, authenticated, service_role;
