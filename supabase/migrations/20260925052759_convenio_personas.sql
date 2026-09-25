-- Personas de las empresas con convenio (clientes potenciales aunque todavía no sean pacientes).
alter table public.empresas_convenio add column if not exists mensaje_invitacion text;

create table if not exists public.convenio_personas (
  id uuid primary key default gen_random_uuid(),
  empresa_convenio_id uuid not null references public.empresas_convenio(id),
  nombres text not null,
  apellidos text,
  cedula text,
  telefono text,
  email text,
  cargo text,
  sucursal_id uuid references public.sucursales(id),
  estado text not null default 'nuevo' check (estado in ('nuevo', 'contactado', 'interesado', 'agendo', 'cliente', 'no_interesado')),
  paciente_id uuid references public.pacientes_clinicos(id),
  notas text,
  ultimo_contacto timestamptz,
  created_by uuid references public.usuarios(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create unique index if not exists convenio_personas_cedula_uidx on public.convenio_personas (empresa_convenio_id, cedula) where cedula is not null;
create index if not exists convenio_personas_empresa_idx on public.convenio_personas (empresa_convenio_id, estado);

-- Enlaza con el paciente existente cuando la cédula coincide.
create or replace function app_private.enlazar_convenio_persona() returns trigger
language plpgsql security definer set search_path to 'public', 'app_private'
as $function$
begin
  new.cedula := nullif(regexp_replace(coalesce(new.cedula, ''), '\D', '', 'g'), '');
  if new.cedula is not null and new.paciente_id is null then
    select id into new.paciente_id from public.pacientes_clinicos where cedula = new.cedula limit 1;
  end if;
  if new.paciente_id is not null and new.estado in ('nuevo', 'contactado', 'interesado', 'agendo')
     and exists (select 1 from public.ventas v where v.paciente_id = new.paciente_id and v.estado = 'completada') then
    new.estado := 'cliente';
  end if;
  new.actualizado_en := now();
  return new;
end;
$function$;
drop trigger if exists convenio_personas_enlazar on public.convenio_personas;
create trigger convenio_personas_enlazar before insert or update on public.convenio_personas
  for each row execute function app_private.enlazar_convenio_persona();

alter table public.convenio_personas enable row level security;
revoke all on public.convenio_personas from public, anon, authenticated;
grant select, insert, update on public.convenio_personas to authenticated;
create policy convenio_personas_equipo on public.convenio_personas for all to authenticated
  using ((select app_private.usuario_agenda_actual_id()) is not null)
  with check ((select app_private.usuario_agenda_actual_id()) is not null);
