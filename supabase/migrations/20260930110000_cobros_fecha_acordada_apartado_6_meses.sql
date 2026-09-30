-- Pedidos de Shuyana 2026-09-30:
-- 1) Apartado con vigencia de 6 meses (180 días) en lugar de 90. Los apartados vigentes (no anulados) con el plazo
--    automático de 90 días pasan a 180 desde su venta.
-- 2) Fecha de cobro acordada por paciente (CxC): antes de esa fecha no sale en "Cobros de hoy"; ese día sale aunque
--    no le toque por frecuencia.
-- 3) "Cobros de hoy" devuelve además: apartado (y su fecha límite), cobro insistente, frecuencia y fecha acordada,
--    para que cada mensaje use el tono correcto.

create or replace function public.marcar_apartado_venta(p_venta uuid, p_activo boolean)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_user uuid; v_role text; v_empresa uuid; v_estado text; v_saldo numeric; v_fecha date;
begin
  select empresa_id, estado, saldo, (creado_en at time zone 'America/Guayaquil')::date
    into v_empresa, v_estado, v_saldo, v_fecha from public.ventas where id = p_venta;
  if v_empresa is null then raise exception 'Venta no encontrada.'; end if;
  select u.id, ro.nombre into v_user, v_role
  from public.usuarios u join public.roles ro on ro.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and (ro.nombre = 'superadmin' or u.empresa_id = v_empresa);
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('ventas', 'crear')) then
    raise exception 'No autorizado';
  end if;
  if v_estado <> 'completada' then raise exception 'Solo ventas completadas pueden ser apartados.'; end if;
  if p_activo and v_saldo <= 0 then raise exception 'La venta ya está pagada; no puede quedar como apartado.'; end if;
  update public.ventas
     set apartado = p_activo,
         apartado_hasta = case when p_activo then v_fecha + 180 else null end,
         actualizado_en = now()
   where id = p_venta;
end;
$$;

update public.ventas set apartado_hasta = (creado_en at time zone 'America/Guayaquil')::date + 180
where apartado and estado <> 'anulada' and apartado_hasta = (creado_en at time zone 'America/Guayaquil')::date + 90;

alter table public.pacientes_clinicos add column if not exists fecha_cobro_acordada date;

create or replace function public.fijar_fecha_cobro(p_paciente uuid, p_fecha date)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_user uuid; v_empresa uuid; v_rol text;
begin
  select u.id, u.empresa_id, r.nombre into v_user, v_empresa, v_rol from public.usuarios u join public.roles r on r.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and r.nombre in ('superadmin', 'admin_sucursal', 'vendedor', 'caja', 'optometra');
  if v_user is null then raise exception 'No tienes permiso para fijar fechas de cobro.'; end if;
  if v_rol <> 'superadmin' and not exists (select 1 from public.paciente_empresas where paciente_id = p_paciente and empresa_id = v_empresa) then
    raise exception 'El paciente no está vinculado a tu empresa.';
  end if;
  update public.pacientes_clinicos set fecha_cobro_acordada = p_fecha where id = p_paciente;
end;
$$;
revoke all on function public.fijar_fecha_cobro(uuid, date) from public, anon;
grant execute on function public.fijar_fecha_cobro(uuid, date) to authenticated;

drop function if exists public.cola_cobros_hoy(uuid);
create function public.cola_cobros_hoy(p_sucursal uuid)
returns table(paciente_id uuid, nombres text, apellidos text, telefono text, empresa_id uuid, empresa_nombre text, saldo numeric, ventas integer,
  dias_deuda integer, motivo text, cada_dias integer, ultimo_mensaje timestamptz,
  cobro_insistente boolean, frecuencia text, apartado boolean, apartado_hasta date, fecha_cobro_acordada date)
