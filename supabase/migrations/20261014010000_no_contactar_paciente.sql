-- "No contactar" (Shuyana 2026-10-13): un paciente marcado así sale de TODAS las colas de contacto
-- (cobros de hoy, cobros automáticos, cumpleaños, controles, seguimiento de lentes entregados y CRM).
-- No se borra al paciente ni su historia: solo deja de aparecer para contactarlo.
alter table public.pacientes_clinicos
  add column if not exists no_contactar boolean not null default false,
  add column if not exists no_contactar_motivo text,
  add column if not exists no_contactar_en timestamptz,
  add column if not exists no_contactar_por uuid references public.usuarios(id);

create or replace function public.marcar_no_contactar(p_paciente uuid, p_valor boolean, p_motivo text default null)
returns void language plpgsql security definer set search_path to 'public', 'app_private'
as $$
declare v_user uuid; v_rol text; v_empresa uuid;
begin
  select u.id, r.nombre, u.empresa_id into v_user, v_rol, v_empresa
  from public.usuarios u join public.roles r on r.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and r.nombre in ('superadmin', 'admin_sucursal', 'optometra', 'vendedor', 'caja');
  if v_user is null then raise exception 'No tienes permiso para esta acción.'; end if;
  if not exists (select 1 from public.pacientes_clinicos where id = p_paciente) then raise exception 'Paciente no encontrado.'; end if;
  if p_valor = false and v_rol not in ('superadmin', 'admin_sucursal') then
    raise exception 'Solo administración puede volver a permitir el contacto.';
  end if;
  update public.pacientes_clinicos
  set no_contactar = p_valor,
      no_contactar_motivo = case when p_valor then nullif(trim(p_motivo), '') else null end,
      no_contactar_en = case when p_valor then now() else null end,
      no_contactar_por = case when p_valor then v_user else null end
  where id = p_paciente;
end;
$$;
revoke all on function public.marcar_no_contactar(uuid, boolean, text) from public, anon;
grant execute on function public.marcar_no_contactar(uuid, boolean, text) to authenticated;

-- Cambia un fragmento de una función existente (tolerante a espacios y saltos de línea). Falla si no lo encuentra una sola vez.
create or replace function pg_temp.parchar(p_firma regprocedure, p_buscar text, p_nuevo text) returns void language plpgsql as $f$
declare v_def text; v_patron text;
begin
  v_def := pg_get_functiondef(p_firma);
  v_patron := regexp_replace(regexp_replace(p_buscar, '([.\\+*?\[^\]$(){}=!<>|:\-])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  if regexp_count(v_def, v_patron) <> 1 then
    raise exception 'Fragmento no encontrado una sola vez en %: %', p_firma, p_buscar;
  end if;
  execute regexp_replace(v_def, v_patron, p_nuevo);
end;
$f$;

select pg_temp.parchar('app_private.mensajes_dia_core(uuid)'::regprocedure,
  'where exists (select 1 from public.paciente_empresas pe where pe.paciente_id=p.id and pe.empresa_id=v_empresa) ), de_sucursal',
  'where not coalesce(p.no_contactar, false) and exists (select 1 from public.paciente_empresas pe where pe.paciente_id=p.id and pe.empresa_id=v_empresa) ), de_sucursal');
select pg_temp.parchar('app_private.mensajes_dia_core(uuid)'::regprocedure,
  'from public.pacientes_clinicos pc) p',
  'from public.pacientes_clinicos pc where not coalesce(pc.no_contactar, false)) p');
select pg_temp.parchar('public.seguimiento_entregas(uuid)'::regprocedure,
  'join public.pacientes_clinicos p on p.id=e.paciente_id',
  'join public.pacientes_clinicos p on p.id=e.paciente_id and not coalesce(p.no_contactar, false)');
select pg_temp.parchar('public.cola_cobros_hoy(uuid)'::regprocedure,
  'join public.pacientes_clinicos p on p.id = d.paciente_id where exists (select 1 from permiso)',
  'join public.pacientes_clinicos p on p.id = d.paciente_id where exists (select 1 from permiso) and not coalesce(p.no_contactar, false)');
select pg_temp.parchar('public.cola_cobros_automaticos_sistema(uuid)'::regprocedure,
  'join public.pacientes_clinicos p on p.id = d.paciente_id where p.cobro_automatico',
  'join public.pacientes_clinicos p on p.id = d.paciente_id where p.cobro_automatico and not coalesce(p.no_contactar, false)');
select pg_temp.parchar('public.crm_bandeja(uuid, uuid)'::regprocedure,
  'from public.pacientes_clinicos p where exists(select 1 from public.paciente_empresas',
  'from public.pacientes_clinicos p where not coalesce(p.no_contactar, false) and exists(select 1 from public.paciente_empresas');
