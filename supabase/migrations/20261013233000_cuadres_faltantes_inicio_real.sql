-- "Falta el cuadre" no debe contar días anteriores al arranque real de una sucursal.
-- Sacha tenía solo el cierre migrado de Optox (22-sep, "punto de partida, no es un cierre diario real")
-- y por eso se avisaba de días que nunca se cuadraron en LumOS. Si la sucursal aún no tiene ningún
-- cierre real, el inicio es su primera apertura de caja. Con cierres reales no cambia nada.
create or replace function public.cuadres_faltantes(p_sucursal uuid)
returns date[] language plpgsql stable security definer set search_path to 'public', 'app_private'
as $$
declare v_empresa uuid; v_hoy date := (now() at time zone 'America/Guayaquil')::date; v_inicio date; v_res date[]; v_cierre_real date;
begin
  select empresa_id into v_empresa from public.sucursales where id = p_sucursal;
  if not exists (select 1 from public.usuarios u join public.roles r on r.id = u.rol_id
                 where u.auth_user_id = (select auth.uid()) and u.activo and (r.nombre = 'superadmin' or u.empresa_id = v_empresa)) then
    return '{}';
  end if;
  select min(fecha) into v_cierre_real from public.cierres_caja
  where sucursal_id = p_sucursal and coalesce(observaciones, '') not ilike '%migrado%';
  if v_cierre_real is null then
    select min(fecha) into v_inicio from public.aperturas_caja where sucursal_id = p_sucursal;
  else
    select least((select min(fecha) from public.aperturas_caja where sucursal_id = p_sucursal),
                 (select min(fecha) from public.cierres_caja where sucursal_id = p_sucursal)) into v_inicio;
  end if;
  if v_inicio is null then return '{}'; end if;
  v_inicio := greatest(v_inicio, v_hoy - 30, date '2026-09-25'); -- arranque real de LumOS
  with dias as (
    select (p.creado_en at time zone 'America/Guayaquil')::date d
    from public.pagos_venta p join public.ventas v on v.id = p.venta_id
    where v.sucursal_id = p_sucursal and p.metodo <> 'saldo_favor'
      and (p.creado_en at time zone 'America/Guayaquil')::date between v_inicio and v_hoy - 1
    union
    select g.fecha from public.gastos g where g.sucursal_id = p_sucursal and g.origen = 'caja' and g.fecha between v_inicio and v_hoy - 1
  )
  select coalesce(array_agg(d order by d), '{}') into v_res from dias
  where not exists (select 1 from public.cierres_caja c where c.sucursal_id = p_sucursal and c.fecha = dias.d);
  return v_res;
end;
$$;
