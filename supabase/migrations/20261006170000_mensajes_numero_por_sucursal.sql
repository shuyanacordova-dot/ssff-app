-- Cada sucursal envía desde su propio WhatsApp (Shuyana 2026-10-06): Shuvision, Shuvision Sacha y Focus.
-- phone_id = identificador del número en la API oficial de WhatsApp (Meta). Solo Shuvision está conectado hoy.
create table if not exists public.mensajes_numeros_sucursal (
  sucursal_id uuid primary key references public.sucursales(id),
  whatsapp_phone_id text,
  numero text,
  actualizado_en timestamptz not null default now()
);
alter table public.mensajes_numeros_sucursal enable row level security;
drop policy if exists mensajes_numeros_select on public.mensajes_numeros_sucursal;
create policy mensajes_numeros_select on public.mensajes_numeros_sucursal for select to authenticated using (true);
insert into public.mensajes_numeros_sucursal (sucursal_id, whatsapp_phone_id, numero) values
  ('3bd2a17c-b4e0-4137-a5f3-66475dbcb836', '105516612184219', '+593 97 940 8384'),
  ('1db17433-cc24-409f-92d2-794a01ce79d4', null, null),
  ('e2775b83-2105-46a7-8c40-d8de6b3a63dd', null, null)
on conflict (sucursal_id) do nothing;

-- Controles de todos los plazos (3, 6 y 12 meses): se agrega 'meses' a cada control.
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
      -- Plazo del control en meses (3, 6, 12…): los de menos de 10 meses no usan la plantilla anual.
      'meses', greatest(1, round(((t.vence - t.fecha)::numeric) / 30.4))::int,
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
          and cc.creado_en >= v_hoy - 45 and cc.creado_en < v_hoy)
    and not exists (select 1 from public.citas_agenda a where a.paciente_id=p.id and a.estado='confirmada' and a.inicio >= now());

  return jsonb_build_object('empresa_id', v_empresa, 'hoy', v_hoy, 'cumpleanos', v_cumple, 'controles', v_control);
end;
$$;
revoke all on function app_private.mensajes_dia_core(uuid) from public, anon, authenticated;
