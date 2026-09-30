-- Editar las observaciones generales del paciente (mismos permisos y auditoría que actualizar_paciente_clinico).
create or replace function public.actualizar_observaciones_paciente(p_paciente_id uuid, p_observaciones text)
returns void language plpgsql security definer set search_path to 'public', 'app_private'
as $$
declare v_user uuid; v_empresa uuid; v_rol text; v_antes jsonb; v_despues jsonb;
begin
  select u.id, u.empresa_id, r.nombre into v_user, v_empresa, v_rol
  from public.usuarios u join public.roles r on r.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo
    and r.nombre in ('superadmin', 'admin_sucursal', 'optometra', 'vendedor', 'caja');
  if v_user is null then raise exception 'No tienes permiso para editar pacientes.'; end if;
  if v_rol <> 'superadmin' and not exists (
    select 1 from public.paciente_empresas where paciente_id = p_paciente_id and empresa_id = v_empresa
  ) then raise exception 'Solo puedes editar pacientes vinculados a tu empresa.'; end if;
  if char_length(coalesce(p_observaciones, '')) > 2000 then raise exception 'Las observaciones son muy largas (máximo 2000 caracteres).'; end if;

  select to_jsonb(p) into v_antes from public.pacientes_clinicos p where p.id = p_paciente_id for update;
  if v_antes is null then raise exception 'El paciente indicado no existe.'; end if;
  update public.pacientes_clinicos p set observaciones = nullif(trim(p_observaciones), ''), actualizado_en = now()
  where p.id = p_paciente_id returning to_jsonb(p) into v_despues;
  insert into public.pacientes_cambios(paciente_id, cambiado_por, antes, despues) values (p_paciente_id, v_user, v_antes, v_despues);
end;
$$;
revoke all on function public.actualizar_observaciones_paciente(uuid, text) from public, anon;
grant execute on function public.actualizar_observaciones_paciente(uuid, text) to authenticated;
