-- Vendedor/caja pueden leer datos de pacientes (no historia clínica); vendedor agenda citas y registra pacientes;
-- metas se comparan con lo cobrado en el mes; nombres de sucursales; lentes de contacto fuera de accesorios.

create or replace function app_private.usuario_operativo_actual_id()
returns uuid language sql stable security definer set search_path to 'public', 'app_private'
as $function$
  select u.id from public.usuarios u join public.roles r on r.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo = true
    and r.nombre in ('superadmin', 'admin_sucursal', 'optometra', 'vendedor', 'caja')
  limit 1;
$function$;

create or replace function app_private.usuario_agenda_actual_id()
returns uuid language sql stable security definer set search_path to 'public', 'app_private'
as $function$
  select u.id from public.usuarios u join public.roles r on r.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo = true
    and r.nombre in ('superadmin', 'admin_sucursal', 'optometra', 'vendedor')
  limit 1;
$function$;

revoke all on function app_private.usuario_operativo_actual_id() from public, anon;
revoke all on function app_private.usuario_agenda_actual_id() from public, anon;
grant execute on function app_private.usuario_operativo_actual_id() to authenticated;
grant execute on function app_private.usuario_agenda_actual_id() to authenticated;

-- Datos demográficos del paciente: lectura para todo el equipo operativo. consultas_optometricas sigue solo clínica.
create policy pacientes_lectura_operativa on public.pacientes_clinicos
  for select to authenticated using ((select app_private.usuario_operativo_actual_id()) is not null);
create policy paciente_empresas_lectura_operativa on public.paciente_empresas
  for select to authenticated using ((select app_private.usuario_operativo_actual_id()) is not null);

-- Agenda: vendedor puede ver, crear y actualizar citas.
create policy agenda_lectura_equipo on public.citas_agenda
  for select to authenticated using ((select app_private.usuario_agenda_actual_id()) is not null);
create policy agenda_crear_equipo on public.citas_agenda
  for insert to authenticated with check (
    (select app_private.usuario_agenda_actual_id()) is not null
    and created_by = (select app_private.usuario_agenda_actual_id())
  );
create policy agenda_actualizar_equipo on public.citas_agenda
  for update to authenticated
  using ((select app_private.usuario_agenda_actual_id()) is not null)
  with check ((select app_private.usuario_agenda_actual_id()) is not null);

create or replace function app_private.registrar_evento_cita()
returns trigger language plpgsql security definer set search_path to 'public', 'app_private'
as $function$
declare campos text[];
begin
  if tg_op = 'INSERT' then
    insert into public.historial_citas_eventos (cita_id, actor_id, accion) values (new.id, app_private.usuario_agenda_actual_id(), 'creada');
  elsif tg_op = 'UPDATE' then
    select coalesce(array_agg(key order by key), '{}'::text[]) into campos from jsonb_each(to_jsonb(new)) as nuevo(key, value) join jsonb_each(to_jsonb(old)) as anterior using (key) where nuevo.value is distinct from anterior.value and key not in ('actualizado_en');
    insert into public.historial_citas_eventos (cita_id, actor_id, accion, campos_modificados) values (new.id, app_private.usuario_agenda_actual_id(), 'actualizada', campos);
  end if;
  return null;
end;
$function$;

