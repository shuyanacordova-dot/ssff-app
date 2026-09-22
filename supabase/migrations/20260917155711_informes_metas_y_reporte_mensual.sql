
-- Metas de ventas mensuales por sucursal
create table if not exists public.metas_ventas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  sucursal_id uuid not null references public.sucursales(id),
  mes date not null,
  monto_meta numeric not null default 0,
  created_by uuid references public.usuarios(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (empresa_id, sucursal_id, mes)
);
alter table public.metas_ventas enable row level security;
drop policy if exists metas_ventas_select on public.metas_ventas;
create policy metas_ventas_select on public.metas_ventas for select to authenticated
  using (exists (select 1 from public.usuarios u join public.roles r on r.id = u.rol_id where u.auth_user_id = (select auth.uid()) and u.activo and (r.nombre = 'superadmin' or u.empresa_id = metas_ventas.empresa_id)));

-- Permisos para el nuevo módulo de informes (solo administración; vendedor/caja/optometra no ven agregados financieros)
insert into public.permisos_rol (rol_id, recurso, accion)
select r.id, 'informes', accion
from public.roles r cross join (values ('leer'), ('editar')) as a(accion)
where r.nombre = 'admin_sucursal'
on conflict do nothing;

-- Fija o actualiza la meta de ventas de una sucursal para un mes
create or replace function public.establecer_meta_venta(p_empresa uuid, p_sucursal uuid, p_mes date, p_monto numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid; v_role text; v_mes date;
begin
  select u.id, ro.nombre into v_user, v_role
  from public.usuarios u join public.roles ro on ro.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and (ro.nombre = 'superadmin' or u.empresa_id = p_empresa);
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('informes', 'editar')) then
    raise exception 'No autorizado';
  end if;
  if p_monto is null or p_monto < 0 then raise exception 'Indica una meta válida.'; end if;

  v_mes := date_trunc('month', p_mes)::date;
  insert into public.metas_ventas (empresa_id, sucursal_id, mes, monto_meta, created_by)
  values (p_empresa, p_sucursal, v_mes, p_monto, v_user)
  on conflict (empresa_id, sucursal_id, mes) do update set monto_meta = excluded.monto_meta, actualizado_en = now();
end;
$$;
revoke all on function public.establecer_meta_venta(uuid, uuid, date, numeric) from public, anon;
grant execute on function public.establecer_meta_venta(uuid, uuid, date, numeric) to authenticated;

-- Informe mensual agregado: por sucursal, gastos por clasificación, cobros por forma de pago, cuadres, cuentas por cobrar.
-- p_empresa = null solo lo puede usar superadmin, y agrega "todo el negocio" (todas las empresas).
create or replace function public.obtener_informe_mensual(p_empresa uuid, p_mes date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid; v_role text; v_desde date; v_hasta date; v_desde_ts timestamptz; v_hasta_ts timestamptz;
        v_por_sucursal jsonb; v_gastos_clasif jsonb; v_cobros_metodo jsonb; v_cuadres jsonb; v_cxc numeric; v_totales jsonb; v_meta_total numeric; v_gastos_total numeric;
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
  left join public.metas_ventas m on m.sucursal_id = s.id and m.empresa_id = s.empresa_id and m.mes = v_desde
  where s.activo and (p_empresa is null or s.empresa_id = p_empresa);

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
    'totales', v_totales || jsonb_build_object('meta_total', v_meta_total, 'gastos_total', v_gastos_total, 'cuentas_por_cobrar_total', v_cxc),
    'gastos_por_clasificacion', v_gastos_clasif,
    'cobros_por_metodo', v_cobros_metodo,
    'cuadres', v_cuadres
  );
end;
$$;
revoke all on function public.obtener_informe_mensual(uuid, date) from public, anon;
grant execute on function public.obtener_informe_mensual(uuid, date) to authenticated;
;
