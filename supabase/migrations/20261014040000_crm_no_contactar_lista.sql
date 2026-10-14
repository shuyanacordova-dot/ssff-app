-- Lista de pacientes marcados "No contactar" de una empresa (pestaña del CRM), para revisarlos y, si administración
-- lo decide, volver a permitir el contacto.
create or replace function public.crm_no_contactar(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'app_private'
as $$
declare v_user uuid; v_empresa uuid; v_rol text; v_res jsonb;
begin
  select u.id, u.empresa_id, r.nombre into v_user, v_empresa, v_rol
  from public.usuarios u join public.roles r on r.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and r.nombre in ('superadmin', 'admin_sucursal', 'optometra', 'vendedor');
  if v_user is null or p_empresa is null or (v_rol <> 'superadmin' and p_empresa is distinct from v_empresa) then
    raise exception 'No tienes permiso para consultar el CRM de esta empresa.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'paciente_id', p.id, 'nombre', concat_ws(' ', p.nombres, p.apellidos), 'telefono', p.telefono,
      'motivo', p.no_contactar_motivo, 'desde', p.no_contactar_en,
      'marcado_por', (select u2.nombre from public.usuarios u2 where u2.id = p.no_contactar_por)
    ) order by p.no_contactar_en desc nulls last), '[]'::jsonb) into v_res
  from public.pacientes_clinicos p
  where p.no_contactar and exists (select 1 from public.paciente_empresas pe where pe.paciente_id = p.id and pe.empresa_id = p_empresa);
  return v_res;
end;
$$;
revoke all on function public.crm_no_contactar(uuid) from public, anon;
grant execute on function public.crm_no_contactar(uuid) to authenticated;
