-- Informes con desglose (Shuyana, 2026-10-12): cada parte del informe abre su detalle del mes.
-- Egresos: Shuyana elige sus propias categorías; la categoría se recuerda por concepto para los egresos futuros.

create table if not exists public.categorias_gasto_informe (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  creado_en timestamptz not null default now()
);
alter table public.categorias_gasto_informe enable row level security;
drop policy if exists categorias_gasto_informe_leer on public.categorias_gasto_informe;
create policy categorias_gasto_informe_leer on public.categorias_gasto_informe for select to authenticated using (true);

-- Concepto (escrito a mano, normalizado) → categoría elegida por Shuyana.
create table if not exists public.gasto_concepto_categoria (
  concepto_normalizado text primary key,
  categoria text not null,
  actualizado_en timestamptz not null default now()
);
alter table public.gasto_concepto_categoria enable row level security;
drop policy if exists gasto_concepto_categoria_leer on public.gasto_concepto_categoria;
create policy gasto_concepto_categoria_leer on public.gasto_concepto_categoria for select to authenticated using (true);

-- Categoría de un egreso puntual (tiene prioridad sobre la del concepto).
alter table public.gastos add column if not exists categoria_informe text;

create or replace function public.normalizar_concepto_gasto(p text)
returns text language sql immutable set search_path = public as $$
  select regexp_replace(lower(trim(translate(coalesce(p, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'))), '\s+', ' ', 'g');
$$;

create or replace function public.obtener_desglose_informe(p_empresa uuid, p_mes date, p_tipo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_role text; v_desde date; v_hasta date; v_desde_ts timestamptz; v_hasta_ts timestamptz; v_filas jsonb;
begin
  select u.id, ro.nombre into v_user, v_role
  from public.usuarios u join public.roles ro on ro.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and (ro.nombre = 'superadmin' or u.empresa_id = p_empresa);
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('informes', 'leer')) then raise exception 'No autorizado'; end if;
  if p_empresa is null and v_role <> 'superadmin' then raise exception 'No autorizado'; end if;

  v_desde := date_trunc('month', p_mes)::date;
  v_hasta := (v_desde + interval '1 month')::date;
  v_desde_ts := (v_desde::text || ' 00:00:00-05:00')::timestamptz;
  v_hasta_ts := (v_hasta::text || ' 00:00:00-05:00')::timestamptz;

  if p_tipo in ('ventas', 'saldo', 'cxc') then
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', v.id, 'fecha', (v.creado_en at time zone 'America/Guayaquil')::date, 'folio', v.folio,
        'cliente', coalesce(nullif(trim(concat_ws(' ', pc.apellidos, pc.nombres)), ''), v.cliente_nombre, 'Cliente ocasional'),
        'sucursal', s.nombre, 'tipo_venta', v.tipo_venta, 'total', v.total, 'pagado', v.pagado, 'saldo', v.saldo
      ) order by v.creado_en desc), '[]'::jsonb) into v_filas
    from public.ventas v
    left join public.pacientes_clinicos pc on pc.id = v.paciente_id
    left join public.sucursales s on s.id = v.sucursal_id
    where v.estado = 'completada' and (p_empresa is null or v.empresa_id = p_empresa)
      and (p_tipo = 'cxc' or (v.creado_en >= v_desde_ts and v.creado_en < v_hasta_ts))
      and (p_tipo = 'ventas' or v.saldo > 0);
  elsif p_tipo = 'cobros' then
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'fecha', (p.creado_en at time zone 'America/Guayaquil')::date, 'folio', v.folio,
        'cliente', coalesce(nullif(trim(concat_ws(' ', pc.apellidos, pc.nombres)), ''), v.cliente_nombre, 'Cliente ocasional'),
        'sucursal', s.nombre, 'metodo', p.metodo, 'banco', p.banco, 'monto', p.monto,
        'venta_del_mes', v.creado_en >= v_desde_ts and v.creado_en < v_hasta_ts
      ) order by p.creado_en desc), '[]'::jsonb) into v_filas
    from public.pagos_venta p
    join public.ventas v on v.id = p.venta_id
    left join public.pacientes_clinicos pc on pc.id = v.paciente_id
    left join public.sucursales s on s.id = v.sucursal_id
    where (v.estado <> 'anulada' or v.anulacion_modo is not null) and p.metodo <> 'saldo_favor'
      and p.creado_en >= v_desde_ts and p.creado_en < v_hasta_ts and (p_empresa is null or v.empresa_id = p_empresa);
  elsif p_tipo = 'gastos' then
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', g.id, 'fecha', g.fecha, 'concepto', g.concepto, 'clasificacion', g.clasificacion,
        'categoria', coalesce(g.categoria_informe, m.categoria), 'categoria_propia', g.categoria_informe is not null,
        'sucursal', s.nombre, 'origen', g.origen, 'monto', g.monto, 'observaciones', g.observaciones
      ) order by g.fecha desc, g.creado_en desc), '[]'::jsonb) into v_filas
    from public.gastos g
    left join public.gasto_concepto_categoria m on m.concepto_normalizado = public.normalizar_concepto_gasto(g.concepto)
    left join public.sucursales s on s.id = g.sucursal_id
    where g.fecha >= v_desde and g.fecha < v_hasta and (p_empresa is null or g.empresa_id = p_empresa);
  elsif p_tipo = 'cuadres' then
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'fecha', c.fecha, 'sucursal', s.nombre, 'correcto', c.cuadre_correcto, 'diferencia', c.diferencia,
        'caja_esperada', c.caja_esperada, 'caja_fisica', c.caja_fisica, 'observaciones', c.observaciones
      ) order by c.fecha desc), '[]'::jsonb) into v_filas
    from public.cierres_caja c left join public.sucursales s on s.id = c.sucursal_id
    where c.fecha >= v_desde and c.fecha < v_hasta and (p_empresa is null or c.empresa_id = p_empresa);
  else
    raise exception 'Desglose no válido';
  end if;

  return jsonb_build_object('tipo', p_tipo, 'filas', v_filas,
    'categorias', (select coalesce(jsonb_agg(nombre order by nombre), '[]'::jsonb) from public.categorias_gasto_informe));
