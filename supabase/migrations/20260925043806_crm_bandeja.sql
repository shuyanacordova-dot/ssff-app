-- CRM v1. Solo preparar para revisión; no envía mensajes.
alter table public.consultas_optometricas add column if not exists proximo_control date;

create table public.crm_contactos (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes_clinicos(id),
  empresa_id uuid not null references public.empresas(id),
  sucursal_id uuid references public.sucursales(id),
  motivo text not null check (motivo in ('control','examen_sin_compra','lentes_listos','postventa','cumpleanos','inactivo','otro')),
  canal text not null check (canal in ('whatsapp','llamada','presencial')),
  resultado text not null check (resultado in ('enviado','respondio','agendo','no_contesta','no_interesado','compro')),
  nota text,
  proximo_seguimiento date,
  referencia_id uuid,
  created_by uuid not null references public.usuarios(id),
  creado_en timestamptz not null default now()
);
create index crm_contactos_seguimiento_idx on public.crm_contactos(empresa_id,paciente_id,motivo,creado_en desc);
alter table public.crm_contactos enable row level security;
revoke all on public.crm_contactos from public, anon, authenticated;
grant select on public.crm_contactos to authenticated;
create policy crm_contactos_lectura on public.crm_contactos for select to authenticated using (
  exists (select 1 from public.usuarios u join public.roles r on r.id=u.rol_id
    where u.auth_user_id=(select auth.uid()) and u.activo
    and r.nombre in ('superadmin','admin_sucursal','optometra','vendedor')
    and (r.nombre='superadmin' or u.empresa_id=crm_contactos.empresa_id))
);

