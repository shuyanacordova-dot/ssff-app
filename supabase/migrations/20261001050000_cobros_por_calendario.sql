-- "Cobros de hoy" por CALENDARIO (Shuyana 2026-10-01), en vez de "cada N días desde el último mensaje":
--   diaria (y cobro insistente) → todos los días
--   semanal   → los lunes
--   quincenal → los días 15 y 30 (en febrero, el último día del mes)
--   mensual   → el día 1 de cada mes
-- Si ese día no se le escribió, sigue apareciendo los días siguientes hasta que se le escriba (no se pierde).
-- Solo cuenta si la deuda ya existía antes de esa fecha (no se cobra el mismo día de la venta).
-- Sin frecuencia: igual que antes (con más de 8 días de deuda, cada 15 días). Convenios y rezagados no salen.
-- La fecha de cobro acordada sigue teniendo prioridad.

create or replace function public.cola_cobros_hoy(p_sucursal uuid)
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
  ), hoy as (
    select d,
      date_trunc('month', d)::date mes,
      (d - (extract(isodow from d)::int - 1))::date lunes,
      -- Quincena más reciente que ya llegó: 30 (o fin de mes) de este mes, 15 de este mes, o 30 (o fin) del mes anterior.
      case when d >= least((date_trunc('month', d) + interval '29 days')::date, (date_trunc('month', d) + interval '1 month - 1 day')::date)
             then least((date_trunc('month', d) + interval '29 days')::date, (date_trunc('month', d) + interval '1 month - 1 day')::date)
           when extract(day from d) >= 15 then (date_trunc('month', d) + interval '14 days')::date
           else least((date_trunc('month', d) - interval '1 month' + interval '29 days')::date, (date_trunc('month', d) - interval '1 day')::date) end quincena
    from (select (now() at time zone 'America/Guayaquil')::date d) x
  ), deudas as (
    select v.paciente_id, v.empresa_id, sum(v.saldo) saldo, count(*)::int ventas,
           ((select d from hoy) - min((v.creado_en at time zone 'America/Guayaquil')::date))::int dias,
           min((v.creado_en at time zone 'America/Guayaquil')::date) primera_venta,
           bool_or(coalesce(v.apartado, false)) apartado, min(v.apartado_hasta) filter (where v.apartado) apartado_hasta
    from public.ventas v
    where v.sucursal_id = p_sucursal and v.estado = 'completada' and v.saldo > 0.004 and v.paciente_id is not null
      and not exists (select 1 from public.acuerdos_pago a where a.venta_id = v.id)
    group by v.paciente_id, v.empresa_id
  ), base as (
    select d.*, p.nombres, p.apellidos, p.telefono, p.cobro_insistente, p.fecha_cobro_acordada, p.categoria_cobro,
      case when p.cobro_insistente then 'diaria'
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('diaria', 'diarios') then 'diaria'
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('semanal', 'semanales') then 'semanal'
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('quincenal', 'quincenales') then 'quincenal'
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('mensual', 'mensuales') then 'mensual' end frec,
      (select max(m.enviado_en) from public.cobros_mensajes m where m.paciente_id = d.paciente_id and m.sucursal_id = p_sucursal) ultimo
    from deudas d join public.pacientes_clinicos p on p.id = d.paciente_id
    where exists (select 1 from permiso)
  ), reglas as (
    select b.*,
      -- Fecha de cobro programada más reciente según la frecuencia.
      case b.frec when 'diaria' then h.d when 'semanal' then h.lunes when 'quincenal' then h.quincena when 'mensual' then h.mes end programada,
      case when b.frec = 'diaria' then 1 when b.frec = 'semanal' then 7 when b.frec = 'quincenal' then 15 when b.frec = 'mensual' then 30
           when b.categoria_cobro in ('convenio', 'rezagados') then null
           when b.dias > 8 then 15 end cada_dias,
      case when b.cobro_insistente then 'Cobro insistente (todos los días)'
           when b.apartado and b.frec is null then 'Apartado'
           when b.frec = 'diaria' then 'Cobro diario'
           when b.frec = 'semanal' then 'Cobro semanal (lunes)'
           when b.frec = 'quincenal' then 'Cobro quincenal (15 y 30)'
           when b.frec = 'mensual' then 'Cobro mensual (día 1)'
           else 'Saldo pendiente (cada 15 días)' end motivo
    from base b cross join hoy h
  )
  select r.paciente_id, r.nombres, r.apellidos, r.telefono, r.empresa_id, e.nombre, r.saldo, r.ventas, r.dias,
         case when r.fecha_cobro_acordada is not null and r.fecha_cobro_acordada <= (select d from hoy)
                   and (r.ultimo is null or (r.ultimo at time zone 'America/Guayaquil')::date < r.fecha_cobro_acordada)
              then 'Fecha de cobro acordada (' || to_char(r.fecha_cobro_acordada, 'DD/MM') || ')' else r.motivo end,
         r.cada_dias, r.ultimo, coalesce(r.cobro_insistente, false),
         case when r.cobro_insistente then null else r.frec end,
         r.apartado, r.apartado_hasta, r.fecha_cobro_acordada
  from reglas r join public.empresas e on e.id = r.empresa_id
  where (
      -- Fecha acordada: ese día (o después, si aún no se le escribió desde esa fecha) sale siempre.
      r.fecha_cobro_acordada is not null and r.fecha_cobro_acordada <= (select d from hoy)
      and (r.ultimo is null or (r.ultimo at time zone 'America/Guayaquil')::date < r.fecha_cobro_acordada)
    ) or (
      (r.fecha_cobro_acordada is null or r.fecha_cobro_acordada <= (select d from hoy))
      and (
        -- Con frecuencia: el día programado (y los siguientes) si la deuda ya existía y no se le escribió desde entonces.
        (r.frec is not null and r.categoria_cobro is distinct from 'convenio' and r.categoria_cobro is distinct from 'rezagados'
          and r.primera_venta < r.programada
          and (r.ultimo is null or (r.ultimo at time zone 'America/Guayaquil')::date < r.programada))
        or
        -- Sin frecuencia: como antes, cada 15 días.
        (r.frec is null and r.cada_dias is not null
          and (r.ultimo is null or (r.ultimo at time zone 'America/Guayaquil')::date <= (select d from hoy) - r.cada_dias))
      )
    )
  order by (r.frec = 'diaria') desc, r.saldo desc;
$$;
