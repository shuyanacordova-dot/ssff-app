-- Mensajes del día (Shuyana 2026-10-06): reemplaza los escenarios de Make (Cumpleaños y Control anual).
-- Listas por sucursal: cumpleaños de hoy y controles que tocan. Interruptor de envío automático por empresa
-- (WhatsApp Cloud API desde LumOS); sin token de Meta, el equipo envía con un toque (wa.me).

create table if not exists public.mensajes_automaticos_config (
  empresa_id uuid primary key references public.empresas(id),
  activo boolean not null default false,
  cumpleanos boolean not null default true,
  control_anual boolean not null default true,
  whatsapp_phone_id text,
  max_controles_dia integer not null default 30,
  actualizado_por uuid references public.usuarios(id),
  actualizado_en timestamptz not null default now()
);
alter table public.mensajes_automaticos_config enable row level security;
drop policy if exists mensajes_config_select on public.mensajes_automaticos_config;
create policy mensajes_config_select on public.mensajes_automaticos_config for select to authenticated
  using (exists (select 1 from public.usuarios u join public.roles r on r.id=u.rol_id
    where u.auth_user_id=(select auth.uid()) and u.activo and (r.nombre='superadmin' or u.empresa_id=mensajes_automaticos_config.empresa_id)));

insert into public.mensajes_automaticos_config (empresa_id, whatsapp_phone_id)
values ('51820b6b-9fc1-495c-b2ea-ab50547e2ce3', '105516612184219'), ('be1dc246-219a-40a2-9e92-707e5845d295', null)
on conflict (empresa_id) do nothing;

create table if not exists public.mensajes_automaticos_envios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  sucursal_id uuid references public.sucursales(id),
  paciente_id uuid not null references public.pacientes_clinicos(id),
  tipo text not null check (tipo in ('cumpleanos','control')),
  telefono text,
  estado text not null check (estado in ('enviado','error')),
  error text,
  wa_message_id text,
  creado_en timestamptz not null default now()
);
create index if not exists mensajes_envios_paciente_idx on public.mensajes_automaticos_envios (paciente_id, tipo, creado_en desc);
alter table public.mensajes_automaticos_envios enable row level security;
drop policy if exists mensajes_envios_select on public.mensajes_automaticos_envios;
create policy mensajes_envios_select on public.mensajes_automaticos_envios for select to authenticated
  using (exists (select 1 from public.usuarios u join public.roles r on r.id=u.rol_id
    where u.auth_user_id=(select auth.uid()) and u.activo and (r.nombre='superadmin' or u.empresa_id=mensajes_automaticos_envios.empresa_id)));

-- Núcleo: candidatos del día para una sucursal (sin chequeo de usuario; solo se llama desde las funciones de abajo).
create or replace function app_private.mensajes_dia_core(p_sucursal uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'public', 'app_private' set "TimeZone" to 'America/Guayaquil'
as $$
declare v_empresa uuid; v_hoy date := (now() at time zone 'America/Guayaquil')::date; v_cumple jsonb; v_control jsonb;
begin
  select empresa_id into v_empresa from public.sucursales where id=p_sucursal;
  if v_empresa is null then raise exception 'Sucursal no encontrada.'; end if;

  with pacientes as (
    select p.id, concat_ws(' ', p.nombres, p.apellidos) nombre, p.nombres, p.telefono, p.fecha_nacimiento
    from public.pacientes_clinicos p
    where exists (select 1 from public.paciente_empresas pe where pe.paciente_id=p.id and pe.empresa_id=v_empresa)
  ), de_sucursal as (
    select p.* from pacientes p
    where exists (select 1 from public.consultas_optometricas c where c.paciente_id=p.id and c.sucursal_atencion_id=p_sucursal)
       or exists (select 1 from public.ventas v where v.paciente_id=p.id and v.sucursal_id=p_sucursal and v.estado='completada')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'paciente_id', p.id, 'nombre', p.nombre, 'nombres', p.nombres, 'telefono', p.telefono,
      'fecha_nacimiento', p.fecha_nacimiento,
      'edad', extract(year from age(v_hoy, p.fecha_nacimiento))::int,
      'enviado_en', (select max(cc.creado_en) from public.crm_contactos cc where cc.paciente_id=p.id and cc.empresa_id=v_empresa and cc.motivo='cumpleanos' and cc.creado_en >= v_hoy - 30),
      'enviado_auto', exists (select 1 from public.mensajes_automaticos_envios e where e.paciente_id=p.id and e.tipo='cumpleanos' and e.estado='enviado' and e.creado_en >= v_hoy - 30)
    ) order by p.nombre), '[]'::jsonb)
  into v_cumple
  from de_sucursal p
  where p.fecha_nacimiento is not null
    and (to_char(p.fecha_nacimiento,'MM-DD') = to_char(v_hoy,'MM-DD')
      or (to_char(p.fecha_nacimiento,'MM-DD')='02-29' and to_char(v_hoy,'MM-DD')='02-28'
          and extract(day from (date_trunc('year', v_hoy) + interval '2 months' - interval '1 day'))::int = 28));

  with ultimas as (
    select c.id, c.paciente_id, c.proximo_control, (c.fecha_consulta at time zone 'America/Guayaquil')::date fecha,
      row_number() over (partition by c.paciente_id order by c.fecha_consulta desc, c.id desc) pos
    from public.consultas_optometricas c
    where c.empresa_atencion_id = v_empresa
  ), toca as (
    select u.*, coalesce(u.proximo_control, (u.fecha + interval '12 months')::date) vence
    from ultimas u
    where u.pos = 1
      and exists (select 1 from public.consultas_optometricas c2 where c2.id=u.id and c2.sucursal_atencion_id=p_sucursal)
      and coalesce(u.proximo_control, (u.fecha + interval '12 months')::date) between v_hoy - 60 and v_hoy
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'paciente_id', p.id, 'nombre', p.nombre, 'nombres', p.nombres, 'telefono', p.telefono,
      'consulta_id', t.id, 'ultima_revision', t.fecha, 'vence', t.vence,
      'programado', t.proximo_control is not null,
      -- Make (escenario "control anual por meses") ya envió el 1-sep y el 1-oct a los controles de sep y oct (solo Shuvisión).
      'make_ya_envio', (v_empresa = '51820b6b-9fc1-495c-b2ea-ab50547e2ce3' and t.vence between date '2026-09-01' and date '2026-10-31'),
      'enviado_en', (select max(cc.creado_en) from public.crm_contactos cc where cc.paciente_id=p.id and cc.empresa_id=v_empresa and cc.motivo='control' and cc.creado_en >= v_hoy),
      'enviado_auto', exists (select 1 from public.mensajes_automaticos_envios e where e.paciente_id=p.id and e.tipo='control' and e.estado='enviado' and e.creado_en >= v_hoy)
    ) order by t.vence, p.nombre), '[]'::jsonb)
  into v_control
  from toca t
  join (select pc.id, concat_ws(' ', pc.nombres, pc.apellidos) nombre, pc.nombres, pc.telefono from public.pacientes_clinicos pc) p on p.id = t.paciente_id
  where exists (select 1 from public.paciente_empresas pe where pe.paciente_id=p.id and pe.empresa_id=v_empresa)
    and not exists (select 1 from public.crm_contactos cc where cc.paciente_id=p.id and cc.empresa_id=v_empresa and cc.motivo='control'
          and cc.creado_en >= v_hoy - 120 and cc.creado_en < v_hoy)
    and not exists (select 1 from public.citas_agenda a where a.paciente_id=p.id and a.estado='confirmada' and a.inicio >= now());

  return jsonb_build_object('empresa_id', v_empresa, 'hoy', v_hoy, 'cumpleanos', v_cumple, 'controles', v_control);
