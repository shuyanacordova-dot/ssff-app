-- Controles por aniversario: solo revisiones de máximo 2 años atrás (Shuyana 2026-10-07; antes 6 años).
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
    -- aniversario: cada año en la fecha de la última revisión (máximo 2 años atrás), sobre todo las importadas de Optox.
    select u.*,
      case when u.proximo_control between v_hoy - 60 and v_hoy then 'programado'
           when (u.proximo_control is null or u.proximo_control < v_hoy - 60)
                and u.fecha <= v_hoy - 365 and u.fecha >= (v_hoy - interval '2 years')::date then 'aniversario' end tipo
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
