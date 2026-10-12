-- Permite a la superadministradora completar la clasificación original del egreso desde Informes.
create or replace function public.clasificar_egreso_informe(p_gasto uuid, p_clasificacion text)
returns void language plpgsql security definer set search_path = public as $$
declare v_rol text;
begin
  select r.nombre into v_rol from public.usuarios u join public.roles r on r.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo;
  if v_rol is distinct from 'superadmin' then raise exception 'No autorizado'; end if;
  if p_clasificacion not in ('salarios', 'pago_proveedor', 'gastos_mensuales', 'gastos_operacion', 'ajuste') then
    raise exception 'Clasificación no válida';
  end if;
  update public.gastos set clasificacion = p_clasificacion where id = p_gasto and clasificacion is null;
  if not found then raise exception 'El egreso ya tiene clasificación o no existe'; end if;
end;
$$;
revoke all on function public.clasificar_egreso_informe(uuid, text) from public, anon;
grant execute on function public.clasificar_egreso_informe(uuid, text) to authenticated;