end;
$$;

-- Asignar categoría (solo superadmin). p_por_concepto = true: se recuerda para todos los egresos con ese concepto.
create or replace function public.asignar_categoria_gasto(p_gasto uuid, p_categoria text, p_por_concepto boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_role text; v_concepto text; v_cat text := nullif(trim(p_categoria), '');
begin
  select ro.nombre into v_role from public.usuarios u join public.roles ro on ro.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo;
  if v_role is distinct from 'superadmin' then raise exception 'Solo la superadministradora clasifica los egresos'; end if;
  select concepto into v_concepto from public.gastos where id = p_gasto;
  if not found then raise exception 'Egreso no encontrado'; end if;
  if v_cat is not null then insert into public.categorias_gasto_informe (nombre) values (v_cat) on conflict (nombre) do nothing; end if;

  if p_por_concepto then
    if v_cat is null then
      delete from public.gasto_concepto_categoria where concepto_normalizado = public.normalizar_concepto_gasto(v_concepto);
    else
      insert into public.gasto_concepto_categoria (concepto_normalizado, categoria) values (public.normalizar_concepto_gasto(v_concepto), v_cat)
      on conflict (concepto_normalizado) do update set categoria = excluded.categoria, actualizado_en = now();
    end if;
    update public.gastos set categoria_informe = null where id = p_gasto;
  else
    update public.gastos set categoria_informe = v_cat where id = p_gasto;
  end if;
end;
$$;

revoke all on function public.obtener_desglose_informe(uuid, date, text) from public, anon;
revoke all on function public.asignar_categoria_gasto(uuid, text, boolean) from public, anon;
revoke all on function public.normalizar_concepto_gasto(text) from public, anon;
grant execute on function public.obtener_desglose_informe(uuid, date, text) to authenticated;
grant execute on function public.asignar_categoria_gasto(uuid, text, boolean) to authenticated;
grant execute on function public.normalizar_concepto_gasto(text) to authenticated;