create or replace function public.registrar_contacto_crm(
  p_paciente uuid, p_empresa uuid, p_sucursal uuid, p_motivo text, p_canal text,
  p_resultado text, p_nota text default null, p_proximo date default null, p_referencia uuid default null
) returns uuid language plpgsql security definer set search_path to 'public', 'app_private'
as $function$
declare v_user uuid; v_empresa uuid; v_rol text; v_id uuid;
begin
  select u.id,u.empresa_id,r.nombre into v_user,v_empresa,v_rol
  from public.usuarios u join public.roles r on r.id=u.rol_id
  where u.auth_user_id=(select auth.uid()) and u.activo
    and r.nombre in ('superadmin','admin_sucursal','optometra','vendedor');
  if v_user is null or p_empresa is null or (v_rol <> 'superadmin' and p_empresa is distinct from v_empresa) then
    raise exception 'No tienes permiso para registrar contactos de esta empresa.';
  end if;
  if not exists (select 1 from public.paciente_empresas where paciente_id=p_paciente and empresa_id=p_empresa) then
    raise exception 'El paciente no está vinculado a esta empresa.';
  end if;
  if p_sucursal is not null and not exists (select 1 from public.sucursales where id=p_sucursal and empresa_id=p_empresa) then
    raise exception 'La sucursal no pertenece a esta empresa.';
  end if;
  if p_referencia is not null and not (
    (p_motivo in ('control','examen_sin_compra') and exists (
      select 1 from public.consultas_optometricas c where c.id=p_referencia and c.paciente_id=p_paciente
      and c.empresa_atencion_id=p_empresa and (p_sucursal is null or c.sucursal_atencion_id=p_sucursal)))
    or (p_motivo in ('lentes_listos','postventa') and exists (
      select 1 from public.ordenes_laboratorio o join public.ventas v on v.id=o.venta_id
      where o.id=p_referencia and v.paciente_id=p_paciente and v.empresa_id=p_empresa
      and (p_sucursal is null or v.sucursal_id=p_sucursal)))
  ) then raise exception 'La referencia no corresponde al paciente, motivo o sucursal.'; end if;
  if length(coalesce(p_nota,'')) > 2000 then raise exception 'La nota admite hasta 2000 caracteres.'; end if;
  insert into public.crm_contactos(paciente_id,empresa_id,sucursal_id,motivo,canal,resultado,nota,proximo_seguimiento,referencia_id,created_by)
  values(p_paciente,p_empresa,p_sucursal,p_motivo,p_canal,p_resultado,nullif(trim(p_nota),''),p_proximo,p_referencia,v_user)
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.crm_bandeja(p_empresa uuid,p_sucursal uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'app_private'
-- Also gives date-only legacy values a deterministic interpretation when cast.
set timezone to 'America/Guayaquil'
as $function$
declare v_user uuid; v_empresa uuid; v_rol text; v_hoy date := (now() at time zone 'America/Guayaquil')::date; v_result jsonb;
begin
  select u.id,u.empresa_id,r.nombre into v_user,v_empresa,v_rol
  from public.usuarios u join public.roles r on r.id=u.rol_id
  where u.auth_user_id=(select auth.uid()) and u.activo
    and r.nombre in ('superadmin','admin_sucursal','optometra','vendedor');
  if v_user is null or p_empresa is null or (v_rol <> 'superadmin' and p_empresa is distinct from v_empresa) then
    raise exception 'No tienes permiso para consultar el CRM de esta empresa.';
  end if;
  if p_sucursal is not null and not exists (select 1 from public.sucursales where id=p_sucursal and empresa_id=p_empresa) then
    raise exception 'La sucursal no pertenece a esta empresa.';
  end if;
  with pacientes as (
    select p.id,concat_ws(' ',p.nombres,p.apellidos) nombre,p.telefono,p.fecha_nacimiento
    from public.pacientes_clinicos p
    where exists(select 1 from public.paciente_empresas pe where pe.paciente_id=p.id and pe.empresa_id=p_empresa)
  ), consultas as (
    select c.id,c.paciente_id,c.sucursal_atencion_id,c.proximo_control,
      (c.fecha_consulta::timestamptz at time zone 'America/Guayaquil')::date fecha,
      row_number() over(partition by c.paciente_id order by c.fecha_consulta desc,c.id desc) posicion
    from public.consultas_optometricas c join pacientes p on p.id=c.paciente_id
    where c.empresa_atencion_id=p_empresa
  ), ventas_empresa as (
    select v.id,v.paciente_id,v.sucursal_id,(v.creado_en at time zone 'America/Guayaquil')::date fecha
    from public.ventas v join pacientes p on p.id=v.paciente_id
    where v.empresa_id=p_empresa and v.estado='completada'
  ), candidatos as (
    select 'control'::text motivo,c.paciente_id,
      case when c.proximo_control is null then 'Control anual recomendado' when c.proximo_control < v_hoy then 'Control vencido' else 'Próximo control' end detalle,
      coalesce(c.proximo_control,(c.fecha+interval '12 months')::date) fecha_referencia,c.id referencia_id,c.sucursal_atencion_id sucursal_id
    from consultas c where c.posicion=1 and (p_sucursal is null or c.sucursal_atencion_id=p_sucursal)
      and (c.proximo_control <= v_hoy+7 or (c.proximo_control is null and c.fecha between (v_hoy-interval '24 months')::date and (v_hoy-interval '12 months')::date))
      and not exists(select 1 from public.citas_agenda a where a.paciente_id=c.paciente_id
        and a.empresa_atencion_id=p_empresa and a.inicio >= now() and a.estado in ('programada','confirmada'))
    union all
    select 'examen_sin_compra',c.paciente_id,'Examen sin compra',c.fecha,c.id,c.sucursal_atencion_id
    from consultas c where c.posicion=1 and c.fecha between v_hoy-45 and v_hoy-7
      and (p_sucursal is null or c.sucursal_atencion_id=p_sucursal)
      and not exists(select 1 from ventas_empresa v where v.paciente_id=c.paciente_id and v.fecha>=c.fecha)
    union all
    select case when o.estado='entregado' then 'postventa' else 'lentes_listos' end,v.paciente_id,
      case when o.estado='entregado' then 'Lentes entregados' else 'Lentes listos para retirar' end,
      (o.actualizado_en at time zone 'America/Guayaquil')::date,o.id,v.sucursal_id
    from public.ordenes_laboratorio o join ventas_empresa v on v.id=o.venta_id
    where (p_sucursal is null or v.sucursal_id=p_sucursal) and (
      (o.estado in ('recibido','notificado') and (o.actualizado_en at time zone 'America/Guayaquil')::date < v_hoy-5)
      or (o.estado='entregado' and (o.actualizado_en at time zone 'America/Guayaquil')::date between v_hoy-15 and v_hoy-5))
    union all
    -- Compare calendar month/day over actual upcoming days (year rollover and leap days included).
    select 'cumpleanos',p.id,'Cumpleaños',v_hoy+g.d,null::uuid,p_sucursal
    from pacientes p cross join generate_series(0,7) g(d)
    where to_char(p.fecha_nacimiento,'MM-DD')=to_char(v_hoy+g.d,'MM-DD')
      and (p_sucursal is null or exists(select 1 from consultas c where c.paciente_id=p.id and c.sucursal_atencion_id=p_sucursal)
        or exists(select 1 from ventas_empresa v where v.paciente_id=p.id and v.sucursal_id=p_sucursal))
    union all
    -- Both histories must exist; a missing history is not evidence of inactivity.
    select 'inactivo',p.id,'Última visita o compra',greatest(c.fecha,v.fecha),null::uuid,p_sucursal
    from pacientes p
    join lateral(select max(fecha) fecha from consultas where paciente_id=p.id) c on c.fecha < (v_hoy-interval '18 months')::date
    join lateral(select max(fecha) fecha from ventas_empresa where paciente_id=p.id) v on v.fecha < (v_hoy-interval '18 months')::date
    where p_sucursal is null or exists(select 1 from consultas c2 where c2.paciente_id=p.id and c2.sucursal_atencion_id=p_sucursal)
      or exists(select 1 from ventas_empresa v2 where v2.paciente_id=p.id and v2.sucursal_id=p_sucursal)
  ), elegibles as (
    select c.*,p.nombre,p.telefono,
      (select max(cc.creado_en) from public.crm_contactos cc where cc.empresa_id=p_empresa and cc.paciente_id=c.paciente_id and cc.motivo=c.motivo) ultimo_contacto,
      row_number() over(partition by c.motivo order by case when c.motivo='inactivo' then - (c.fecha_referencia-v_hoy) else c.fecha_referencia-v_hoy end,c.paciente_id,c.referencia_id) posicion
    from candidatos c join pacientes p on p.id=c.paciente_id
    where not exists(select 1 from public.crm_contactos cc where cc.empresa_id=p_empresa and cc.paciente_id=c.paciente_id and cc.motivo=c.motivo
      and (cc.creado_en>=now()-interval '14 days' or cc.proximo_seguimiento>v_hoy))
  ) select coalesce(jsonb_agg(to_jsonb(e)-'posicion' order by e.motivo,e.posicion),'[]'::jsonb) into v_result
    from elegibles e where posicion<=100;
  return v_result;
end;
$function$;

-- Resolve authors inside the same company boundary, including inactive staff.
create or replace function public.crm_historial(p_paciente uuid)
returns jsonb language sql stable security definer set search_path to 'public', 'app_private'
as $function$
  select coalesce(jsonb_agg(to_jsonb(h) order by h.creado_en desc),'[]'::jsonb) from (
    select c.id,c.creado_en,c.motivo,c.canal,c.resultado,c.nota,c.proximo_seguimiento,u.nombre autor
    from public.crm_contactos c join public.usuarios u on u.id=c.created_by
    where c.paciente_id=p_paciente and exists (
      select 1 from public.usuarios me join public.roles r on r.id=me.rol_id
      where me.auth_user_id=(select auth.uid()) and me.activo
        and r.nombre in ('superadmin','admin_sucursal','optometra','vendedor')
        and (r.nombre='superadmin' or me.empresa_id=c.empresa_id))
    order by c.creado_en desc limit 200
  ) h;
$function$;

revoke all on function public.crm_bandeja(uuid,uuid) from public, anon;
grant execute on function public.crm_bandeja(uuid,uuid) to authenticated;
revoke all on function public.registrar_contacto_crm(uuid,uuid,uuid,text,text,text,text,date,uuid) from public, anon;
grant execute on function public.registrar_contacto_crm(uuid,uuid,uuid,text,text,text,text,date,uuid) to authenticated;
revoke all on function public.crm_historial(uuid) from public, anon;
grant execute on function public.crm_historial(uuid) to authenticated;
