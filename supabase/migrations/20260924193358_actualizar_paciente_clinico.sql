create table public.pacientes_cambios (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes_clinicos(id),
  cambiado_por uuid references public.usuarios(id),
  cambiado_en timestamptz not null default now(),
  antes jsonb not null,
  despues jsonb not null
);
create index pacientes_cambios_paciente_idx on public.pacientes_cambios(paciente_id);
alter table public.pacientes_cambios enable row level security;
revoke all on public.pacientes_cambios from public, anon, authenticated;
grant select on public.pacientes_cambios to authenticated;

create policy pacientes_cambios_lectura on public.pacientes_cambios
for select to authenticated using (
  public.es_superadmin()
  or exists (
    select 1 from public.usuarios u join public.roles r on r.id = u.rol_id
    join public.paciente_empresas pe on pe.empresa_id = u.empresa_id
    where u.auth_user_id = (select auth.uid()) and u.activo
      and r.nombre = 'admin_sucursal' and pe.paciente_id = pacientes_cambios.paciente_id
  )
);

create or replace function public.actualizar_paciente_clinico(
  p_paciente_id uuid, p_nombres text, p_apellidos text, p_cedula text default null,
  p_telefono text default null, p_email text default null, p_fecha_nacimiento date default null,
  p_sexo text default null, p_ocupacion text default null, p_responsable_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $function$
declare
  v_user uuid; v_empresa uuid; v_rol text; v_cedula text;
  v_antes jsonb; v_despues jsonb; v_constraint text;
begin
  select u.id, u.empresa_id, r.nombre into v_user, v_empresa, v_rol
  from public.usuarios u join public.roles r on r.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo
    and r.nombre in ('superadmin', 'admin_sucursal', 'optometra', 'vendedor', 'caja');
  if v_user is null then raise exception 'No tienes permiso para editar pacientes.'; end if;
  if v_rol <> 'superadmin' and not exists (
    select 1 from public.paciente_empresas where paciente_id = p_paciente_id and empresa_id = v_empresa
  ) then raise exception 'Solo puedes editar pacientes vinculados a tu empresa.'; end if;

  select to_jsonb(p) into v_antes from public.pacientes_clinicos p where p.id = p_paciente_id for update;
  if v_antes is null then raise exception 'El paciente indicado no existe.'; end if;
  if nullif(trim(p_nombres), '') is null or nullif(trim(p_apellidos), '') is null then
    raise exception 'Ingresa nombres y apellidos.';
  end if;
  v_cedula := nullif(trim(p_cedula), '');
  if exists (select 1 from public.pacientes_clinicos where cedula = v_cedula and id <> p_paciente_id) then
    raise exception 'Esa cédula ya pertenece a otro paciente.';
  end if;
  if p_responsable_id = p_paciente_id then raise exception 'El paciente no puede ser su propio responsable.'; end if;
  if p_responsable_id is not null and not exists (select 1 from public.pacientes_clinicos where id = p_responsable_id) then
    raise exception 'El responsable de la cuenta indicado no existe.';
  end if;

  update public.pacientes_clinicos p set
    nombres = trim(p_nombres), apellidos = trim(p_apellidos), cedula = v_cedula,
    telefono = nullif(trim(p_telefono), ''), email = nullif(trim(p_email), ''),
    fecha_nacimiento = p_fecha_nacimiento, sexo = nullif(trim(p_sexo), ''),
    ocupacion = nullif(trim(p_ocupacion), ''), responsable_id = p_responsable_id, actualizado_en = now()
  where p.id = p_paciente_id returning to_jsonb(p) into v_despues;
  insert into public.pacientes_cambios(paciente_id, cambiado_por, antes, despues)
  values (p_paciente_id, v_user, v_antes, v_despues);
  return jsonb_build_object('paciente_id', p_paciente_id);
exception when unique_violation then
  get stacked diagnostics v_constraint = CONSTRAINT_NAME;
  if v_constraint = 'pacientes_clinicos_cedula_unique' then
    raise exception 'Esa cédula ya pertenece a otro paciente.';
  end if;
  raise;
end;
$function$;

revoke all on function public.actualizar_paciente_clinico(uuid, text, text, text, text, text, date, text, text, uuid) from public, anon;
grant execute on function public.actualizar_paciente_clinico(uuid, text, text, text, text, text, date, text, text, uuid) to authenticated;
