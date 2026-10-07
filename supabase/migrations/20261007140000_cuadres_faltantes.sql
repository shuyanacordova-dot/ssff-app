-- Aviso "Falta el cuadre del día X" (Shuyana 2026-10-07): días anteriores a hoy (últimos 30) con movimientos
-- de caja (cobros o egresos) en la sucursal y sin cierre guardado. Empieza desde la primera apertura o cierre.
create or replace function public.cuadres_faltantes(p_sucursal uuid)
returns date[] language plpgsql stable security definer set search_path to 'public', 'app_private'
as $$
declare v_empresa uuid; v_hoy date := (now() at time zone 'America/Guayaquil')::date; v_inicio date; v_res date[];
begin
  select empresa_id into v_empresa from public.sucursales where id = p_sucursal;
  if not exists (select 1 from public.usuarios u join public.roles r on r.id = u.rol_id
                 where u.auth_user_id = (select auth.uid()) and u.activo and (r.nombre = 'superadmin' or u.empresa_id = v_empresa)) then
    return '{}';
  end if;
  select least((select min(fecha) from public.aperturas_caja where sucursal_id = p_sucursal),
               (select min(fecha) from public.cierres_caja where sucursal_id = p_sucursal)) into v_inicio;
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
revoke all on function public.cuadres_faltantes(uuid) from public, anon;
grant execute on function public.cuadres_faltantes(uuid) to authenticated;
