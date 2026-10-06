-- Mensajes automáticos para todo (Shuyana 2026-10-06):
-- 1) Controles: programados (3, 6, 12 meses) y ANIVERSARIO de la última revisión (incluye las importadas de Optox,
--    que no tenían próximo control) para mantener la relación con el paciente cada año.
-- 2) Cuentas por cobrar: cada paciente puede tener "Envío automático" según su frecuencia de cobro.

-- 1. Cobro automático por paciente
alter table public.pacientes_clinicos add column if not exists cobro_automatico boolean not null default false;
alter table public.mensajes_automaticos_config add column if not exists cobros boolean not null default true;
alter table public.mensajes_automaticos_envios drop constraint if exists mensajes_automaticos_envios_tipo_check;
alter table public.mensajes_automaticos_envios add constraint mensajes_automaticos_envios_tipo_check check (tipo in ('cumpleanos','control','cobro'));

create or replace function public.configurar_cobro_automatico(p_paciente uuid, p_activo boolean)
returns void language plpgsql security definer set search_path to 'public', 'app_private'
as $$
declare v_rol text;
begin
  select r.nombre into v_rol from public.usuarios u join public.roles r on r.id=u.rol_id
  where u.auth_user_id=(select auth.uid()) and u.activo and r.nombre in ('superadmin','admin_sucursal','vendedor','caja','optometra');
  if v_rol is null then raise exception 'No tienes permiso para cambiar el envío automático de cobros.'; end if;
  update public.pacientes_clinicos set cobro_automatico = coalesce(p_activo, false) where id = p_paciente;
end;
$$;
revoke all on function public.configurar_cobro_automatico(uuid, boolean) from public, anon;
grant execute on function public.configurar_cobro_automatico(uuid, boolean) to authenticated;

create or replace function public.configurar_mensajes_automaticos(p_empresa uuid, p_activo boolean, p_cumpleanos boolean, p_control boolean, p_cobros boolean default true)
returns void language plpgsql security definer set search_path to 'public', 'app_private'
as $$
declare v_user uuid;
begin
  select u.id into v_user from public.usuarios u join public.roles r on r.id=u.rol_id
  where u.auth_user_id=(select auth.uid()) and u.activo and r.nombre='superadmin';
  if v_user is null then raise exception 'Solo la superadministradora puede activar o pausar los mensajes automáticos.'; end if;
  insert into public.mensajes_automaticos_config (empresa_id, activo, cumpleanos, control_anual, cobros, actualizado_por, actualizado_en)
  values (p_empresa, p_activo, p_cumpleanos, p_control, p_cobros, v_user, now())
  on conflict (empresa_id) do update set activo=excluded.activo, cumpleanos=excluded.cumpleanos, control_anual=excluded.control_anual,
    cobros=excluded.cobros, actualizado_por=excluded.actualizado_por, actualizado_en=now();
