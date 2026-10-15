-- Referidos y recompensas, fase 2: funciones de solo lectura del panel del CRM.
-- Diseño: docs/superpowers/specs/2026-10-15-referidos-panel-crm-design.md

-- Valida rol, período y sucursal. Devuelve el programa, la sucursal efectiva y el intervalo [ini, fin) en hora de Ecuador.
create or replace function app_private.contexto_panel_referidos(p_empresa uuid, p_desde date, p_hasta date, p_sucursal uuid)
returns table (o_programa uuid, o_sucursal uuid, o_ini timestamptz, o_fin timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_rol text; v_prog uuid; v_suc uuid;
begin
  v_rol := public.rol_referidos(p_empresa);
  if v_rol is null or v_rol not in ('superadmin', 'admin_sucursal') then raise exception 'No autorizado'; end if;
  if p_desde is null or p_hasta is null then raise exception 'Indica el período (desde y hasta).'; end if;
  if p_desde > p_hasta then raise exception 'La fecha inicial no puede ser posterior a la fecha final.'; end if;
  if p_hasta - p_desde > 365 then raise exception 'El período no puede superar 366 días.'; end if;
  select id into v_prog from public.programas_referidos where empresa_id = p_empresa;
  if v_rol = 'admin_sucursal' then
    select u.sucursal_id into v_suc from public.usuarios u where u.auth_user_id = (select auth.uid()) and u.activo;
    if v_suc is null then raise exception 'Tu usuario no tiene sucursal asignada.'; end if;
  else
    v_suc := p_sucursal;
  end if;
  if v_suc is not null and not exists (select 1 from public.sucursales s where s.id = v_suc and s.empresa_id = p_empresa) then
    raise exception 'La sucursal no pertenece a esta óptica.';
  end if;
  return query select v_prog, v_suc, (p_desde::timestamp at time zone 'America/Guayaquil'), ((p_hasta + 1)::timestamp at time zone 'America/Guayaquil');
end $$;
revoke all on function app_private.contexto_panel_referidos(uuid, date, date, uuid) from public, anon, authenticated;

create or replace function public.panel_referidos(p_empresa uuid, p_desde date, p_hasta date, p_sucursal uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c record; v_prog public.programas_referidos; v_rol text;
  v_ind jsonb; v_rank jsonb; v_total integer; v_sucs jsonb;
  v_reg numeric; v_comp numeric; v_vn numeric; v_vt numeric; v_desc numeric; v_usados numeric; v_costo numeric;
begin
  select * into c from app_private.contexto_panel_referidos(p_empresa, p_desde, p_hasta, p_sucursal);
  select * into v_prog from public.programas_referidos where id = c.o_programa;
  v_rol := public.rol_referidos(p_empresa);

  with refs as (
    select rf.id, rf.estado, rf.creado_en, rf.aplicado_en, rf.pagado_en, rf.venta_id, rf.descuento_aplicado, rf.credito_a_otorgar,
           rf.referidor_paciente_id, v.total as venta_total, coalesce(v.sucursal_id, ur.sucursal_id) as suc
    from public.referidos rf
    left join public.ventas v on v.id = rf.venta_id
    left join public.usuarios ur on ur.id = rf.registrado_por
    where rf.programa_id = c.o_programa
  ), r as (
    select * from refs where c.o_sucursal is null or suc = c.o_sucursal
  ), mov as (
    select m.tipo, m.monto, m.paciente_id, coalesce(vm.sucursal_id, vl.sucursal_id) as suc, vm.estado as venta_estado
    from public.monedero_movimientos m
    left join public.ventas vm on vm.id = m.venta_id
    left join public.monedero_movimientos lt on lt.id = m.lote_id
    left join public.ventas vl on vl.id = lt.venta_id
    where m.programa_id = c.o_programa and m.creado_en >= c.o_ini and m.creado_en < c.o_fin
  ), mv as (
    select * from mov where c.o_sucursal is null or suc = c.o_sucursal
  ), act as (
    select r.referidor_paciente_id as pid,
           count(*) filter (where r.estado = 'recompensado' and r.pagado_en >= c.o_ini and r.pagado_en < c.o_fin) as exitosos,
           coalesce(sum(r.venta_total) filter (where r.aplicado_en >= c.o_ini and r.aplicado_en < c.o_fin and r.estado <> 'revertido'), 0) as ventas
    from r
    where (r.creado_en >= c.o_ini and r.creado_en < c.o_fin) or (r.aplicado_en >= c.o_ini and r.aplicado_en < c.o_fin) or (r.pagado_en >= c.o_ini and r.pagado_en < c.o_fin)
    group by r.referidor_paciente_id
  ), gan as (
    select paciente_id as pid, sum(monto) as ganado from mv where tipo in ('credito', 'bono_hito') group by paciente_id
  )
  select
    jsonb_build_object(
      'codigos', (select count(*) from public.codigos_referido where programa_id = c.o_programa),
      'registrados', (select count(*) from r where creado_en >= c.o_ini and creado_en < c.o_fin),
      'compraron', (select count(*) from r where creado_en >= c.o_ini and creado_en < c.o_fin and venta_id is not null and estado <> 'revertido'),
      'ventas_n', (select count(*) from r where aplicado_en >= c.o_ini and aplicado_en < c.o_fin and estado <> 'revertido'),
      'ventas_total', (select coalesce(sum(venta_total), 0) from r where aplicado_en >= c.o_ini and aplicado_en < c.o_fin and estado <> 'revertido'),
      'descuentos', (select coalesce(sum(descuento_aplicado), 0) from r where aplicado_en >= c.o_ini and aplicado_en < c.o_fin and estado <> 'revertido'),
      'pendientes', (select coalesce(sum(credito_a_otorgar), 0) from r where estado = 'en_pago'),
      'creditos_generados', (select coalesce(sum(monto), 0) from mv where tipo in ('credito', 'ajuste') and monto > 0),
      'creditos_usados', (select coalesce(-sum(monto), 0) from mv where tipo = 'uso' and venta_estado is distinct from 'anulada'),
      'creditos_vencidos', (select coalesce(-sum(monto), 0) from mv where tipo = 'vencimiento'),
      'bonos_n', (select count(*) from mv where tipo = 'bono_hito'),
      'bonos_monto', (select coalesce(sum(monto), 0) from mv where tipo = 'bono_hito')
    ),
    coalesce((select jsonb_agg(to_jsonb(q) order by q.exitosos desc, q.ventas desc, q.nombre) from (
      select a.pid as paciente_id, btrim(pc.nombres || ' ' || pc.apellidos) as nombre, cr.codigo, a.exitosos, a.ventas,
             coalesce(g.ganado, 0) as credito_ganado, app_private.saldo_disponible_monedero(c.o_programa, a.pid) as disponible
      from act a
      join public.pacientes_clinicos pc on pc.id = a.pid
      left join public.codigos_referido cr on cr.programa_id = c.o_programa and cr.paciente_id = a.pid
      left join gan g on g.pid = a.pid
      order by a.exitosos desc, a.ventas desc, btrim(pc.nombres || ' ' || pc.apellidos)
      limit 20) q), '[]'::jsonb),
    (select count(*) from act)
  into v_ind, v_rank, v_total;

  v_reg := (v_ind->>'registrados')::numeric; v_comp := (v_ind->>'compraron')::numeric;
  v_vn := (v_ind->>'ventas_n')::numeric; v_vt := (v_ind->>'ventas_total')::numeric;
  v_desc := (v_ind->>'descuentos')::numeric; v_usados := (v_ind->>'creditos_usados')::numeric;
  v_costo := v_desc + v_usados;
  v_ind := v_ind || jsonb_build_object(
    'conversion', case when v_reg > 0 then round(100.0 * v_comp / v_reg, 1) end,
    'ticket', case when v_vn > 0 then round(v_vt / v_vn, 2) end,
    'costo', v_costo,
    'resultado', v_vt - v_costo,
    'costo_pct', case when v_vt > 0 then round(100.0 * v_costo / v_vt, 1) end);

  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre) order by s.nombre), '[]'::jsonb) into v_sucs
  from public.sucursales s where s.empresa_id = p_empresa and (v_rol = 'superadmin' or s.id = c.o_sucursal);

  return jsonb_build_object('programa_activo', coalesce(v_prog.activo, false), 'nombre', v_prog.nombre,
    'periodo', jsonb_build_object('desde', p_desde, 'hasta', p_hasta), 'sucursal', c.o_sucursal, 'sucursales', v_sucs,
    'indicadores', v_ind, 'ranking', v_rank, 'ranking_total', v_total);