end;
$$;
revoke all on function app_private.mensajes_dia_core(uuid) from public, anon, authenticated;

-- Para la pantalla (usuario con sesión, solo su empresa).
create or replace function public.mensajes_del_dia(p_sucursal uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'app_private'
as $$
declare v_rol text; v_empresa uuid; v_suc_empresa uuid;
begin
  select r.nombre, u.empresa_id into v_rol, v_empresa from public.usuarios u join public.roles r on r.id=u.rol_id
  where u.auth_user_id=(select auth.uid()) and u.activo and r.nombre in ('superadmin','admin_sucursal','optometra','vendedor','caja');
  select empresa_id into v_suc_empresa from public.sucursales where id=p_sucursal;
  if v_rol is null or v_suc_empresa is null or (v_rol <> 'superadmin' and v_suc_empresa is distinct from v_empresa) then
    raise exception 'No tienes permiso para ver los mensajes de esta sucursal.';
  end if;
  return app_private.mensajes_dia_core(p_sucursal);
end;
$$;
revoke all on function public.mensajes_del_dia(uuid) from public, anon;
grant execute on function public.mensajes_del_dia(uuid) to authenticated;

-- Para el envío automático (solo el servidor con la llave de servicio).
create or replace function public.mensajes_del_dia_sistema(p_sucursal uuid)
returns jsonb language sql stable security definer set search_path to 'public', 'app_private'
as $$ select app_private.mensajes_dia_core(p_sucursal) $$;
revoke all on function public.mensajes_del_dia_sistema(uuid) from public, anon, authenticated;
grant execute on function public.mensajes_del_dia_sistema(uuid) to service_role;

-- Interruptor (solo superadministradora).
create or replace function public.configurar_mensajes_automaticos(p_empresa uuid, p_activo boolean, p_cumpleanos boolean, p_control boolean)
returns void language plpgsql security definer set search_path to 'public', 'app_private'
as $$
declare v_user uuid;
begin
  select u.id into v_user from public.usuarios u join public.roles r on r.id=u.rol_id
  where u.auth_user_id=(select auth.uid()) and u.activo and r.nombre='superadmin';
  if v_user is null then raise exception 'Solo la superadministradora puede activar o pausar los mensajes automáticos.'; end if;
  insert into public.mensajes_automaticos_config (empresa_id, activo, cumpleanos, control_anual, actualizado_por, actualizado_en)
  values (p_empresa, p_activo, p_cumpleanos, p_control, v_user, now())
  on conflict (empresa_id) do update set activo=excluded.activo, cumpleanos=excluded.cumpleanos, control_anual=excluded.control_anual,
    actualizado_por=excluded.actualizado_por, actualizado_en=now();
end;
$$;
revoke all on function public.configurar_mensajes_automaticos(uuid, boolean, boolean, boolean) from public, anon;
grant execute on function public.configurar_mensajes_automaticos(uuid, boolean, boolean, boolean) to authenticated;