end;
$$;
drop function if exists public.configurar_mensajes_automaticos(uuid, boolean, boolean, boolean);
revoke all on function public.configurar_mensajes_automaticos(uuid, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.configurar_mensajes_automaticos(uuid, boolean, boolean, boolean, boolean) to authenticated;

-- Cola de cobros de hoy de una sucursal, solo pacientes con envío automático (para el servidor; misma regla que cola_cobros_hoy).
create or replace function public.cola_cobros_automaticos_sistema(p_sucursal uuid)
returns table(paciente_id uuid, nombres text, telefono text, empresa_id uuid, saldo numeric, dias_deuda integer, cobro_insistente boolean, frecuencia text, apartado boolean, fecha_cobro_acordada date)
language sql stable security definer set search_path to 'public', 'app_private'
as $function$
  with hoy as (
    select d,
      date_trunc('month', d)::date mes,
      (d - (extract(isodow from d)::int - 1))::date lunes,
      case when d >= least((date_trunc('month', d) + interval '29 days')::date, (date_trunc('month', d) + interval '1 month - 1 day')::date)
             then least((date_trunc('month', d) + interval '29 days')::date, (date_trunc('month', d) + interval '1 month - 1 day')::date)
           when extract(day from d) >= 15 then (date_trunc('month', d) + interval '14 days')::date
           else least((date_trunc('month', d) - interval '1 month' + interval '29 days')::date, (date_trunc('month', d) - interval '1 day')::date) end quincena
    from (select (now() at time zone 'America/Guayaquil')::date d) x
  ), deudas as (
    select v.paciente_id, v.empresa_id, sum(v.saldo) saldo,
           ((select d from hoy) - min((v.creado_en at time zone 'America/Guayaquil')::date))::int dias,
           min((v.creado_en at time zone 'America/Guayaquil')::date) primera_venta,
           bool_or(coalesce(v.apartado, false)) apartado
    from public.ventas v
    where v.sucursal_id = p_sucursal and v.estado = 'completada' and v.saldo > 0.004 and v.paciente_id is not null
      and not exists (select 1 from public.acuerdos_pago a where a.venta_id = v.id)
    group by v.paciente_id, v.empresa_id
  ), base as (
    select d.*, p.nombres, p.telefono, p.cobro_insistente, p.fecha_cobro_acordada, p.categoria_cobro,
      case when p.cobro_insistente then 'diaria'
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('diaria', 'diarios') then 'diaria'
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('semanal', 'semanales') then 'semanal'
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('quincenal', 'quincenales') then 'quincenal'
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('mensual', 'mensuales') then 'mensual' end frec,
      (select max(m.enviado_en) from public.cobros_mensajes m where m.paciente_id = d.paciente_id and m.sucursal_id = p_sucursal) ultimo
    from deudas d join public.pacientes_clinicos p on p.id = d.paciente_id
    where p.cobro_automatico
  ), reglas as (
    select b.*,
      case b.frec when 'diaria' then h.d when 'semanal' then h.lunes when 'quincenal' then h.quincena when 'mensual' then h.mes end programada,
      case when b.frec = 'diaria' then 1 when b.frec = 'semanal' then 7 when b.frec = 'quincenal' then 15 when b.frec = 'mensual' then 30
           when b.categoria_cobro in ('convenio', 'rezagados') then null
           when b.dias > 8 then 15 end cada_dias
    from base b cross join hoy h
  )
  select r.paciente_id, r.nombres, r.telefono, r.empresa_id, r.saldo, r.dias, coalesce(r.cobro_insistente, false),
         case when r.cobro_insistente then null else r.frec end, r.apartado, r.fecha_cobro_acordada
  from reglas r
  where (
      r.fecha_cobro_acordada is not null and r.fecha_cobro_acordada <= (select d from hoy)
      and (r.ultimo is null or (r.ultimo at time zone 'America/Guayaquil')::date < r.fecha_cobro_acordada)
    ) or (
      (r.fecha_cobro_acordada is null or r.fecha_cobro_acordada <= (select d from hoy))
      and (
        (r.frec is not null and r.categoria_cobro is distinct from 'convenio' and r.categoria_cobro is distinct from 'rezagados'
          and r.primera_venta < r.programada
          and (r.ultimo is null or (r.ultimo at time zone 'America/Guayaquil')::date < r.programada))
        or
        (r.frec is null and r.cada_dias is not null
          and (r.ultimo is null or (r.ultimo at time zone 'America/Guayaquil')::date <= (select d from hoy) - r.cada_dias))
      )
    )
  order by r.saldo desc;
$function$;
revoke all on function public.cola_cobros_automaticos_sistema(uuid) from public, anon, authenticated;
grant execute on function public.cola_cobros_automaticos_sistema(uuid) to service_role;

-- 2. Controles: programados + aniversario de la última revisión
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
  ), base as (
    -- programado: "próximo control" (3, 6, 12 meses…) vencido hace 60 días o menos.
    -- aniversario: cada año en la fecha de la última revisión (hasta 6 años atrás), sobre todo las importadas de Optox.
    select u.*,
      case when u.proximo_control between v_hoy - 60 and v_hoy then 'programado'
           when (u.proximo_control is null or u.proximo_control < v_hoy - 60)
                and u.fecha <= v_hoy - 365 and u.fecha >= (v_hoy - interval '6 years')::date then 'aniversario' end tipo
    from ultimas u
    where u.pos = 1
      and exists (select 1 from public.consultas_optometricas c2 where c2.id=u.id and c2.sucursal_atencion_id=p_sucursal)
  ), con_fecha as (
    select b.*,
      case when b.tipo = 'programado' then b.proximo_control
           else (b.fecha + make_interval(years => extract(year from age(v_hoy, b.fecha))::int))::date end vence
    from base b where b.tipo is not null
  ), toca as (
    select cf.* from con_fecha cf where cf.tipo = 'programado' or cf.vence between v_hoy - 30 and v_hoy
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'paciente_id', p.id, 'nombre', p.nombre, 'nombres', p.nombres, 'telefono', p.telefono,
      'consulta_id', t.id, 'ultima_revision', t.fecha, 'vence', t.vence,
      'programado', t.tipo = 'programado',
      'tipo', t.tipo,
      'anios', extract(year from age(t.vence, t.fecha))::int,
      'meses', case when t.tipo = 'aniversario' then 12 else greatest(1, round(((t.vence - t.fecha)::numeric) / 30.4))::int end,
      'make_ya_envio', (v_empresa = '51820b6b-9fc1-495c-b2ea-ab50547e2ce3' and t.vence between date '2026-09-01' and date '2026-10-31'
                        and t.fecha between date '2025-09-01' and date '2025-10-31'),
      'enviado_en', (select max(cc.creado_en) from public.crm_contactos cc where cc.paciente_id=p.id and cc.empresa_id=v_empresa and cc.motivo='control' and cc.creado_en >= v_hoy),
      'enviado_auto', exists (select 1 from public.mensajes_automaticos_envios e where e.paciente_id=p.id and e.tipo='control' and e.estado='enviado' and e.creado_en >= v_hoy)
    ) order by t.vence, p.nombre), '[]'::jsonb)
  into v_control
  from toca t
  join (select pc.id, concat_ws(' ', pc.nombres, pc.apellidos) nombre, pc.nombres, pc.telefono from public.pacientes_clinicos pc) p on p.id = t.paciente_id
  where exists (select 1 from public.paciente_empresas pe where pe.paciente_id=p.id and pe.empresa_id=v_empresa)
    and not exists (select 1 from public.crm_contactos cc where cc.paciente_id=p.id and cc.empresa_id=v_empresa and cc.motivo='control'
          and cc.creado_en >= v_hoy - (case when t.tipo = 'aniversario' then 300 else 45 end) and cc.creado_en < v_hoy)
    and not exists (select 1 from public.citas_agenda a where a.paciente_id=p.id and a.estado='confirmada' and a.inicio >= now());

  return jsonb_build_object('empresa_id', v_empresa, 'hoy', v_hoy, 'cumpleanos', v_cumple, 'controles', v_control);
end;
$$;
revoke all on function app_private.mensajes_dia_core(uuid) from public, anon, authenticated;
