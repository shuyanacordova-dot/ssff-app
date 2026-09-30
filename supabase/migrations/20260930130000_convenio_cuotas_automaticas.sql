-- Cuotas automáticas en convenios (Shuyana 2026-09-30): "las cuotas son 6 meses; que el sistema calcule la cuota solo".
-- 1) Cada empresa de convenio tiene un número de cuotas predeterminado (6). Se usa para sugerir las cuotas al generar
--    la autorización y para calcular la cuota del mes de quienes AÚN NO tienen acuerdo firmado (antes salía el saldo
--    completo, p. ej. Benítez Coello $230, Rojas Agila $300).
--    Sin acuerdo: financiado = total − abonos del día de la venta; cuota = financiado / cuotas; empieza el mes
--    siguiente a la venta; la última cuota cobra lo que quede.
-- 2) Acuerdos ya firmados cuyo titular es otra persona: el texto guardado no nombraba al paciente beneficiario;
--    se agrega "correspondiente a la compra de …" (Gudiño y Pasmiño). No cambia cuotas ni fechas.

alter table public.empresas_convenio add column if not exists cuotas_predeterminadas integer not null default 6;
alter table public.empresas_convenio drop constraint if exists empresas_convenio_cuotas_predeterminadas_check;
alter table public.empresas_convenio add constraint empresas_convenio_cuotas_predeterminadas_check check (cuotas_predeterminadas between 1 and 36);

update public.acuerdos_pago a
set texto = replace(a.texto, '1. Acepto el presupuesto detallado en esta solicitud por un total',
      format('1. Acepto el presupuesto detallado en esta solicitud, correspondiente a la compra de %s%s, por un total',
             trim(p.nombres || ' ' || coalesce(p.apellidos, '')), coalesce(' (C.I. ' || p.cedula || ')', '')))
from public.ventas v join public.pacientes_clinicos p on p.id = v.paciente_id
where v.id = a.venta_id and a.titular_paciente_id is not null and a.titular_paciente_id <> p.id
  and a.texto like '1. Acepto el presupuesto detallado en esta solicitud por un total%';

create or replace function public.informe_convenio_mensual(p_convenio uuid, p_optica uuid, p_mes date)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'app_private'
as $function$
declare v_mes date := date_trunc('month', coalesce(p_mes, (now() at time zone 'America/Guayaquil')::date))::date;
        v_filas jsonb; v_convenio record; v_optica record;
begin
  if not (public.es_superadmin()
    or exists (select 1 from public.usuarios u join public.roles r on r.id = u.rol_id
               where u.auth_user_id = (select auth.uid()) and u.activo and r.nombre = 'admin_sucursal' and u.empresa_id = p_optica)
    or (public.tiene_permiso('informes_convenio', 'leer')
        and exists (select 1 from public.usuarios u where u.auth_user_id = (select auth.uid()) and u.activo and u.empresa_id = p_optica))) then
    raise exception 'Solo la administración puede generar el informe del convenio.';
  end if;
  select id, nombre, cuotas_predeterminadas into v_convenio from public.empresas_convenio where id = p_convenio;
  if v_convenio.id is null then raise exception 'Convenio no encontrado.'; end if;
  select id, nombre, direccion, telefono, email, logo_url into v_optica from public.empresas where id = p_optica;
  if v_optica.id is null then raise exception 'Óptica no encontrada.'; end if;

  with candidatas as (
    select a.venta_id, a.id acuerdo_id from public.acuerdos_pago a where a.empresa_convenio_id = p_convenio
    union
    select v.id, null::uuid from public.convenio_personas cp join public.ventas v on v.paciente_id = cp.paciente_id
    where cp.empresa_convenio_id = p_convenio and cp.paciente_id is not null
  ), ventas_deuda as (
    select distinct on (v.id) v.id venta_id, v.folio, v.creado_en, v.total, v.pagado, v.saldo, v.paciente_id, v.cliente_nombre, v.sucursal_id,
           coalesce(c.acuerdo_id, (select a2.id from public.acuerdos_pago a2 where a2.venta_id = v.id and a2.empresa_convenio_id = p_convenio limit 1)) acuerdo_id
    from candidatas c join public.ventas v on v.id = c.venta_id
    where v.empresa_id = p_optica and v.estado = 'completada' and v.saldo > 0.004
    order by v.id, c.acuerdo_id nulls last
  ), plan as (
    -- Plan de cuotas: el del acuerdo firmado o, si no hay, el automático del convenio.
    select d.*, a.id a_id, t.id t_id, t.nombres t_nombres, t.apellidos t_apellidos, t.cedula t_cedula,
      coalesce(a.cuotas, v_convenio.cuotas_predeterminadas) n_cuotas,
      coalesce(a.monto_cuota, round(greatest(d.total - coalesce((select sum(pv.monto) from public.pagos_venta pv where pv.venta_id = d.venta_id
                  and (pv.creado_en at time zone 'America/Guayaquil')::date = (d.creado_en at time zone 'America/Guayaquil')::date), 0), 0)
                / v_convenio.cuotas_predeterminadas, 2)) monto,
      coalesce(date_trunc('month', a.fecha_primera_cuota)::date,
               (date_trunc('month', (d.creado_en at time zone 'America/Guayaquil')::date) + interval '1 month')::date) inicio
    from ventas_deuda d
    left join public.acuerdos_pago a on a.id = d.acuerdo_id
    left join public.pacientes_clinicos t on t.id = a.titular_paciente_id
  )
  select coalesce(jsonb_agg(fila order by fila->>'empleado', fila->>'folio'), '[]'::jsonb) into v_filas
  from (
    select jsonb_build_object(
      'venta_id', d.venta_id, 'folio', d.folio, 'fecha_venta', (d.creado_en at time zone 'America/Guayaquil')::date,
      'empleado', coalesce(nullif(trim(d.t_nombres || ' ' || coalesce(d.t_apellidos, '')), ''), nullif(trim(p.nombres || ' ' || coalesce(p.apellidos, '')), ''), d.cliente_nombre, 'Sin nombre'),
      'cedula', coalesce(d.t_cedula, p.cedula),
      'beneficiario', case when d.t_id is not null and d.t_id <> p.id then nullif(trim(p.nombres || ' ' || coalesce(p.apellidos, '')), '') end,
      'sucursal', s.nombre,
      'total', d.total, 'pagado', d.pagado, 'saldo', d.saldo,
      'con_acuerdo', d.a_id is not null, 'cuotas_automaticas', d.a_id is null,
      'cuotas', d.n_cuotas, 'monto_cuota', d.monto,
      'cuota_numero', (extract(year from age(v_mes, d.inicio)) * 12 + extract(month from age(v_mes, d.inicio)))::int + 1,
      'cuota_mes', round(case
        when v_mes < d.inicio then 0
        when v_mes >= (d.inicio + make_interval(months => d.n_cuotas))::date - interval '1 month' then d.saldo
        else least(d.monto, d.saldo) end, 2)
    ) fila
    from plan d
    left join public.pacientes_clinicos p on p.id = d.paciente_id
    left join public.sucursales s on s.id = d.sucursal_id
  ) x;

  return jsonb_build_object(
    'convenio', jsonb_build_object('id', v_convenio.id, 'nombre', v_convenio.nombre, 'cuotas_predeterminadas', v_convenio.cuotas_predeterminadas),
    'optica', jsonb_build_object('id', v_optica.id, 'nombre', v_optica.nombre, 'direccion', v_optica.direccion, 'telefono', v_optica.telefono, 'email', v_optica.email, 'logo_url', v_optica.logo_url),
    'mes', v_mes, 'filas', v_filas);
end;
$function$;