language sql stable security definer set search_path to 'public', 'app_private'
as $$
  with permiso as (
    select 1 from public.usuarios u join public.roles r on r.id = u.rol_id
    where u.auth_user_id = (select auth.uid()) and u.activo
      and r.nombre in ('superadmin', 'admin_sucursal', 'vendedor', 'caja', 'optometra')
      and (select app_private.sucursales_usuario()) @> array[p_sucursal]
  ), hoy as (select (now() at time zone 'America/Guayaquil')::date d),
  deudas as (
    select v.paciente_id, v.empresa_id, sum(v.saldo) saldo, count(*)::int ventas,
           ((select d from hoy) - min((v.creado_en at time zone 'America/Guayaquil')::date))::int dias,
           bool_or(coalesce(v.apartado, false)) apartado, min(v.apartado_hasta) filter (where v.apartado) apartado_hasta
    from public.ventas v
    where v.sucursal_id = p_sucursal and v.estado = 'completada' and v.saldo > 0.004 and v.paciente_id is not null
      and not exists (select 1 from public.acuerdos_pago a where a.venta_id = v.id)
    group by v.paciente_id, v.empresa_id
  ), reglas as (
    select d.*, p.nombres, p.apellidos, p.telefono, p.cobro_insistente, p.fecha_cobro_acordada,
      case when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('semanal', 'semanales') then 'semanal'
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('quincenal', 'quincenales') then 'quincenal'
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('mensual', 'mensuales') then 'mensual' end frecuencia,
      case when p.cobro_insistente then 1
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('semanal', 'semanales') then 7
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('quincenal', 'quincenales') then 15
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('mensual', 'mensuales') then 30
           when p.categoria_cobro in ('convenio', 'rezagados') then null
           when d.dias > 8 then 15 end cada_dias,
      case when p.cobro_insistente then 'Cobro insistente (todos los días)'
           when d.apartado then 'Apartado'
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('semanal', 'semanales') then 'Cobro semanal'
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('quincenal', 'quincenales') then 'Cobro quincenal'
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('mensual', 'mensuales') then 'Cobro mensual'
           else 'Saldo pendiente (cada 15 días)' end motivo,
      (select max(m.enviado_en) from public.cobros_mensajes m where m.paciente_id = d.paciente_id and m.sucursal_id = p_sucursal) ultimo
    from deudas d join public.pacientes_clinicos p on p.id = d.paciente_id
    where exists (select 1 from permiso)
  )
  select r.paciente_id, r.nombres, r.apellidos, r.telefono, r.empresa_id, e.nombre, r.saldo, r.ventas, r.dias,
         case when r.fecha_cobro_acordada is not null and r.fecha_cobro_acordada <= (select d from hoy)
                   and (r.ultimo is null or (r.ultimo at time zone 'America/Guayaquil')::date < r.fecha_cobro_acordada)
              then 'Fecha de cobro acordada (' || to_char(r.fecha_cobro_acordada, 'DD/MM') || ')' else r.motivo end,
         r.cada_dias, r.ultimo, coalesce(r.cobro_insistente, false), r.frecuencia, r.apartado, r.apartado_hasta, r.fecha_cobro_acordada
  from reglas r join public.empresas e on e.id = r.empresa_id
  where (
      -- Fecha acordada: ese día (o después, si aún no se le escribió desde esa fecha) sale siempre.
      r.fecha_cobro_acordada is not null and r.fecha_cobro_acordada <= (select d from hoy)
      and (r.ultimo is null or (r.ultimo at time zone 'America/Guayaquil')::date < r.fecha_cobro_acordada)
    ) or (
      -- Sin fecha acordada futura: la frecuencia de siempre.
      r.cada_dias is not null
      and (r.fecha_cobro_acordada is null or r.fecha_cobro_acordada <= (select d from hoy))
      and (r.ultimo is null or (r.ultimo at time zone 'America/Guayaquil')::date <= (select d from hoy) - r.cada_dias)
    )
  order by (r.cada_dias = 1) desc, r.saldo desc;
$$;
revoke all on function public.cola_cobros_hoy(uuid) from public, anon;
grant execute on function public.cola_cobros_hoy(uuid) to authenticated;
