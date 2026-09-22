
-- La firma anterior usaba RETURNS TABLE(paciente_id uuid, ...), lo que crea
-- un parámetro OUT llamado paciente_id que colisiona con la columna real
-- paciente_id dentro del cuerpo de la función ("column reference
-- paciente_id is ambiguous"). Se cambia a RETURNS jsonb para evitar el choque.
drop function if exists public.registrar_paciente_clinico(text, text, text, text, text, text, date, text);

create or replace function public.registrar_paciente_clinico(
  p_nombres text, p_apellidos text, p_cedula text default null, p_telefono text default null,
  p_email text default null, p_direccion text default null, p_fecha_nacimiento date default null, p_sexo text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $function$
declare v_user uuid; v_empresa uuid; v_sucursal uuid; v_paciente uuid; v_existente uuid; v_cedula text;
begin
  select u.id, u.empresa_id, u.sucursal_id into v_user, v_empresa, v_sucursal
  from public.usuarios u join public.roles r on r.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and r.nombre in ('superadmin', 'admin_sucursal', 'optometra');
  if v_user is null then raise exception 'No tienes permiso clínico para registrar pacientes.'; end if;
  if p_nombres is null or trim(p_nombres) = '' or p_apellidos is null or trim(p_apellidos) = '' then
    raise exception 'Ingresa nombres y apellidos.';
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

  insert into public.pacientes_clinicos(nombres, apellidos, cedula, telefono, email, direccion, fecha_nacimiento, sexo, empresa_origen_id, created_by)
  values (trim(p_nombres), trim(p_apellidos), v_cedula, nullif(trim(p_telefono), ''), nullif(trim(p_email), ''), nullif(trim(p_direccion), ''), p_fecha_nacimiento, nullif(trim(p_sexo), ''), v_empresa, v_user)
  returning id into v_paciente;

  insert into public.paciente_empresas(paciente_id, empresa_id, primera_sucursal_id, created_by)
  values (v_paciente, v_empresa, v_sucursal, v_user);

  return jsonb_build_object('paciente_id', v_paciente, 'ya_existia', false);
end;
$function$;

revoke all on function public.registrar_paciente_clinico(text, text, text, text, text, text, date, text) from public;
revoke all on function public.registrar_paciente_clinico(text, text, text, text, text, text, date, text) from anon;
grant execute on function public.registrar_paciente_clinico(text, text, text, text, text, text, date, text) to authenticated;
;