-- Registrar pacientes: vendedor también (ya tenía pacientes:crear en permisos_rol).
create or replace function public.registrar_paciente_clinico(p_nombres text, p_apellidos text, p_cedula text default null, p_telefono text default null, p_email text default null, p_direccion text default null, p_fecha_nacimiento date default null, p_sexo text default null, p_ocupacion text default null, p_responsable_id uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'app_private'
as $function$
declare v_user uuid; v_empresa uuid; v_sucursal uuid; v_paciente uuid; v_existente uuid; v_cedula text;
begin
  select u.id, u.empresa_id, u.sucursal_id into v_user, v_empresa, v_sucursal
  from public.usuarios u join public.roles r on r.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and r.nombre in ('superadmin', 'admin_sucursal', 'optometra', 'vendedor');
  if v_user is null then raise exception 'No tienes permiso para registrar pacientes.'; end if;
  if p_nombres is null or trim(p_nombres) = '' or p_apellidos is null or trim(p_apellidos) = '' then
    raise exception 'Ingresa nombres y apellidos.';
  end if;
  if p_responsable_id is not null and not exists (select 1 from public.pacientes_clinicos where id = p_responsable_id) then
    raise exception 'El responsable de la cuenta indicado no existe.';
  end if;

  v_cedula := nullif(trim(p_cedula), '');
  if v_cedula is not null then
    select id into v_existente from public.pacientes_clinicos where cedula = v_cedula;
  end if;

  if v_existente is not null then
    insert into public.paciente_empresas(paciente_id, empresa_id, primera_sucursal_id, created_by)
    values (v_existente, v_empresa, v_sucursal, v_user)
    on conflict (paciente_id, empresa_id) do nothing;
    return jsonb_build_object('paciente_id', v_existente, 'ya_existia', true);
  end if;

  insert into public.pacientes_clinicos(nombres, apellidos, cedula, telefono, email, direccion, fecha_nacimiento, sexo, ocupacion, responsable_id, empresa_origen_id, created_by)
  values (trim(p_nombres), trim(p_apellidos), v_cedula, nullif(trim(p_telefono), ''), nullif(trim(p_email), ''), nullif(trim(p_direccion), ''), p_fecha_nacimiento, nullif(trim(p_sexo), ''), nullif(trim(p_ocupacion), ''), p_responsable_id, v_empresa, v_user)
  returning id into v_paciente;

  insert into public.paciente_empresas(paciente_id, empresa_id, primera_sucursal_id, created_by)
  values (v_paciente, v_empresa, v_sucursal, v_user);

  return jsonb_build_object('paciente_id', v_paciente, 'ya_existia', false);
end;
$function$;

revoke all on function public.registrar_paciente_clinico(text, text, text, text, text, text, date, text, text, uuid) from public, anon;
grant execute on function public.registrar_paciente_clinico(text, text, text, text, text, text, date, text, text, uuid) to authenticated;

-- Metas: agrega ingresos_total = abonos cobrados en el mes (por fecha del pago), sin ventas anuladas.
create or replace function public.obtener_informe_mensual(p_empresa uuid, p_mes date)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid; v_role text; v_desde date; v_hasta date; v_desde_ts timestamptz; v_hasta_ts timestamptz;
        v_por_sucursal jsonb; v_sin_sucursal jsonb; v_gastos_clasif jsonb; v_cobros_metodo jsonb; v_cuadres jsonb; v_cxc numeric; v_totales jsonb; v_meta_total numeric; v_gastos_total numeric; v_ingresos_total numeric;
begin
  select u.id, ro.nombre into v_user, v_role
  from public.usuarios u join public.roles ro on ro.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and (ro.nombre = 'superadmin' or u.empresa_id = p_empresa);
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('informes', 'leer')) then
    raise exception 'No autorizado';
  end if;
  if p_empresa is null and v_role <> 'superadmin' then raise exception 'No autorizado'; end if;

  v_desde := date_trunc('month', p_mes)::date;
  v_hasta := (v_desde + interval '1 month')::date;
  v_desde_ts := (v_desde::text || ' 00:00:00-05:00')::timestamptz;
  v_hasta_ts := (v_hasta::text || ' 00:00:00-05:00')::timestamptz;

  select coalesce(jsonb_agg(jsonb_build_object(
      'sucursal_id', s.id, 'sucursal_nombre', s.nombre, 'empresa_id', s.empresa_id, 'empresa_nombre', e.nombre,
      'ventas_total', coalesce(vt.total, 0), 'ventas_count', coalesce(vt.cnt, 0), 'cobrado_total', coalesce(vt.cobrado, 0),
      'ingresos_total', coalesce(ig.ingresos, 0),
      'meta', coalesce(m.monto_meta, 0)
    ) order by e.nombre, s.nombre), '[]'::jsonb)
    into v_por_sucursal
  from public.sucursales s
  join public.empresas e on e.id = s.empresa_id
  left join (
    select sucursal_id, sum(total) as total, count(*) as cnt, sum(pagado) as cobrado
    from public.ventas
    where estado = 'completada' and creado_en >= v_desde_ts and creado_en < v_hasta_ts and (p_empresa is null or empresa_id = p_empresa)
    group by sucursal_id
  ) vt on vt.sucursal_id = s.id
  left join (
    select v.sucursal_id, sum(p.monto) as ingresos
    from public.pagos_venta p join public.ventas v on v.id = p.venta_id
    where v.estado <> 'anulada' and p.creado_en >= v_desde_ts and p.creado_en < v_hasta_ts and (p_empresa is null or v.empresa_id = p_empresa)
    group by v.sucursal_id
  ) ig on ig.sucursal_id = s.id
  left join public.metas_ventas m on m.sucursal_id = s.id and m.empresa_id = s.empresa_id and m.mes = v_desde
  where s.activo and (p_empresa is null or s.empresa_id = p_empresa);

  select case when count(*) = 0 then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
      'sucursal_id', 'sin_sucursal', 'sucursal_nombre', 'Sin sucursal asignada', 'empresa_id', coalesce(p_empresa, '00000000-0000-0000-0000-000000000000'), 'empresa_nombre', '—',
      'ventas_total', coalesce(sum(total), 0), 'ventas_count', count(*), 'cobrado_total', coalesce(sum(pagado), 0),
      'ingresos_total', (select coalesce(sum(p.monto), 0) from public.pagos_venta p join public.ventas v2 on v2.id = p.venta_id
                         where v2.estado <> 'anulada' and v2.sucursal_id is null and p.creado_en >= v_desde_ts and p.creado_en < v_hasta_ts and (p_empresa is null or v2.empresa_id = p_empresa)),
      'meta', 0
    )) end
    into v_sin_sucursal
  from public.ventas
  where estado = 'completada' and sucursal_id is null and creado_en >= v_desde_ts and creado_en < v_hasta_ts and (p_empresa is null or empresa_id = p_empresa);

  v_por_sucursal := v_por_sucursal || v_sin_sucursal;

  select coalesce(jsonb_agg(jsonb_build_object('clasificacion', clasificacion, 'monto', monto) order by monto desc), '[]'::jsonb)
    into v_gastos_clasif
  from (select clasificacion, sum(monto) as monto from public.gastos where fecha >= v_desde and fecha < v_hasta and (p_empresa is null or empresa_id = p_empresa) group by clasificacion) g;

  select coalesce(jsonb_agg(jsonb_build_object('metodo', metodo, 'monto', monto) order by monto desc), '[]'::jsonb)
    into v_cobros_metodo
  from (
    select p.metodo, sum(p.monto) as monto
    from public.pagos_venta p join public.ventas v on v.id = p.venta_id
    where v.estado <> 'anulada' and p.creado_en >= v_desde_ts and p.creado_en < v_hasta_ts and (p_empresa is null or v.empresa_id = p_empresa)
    group by p.metodo
  ) c;

  select coalesce(sum(p.monto), 0) into v_ingresos_total
  from public.pagos_venta p join public.ventas v on v.id = p.venta_id
  where v.estado <> 'anulada' and p.creado_en >= v_desde_ts and p.creado_en < v_hasta_ts and (p_empresa is null or v.empresa_id = p_empresa);

  select jsonb_build_object('correctos', count(*) filter (where cuadre_correcto), 'total', count(*))
    into v_cuadres
  from public.cierres_caja where fecha >= v_desde and fecha < v_hasta and (p_empresa is null or empresa_id = p_empresa);

  select coalesce(sum(saldo), 0) into v_cxc from public.ventas where estado = 'completada' and saldo > 0 and (p_empresa is null or empresa_id = p_empresa);
  select coalesce(sum(monto_meta), 0) into v_meta_total from public.metas_ventas where mes = v_desde and (p_empresa is null or empresa_id = p_empresa);
  select coalesce(sum(monto), 0) into v_gastos_total from public.gastos where fecha >= v_desde and fecha < v_hasta and (p_empresa is null or empresa_id = p_empresa);

  select jsonb_build_object('ventas_total', coalesce(sum(v.total),0), 'ventas_count', count(*), 'cobrado_total', coalesce(sum(v.pagado),0), 'saldo_total', coalesce(sum(v.saldo),0))
    into v_totales
  from public.ventas v where v.estado = 'completada' and v.creado_en >= v_desde_ts and v.creado_en < v_hasta_ts and (p_empresa is null or v.empresa_id = p_empresa);

  return jsonb_build_object(
    'mes', v_desde,
    'por_sucursal', v_por_sucursal,
    'totales', v_totales || jsonb_build_object('meta_total', v_meta_total, 'gastos_total', v_gastos_total, 'cuentas_por_cobrar_total', v_cxc, 'ingresos_total', v_ingresos_total),
    'gastos_por_clasificacion', v_gastos_clasif,
    'cobros_por_metodo', v_cobros_metodo,
    'cuadres', v_cuadres
  );
end;
$function$;

revoke all on function public.obtener_informe_mensual(uuid, date) from public, anon;
grant execute on function public.obtener_informe_mensual(uuid, date) to authenticated;

-- Nombres de sucursales pedidos por Shuyana (2026-09-24).
update public.sucursales set nombre = 'Shuvision' where id = '3bd2a17c-b4e0-4137-a5f3-66475dbcb836';
update public.sucursales set nombre = 'Shuvision Sacha' where id = '1db17433-cc24-409f-92d2-794a01ce79d4';
update public.sucursales set nombre = 'Focus' where id = 'e2775b83-2105-46a7-8c40-d8de6b3a63dd';

-- Lentes de contacto estaban como "accesorio" y aparecían en venta rápida.
update public.productos_catalogo set categoria = 'lente'
where id in ('16ea75e5-f13f-4bb5-963c-67ebc7d597c5', '67c25879-92e9-439d-9099-885fb6c5a9e3', 'fa44fe7c-9ec5-465f-9fbc-638bab8bd30b',
             '607ffbe1-8b00-439b-8e82-3c6cb756c233', '53d388bf-604e-41b6-820b-62e5553a03ba');