end $$;
revoke all on function public.panel_referidos(uuid, date, date, uuid) from public, anon;
grant execute on function public.panel_referidos(uuid, date, date, uuid) to authenticated;

create or replace function public.panel_referidos_detalle(p_empresa uuid, p_referidor uuid, p_desde date, p_hasta date, p_sucursal uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c record; v_nombre text; v_codigo text; v_res jsonb; v_refs jsonb; v_movs jsonb;
begin
  select * into c from app_private.contexto_panel_referidos(p_empresa, p_desde, p_hasta, p_sucursal);
  if not exists (select 1 from public.paciente_empresas where paciente_id = p_referidor and empresa_id = p_empresa) then
    raise exception 'Esa persona no pertenece a esta óptica.';
  end if;
  select btrim(nombres || ' ' || apellidos) into v_nombre from public.pacientes_clinicos where id = p_referidor;
  select codigo into v_codigo from public.codigos_referido where programa_id = c.o_programa and paciente_id = p_referidor;

  with refs as (
    select rf.id, rf.estado, rf.creado_en, rf.aplicado_en, rf.pagado_en, rf.descuento_aplicado, rf.credito_a_otorgar, rf.referido_paciente_id,
           v.total as venta_total, v.folio, coalesce(v.sucursal_id, ur.sucursal_id) as suc
    from public.referidos rf
    left join public.ventas v on v.id = rf.venta_id
    left join public.usuarios ur on ur.id = rf.registrado_por
    where rf.programa_id = c.o_programa and rf.referidor_paciente_id = p_referidor
  ), rs as (
    select * from refs where (c.o_sucursal is null or suc = c.o_sucursal)
      and ((creado_en >= c.o_ini and creado_en < c.o_fin) or (aplicado_en >= c.o_ini and aplicado_en < c.o_fin) or (pagado_en >= c.o_ini and pagado_en < c.o_fin))
  )
  select coalesce(jsonb_agg(jsonb_build_object('nombre', btrim(pc.nombres || ' ' || pc.apellidos), 'estado', rs.estado, 'creado_en', rs.creado_en,
           'aplicado_en', rs.aplicado_en, 'venta_total', rs.venta_total, 'folio', rs.folio, 'sucursal', s.nombre,
           'descuento', rs.descuento_aplicado, 'credito', rs.credito_a_otorgar) order by rs.creado_en desc, rs.id), '[]'::jsonb)
  into v_refs
  from rs join public.pacientes_clinicos pc on pc.id = rs.referido_paciente_id left join public.sucursales s on s.id = rs.suc;

  with mov as (
    select m.id, m.tipo, m.monto, m.vence_en, m.motivo, m.creado_en, m.referido_id, vm.estado as venta_estado, coalesce(vm.sucursal_id, vl.sucursal_id) as suc
    from public.monedero_movimientos m
    left join public.ventas vm on vm.id = m.venta_id
    left join public.monedero_movimientos lt on lt.id = m.lote_id
    left join public.ventas vl on vl.id = lt.venta_id
    where m.programa_id = c.o_programa and m.paciente_id = p_referidor
  ), mv as (
    select * from mov where c.o_sucursal is null or suc = c.o_sucursal
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.creado_en desc, x.id desc), '[]'::jsonb)
  into v_movs
  from (select mv.id, mv.tipo, mv.monto, mv.vence_en, mv.motivo, mv.creado_en,
               (select btrim(pc.nombres || ' ' || pc.apellidos) from public.referidos rf join public.pacientes_clinicos pc on pc.id = rf.referido_paciente_id where rf.id = mv.referido_id) as referido
        from mv order by mv.creado_en desc, mv.id desc limit 50) x;

  v_movs := (select coalesce(jsonb_agg(e - 'id' order by ord), '[]'::jsonb) from jsonb_array_elements(v_movs) with ordinality as t(e, ord));

  with mov as (
    select m.tipo, m.monto, m.creado_en, vm.estado as venta_estado, coalesce(vm.sucursal_id, vl.sucursal_id) as suc
    from public.monedero_movimientos m
    left join public.ventas vm on vm.id = m.venta_id
    left join public.monedero_movimientos lt on lt.id = m.lote_id
    left join public.ventas vl on vl.id = lt.venta_id
    where m.programa_id = c.o_programa and m.paciente_id = p_referidor
      and m.creado_en >= c.o_ini and m.creado_en < c.o_fin
  ), mv as (
    select * from mov where c.o_sucursal is null or suc = c.o_sucursal
  ), refs as (
    select rf.estado, rf.aplicado_en, rf.pagado_en, rf.credito_a_otorgar, v.total as venta_total, coalesce(v.sucursal_id, ur.sucursal_id) as suc
    from public.referidos rf
    left join public.ventas v on v.id = rf.venta_id
    left join public.usuarios ur on ur.id = rf.registrado_por
    where rf.programa_id = c.o_programa and rf.referidor_paciente_id = p_referidor
  ), rs as (
    select * from refs where c.o_sucursal is null or suc = c.o_sucursal
  )
  select jsonb_build_object(
    'exitosos', (select count(*) from rs where estado = 'recompensado' and pagado_en >= c.o_ini and pagado_en < c.o_fin),
    'en_espera', (select count(*) from rs where estado = 'en_pago'),
    'ventas', (select coalesce(sum(venta_total), 0) from rs where aplicado_en >= c.o_ini and aplicado_en < c.o_fin and estado <> 'revertido'),
    'credito_ganado', (select coalesce(sum(monto), 0) from mv where tipo in ('credito', 'bono_hito', 'ajuste') and monto > 0),
    'credito_usado', (select coalesce(-sum(monto), 0) from mv where tipo = 'uso' and venta_estado is distinct from 'anulada'),
    'credito_vencido', (select coalesce(-sum(monto), 0) from mv where tipo = 'vencimiento'),
    'disponible', app_private.saldo_disponible_monedero(c.o_programa, p_referidor))
  into v_res;

  return jsonb_build_object('referidor', jsonb_build_object('paciente_id', p_referidor, 'nombre', v_nombre, 'codigo', v_codigo),
    'resumen', v_res, 'referidos', v_refs, 'movimientos', v_movs);
end $$;
revoke all on function public.panel_referidos_detalle(uuid, uuid, date, date, uuid) from public, anon;
grant execute on function public.panel_referidos_detalle(uuid, uuid, date, date, uuid) to authenticated;
