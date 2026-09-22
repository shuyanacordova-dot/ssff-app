
-- Evita historias duplicadas: dos empresas no deben crear dos pacientes
-- distintos para la misma cédula; deben compartir una sola ficha.
create unique index if not exists pacientes_clinicos_cedula_unique on public.pacientes_clinicos (cedula) where cedula is not null;

-- Alta segura: crea el paciente y su vínculo con la empresa en una sola
-- transacción. Si ya existe un paciente con esa cédula (por ejemplo,
-- atendido antes en la otra empresa), no se duplica: se vincula la
-- ficha existente a la empresa que lo atiende ahora.
create or replace function public.registrar_paciente_clinico(
  p_nombres text, p_apellidos text, p_cedula text default null, p_telefono text default null,
  p_email text default null, p_direccion text default null, p_fecha_nacimiento date default null, p_sexo text default null
)
returns table(paciente_id uuid, ya_existia boolean)
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
    return query select v_existente, true;
    return;
  end if;

  insert into public.pacientes_clinicos(nombres, apellidos, cedula, telefono, email, direccion, fecha_nacimiento, sexo, empresa_origen_id, created_by)
  values (trim(p_nombres), trim(p_apellidos), v_cedula, nullif(trim(p_telefono), ''), nullif(trim(p_email), ''), nullif(trim(p_direccion), ''), p_fecha_nacimiento, nullif(trim(p_sexo), ''), v_empresa, v_user)
  returning id into v_paciente;

  insert into public.paciente_empresas(paciente_id, empresa_id, primera_sucursal_id, created_by)
  values (v_paciente, v_empresa, v_sucursal, v_user);

  return query select v_paciente, false;
end;
$function$;

revoke all on function public.registrar_paciente_clinico(text, text, text, text, text, text, date, text) from public;
revoke all on function public.registrar_paciente_clinico(text, text, text, text, text, text, date, text) from anon;
grant execute on function public.registrar_paciente_clinico(text, text, text, text, text, text, date, text) to authenticated;

-- historia_fotos estaba a medio construir: paciente_id/historia_id eran
-- texto libre sin relación real a las tablas clínicas. Se corrige el
-- tipo y se agregan las relaciones, y se añade tipo/descripción para
-- distinguir fotos de documentos.
alter table public.historia_fotos
  alter column paciente_id type uuid using paciente_id::uuid,
  alter column historia_id drop not null;
alter table public.historia_fotos rename column historia_id to consulta_id;
alter table public.historia_fotos alter column consulta_id type uuid using nullif(consulta_id, '')::uuid;
alter table public.historia_fotos
  add constraint historia_fotos_paciente_id_fkey foreign key (paciente_id) references public.pacientes_clinicos(id) on delete cascade,
  add constraint historia_fotos_consulta_id_fkey foreign key (consulta_id) references public.consultas_optometricas(id) on delete set null,
  add column if not exists tipo text not null default 'foto' check (tipo in ('foto', 'documento')),
  add column if not exists descripcion text;

-- Las políticas de historia_fotos usaban el sistema de permisos por rol,
-- que no incluye a superadmin (a diferencia del resto del módulo
-- clínico, que usa es_usuario_clinico()). Se alinea con el resto.
drop policy if exists "personal clinico sube fotos" on public.historia_fotos;
drop policy if exists "personal clinico lee fotos compartidas" on public.historia_fotos;
drop policy if exists "personal clinico actualiza fotos" on public.historia_fotos;

create policy clinica_crear on public.historia_fotos for insert
  with check (app_private.es_usuario_clinico() and subido_por = app_private.usuario_clinico_actual_id());
create policy clinica_lectura on public.historia_fotos for select
  using (app_private.es_usuario_clinico());
create policy clinica_actualizar on public.historia_fotos for update
  using (app_private.es_usuario_clinico()) with check (app_private.es_usuario_clinico());

-- El bucket de Storage 'historias' existía pero sin políticas: nadie
-- podía subir ni leer archivos. Se habilita solo para personal clínico.
create policy clinica_sube_fotos on storage.objects for insert to authenticated
  with check (bucket_id = 'historias' and app_private.es_usuario_clinico());
create policy clinica_lee_fotos on storage.objects for select to authenticated
  using (bucket_id = 'historias' and app_private.es_usuario_clinico());
;
