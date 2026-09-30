-- Protección de datos (LOPDP Ecuador) — pedido de Shuyana 2026-09-30. Los datos de salud son datos sensibles:
-- 1) Consentimiento del paciente para tratar sus datos de salud (con versión del texto, cómo se dio y quién lo registró).
--    Solo se agregan registros (nunca se editan ni borran); si el paciente revoca, se registra un nuevo registro "revocado".
-- 2) Registro de quién abre cada carpeta / historia clínica (además del registro de cambios que ya existe).
-- El texto del consentimiento y del aviso de privacidad debe revisarlo un abogado antes de darlo por definitivo.

create table if not exists public.consentimientos_paciente (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes_clinicos(id),
  empresa_id uuid not null references public.empresas(id),
  version text not null,
  estado text not null check (estado in ('otorgado', 'revocado')),
  metodo text not null check (metodo in ('firma_papel', 'aceptado_en_pantalla', 'verbal_con_testigo')),
  firmado_por text,             -- nombre de quien firma (el paciente o su representante si es menor de edad)
  es_representante boolean not null default false,
  notas text,
  registrado_por uuid not null references public.usuarios(id),
  registrado_en timestamptz not null default now()
);
create index if not exists consentimientos_paciente_idx on public.consentimientos_paciente (paciente_id, registrado_en desc);
alter table public.consentimientos_paciente enable row level security;
revoke all on public.consentimientos_paciente from public, anon, authenticated;
grant select on public.consentimientos_paciente to authenticated;
drop policy if exists consentimientos_leer on public.consentimientos_paciente;
create policy consentimientos_leer on public.consentimientos_paciente for select to authenticated
using ((select public.es_superadmin()) or exists (
  select 1 from public.paciente_empresas pe join public.usuarios u on u.empresa_id = pe.empresa_id
  where pe.paciente_id = consentimientos_paciente.paciente_id and u.auth_user_id = (select auth.uid()) and u.activo));

create or replace function public.registrar_consentimiento(p_paciente uuid, p_version text, p_estado text, p_metodo text,
  p_firmado_por text default null, p_es_representante boolean default false, p_notas text default null)
returns uuid language plpgsql security definer set search_path to 'public', 'app_private'
as $$
declare v_user uuid; v_empresa uuid; v_rol text; v_id uuid;
begin
  select u.id, u.empresa_id, r.nombre into v_user, v_empresa, v_rol from public.usuarios u join public.roles r on r.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and r.nombre in ('superadmin', 'admin_sucursal', 'optometra', 'vendedor', 'caja');
  if v_user is null then raise exception 'No tienes permiso para registrar consentimientos.'; end if;
  if v_rol <> 'superadmin' and not exists (select 1 from public.paciente_empresas where paciente_id = p_paciente and empresa_id = v_empresa) then
    raise exception 'El paciente no está vinculado a tu empresa.';
  end if;
  if coalesce(trim(p_version), '') = '' then raise exception 'Falta la versión del texto de consentimiento.'; end if;
  insert into public.consentimientos_paciente (paciente_id, empresa_id, version, estado, metodo, firmado_por, es_representante, notas, registrado_por)
  values (p_paciente, coalesce((select empresa_id from public.paciente_empresas where paciente_id = p_paciente and empresa_id = v_empresa limit 1), v_empresa),
          trim(p_version), p_estado, p_metodo, nullif(trim(p_firmado_por), ''), coalesce(p_es_representante, false), nullif(trim(p_notas), ''), v_user)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.registrar_consentimiento(uuid, text, text, text, text, boolean, text) from public, anon;
grant execute on function public.registrar_consentimiento(uuid, text, text, text, text, boolean, text) to authenticated;

create table if not exists public.accesos_historia (
  id bigint generated always as identity primary key,
  paciente_id uuid not null references public.pacientes_clinicos(id),
  usuario_id uuid not null references public.usuarios(id),
  accion text not null default 'abrir_carpeta',
  creado_en timestamptz not null default now()
);
create index if not exists accesos_historia_paciente_idx on public.accesos_historia (paciente_id, creado_en desc);
alter table public.accesos_historia enable row level security;
revoke all on public.accesos_historia from public, anon, authenticated;
grant select on public.accesos_historia to authenticated;
drop policy if exists accesos_historia_leer on public.accesos_historia;
create policy accesos_historia_leer on public.accesos_historia for select to authenticated using ((select public.es_superadmin()));

-- Registra que la persona actual abrió la carpeta (como máximo una vez cada 10 minutos por paciente).
create or replace function public.registrar_acceso_historia(p_paciente uuid, p_accion text default 'abrir_carpeta')
returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_user uuid;
begin
  select id into v_user from public.usuarios where auth_user_id = (select auth.uid()) and activo limit 1;
  if v_user is null then return; end if;
  if exists (select 1 from public.accesos_historia where paciente_id = p_paciente and usuario_id = v_user and accion = p_accion and creado_en > now() - interval '10 minutes') then return; end if;
  insert into public.accesos_historia (paciente_id, usuario_id, accion) values (p_paciente, v_user, coalesce(p_accion, 'abrir_carpeta'));
end;
$$;
revoke all on function public.registrar_acceso_historia(uuid, text) from public, anon;
grant execute on function public.registrar_acceso_historia(uuid, text) to authenticated;
