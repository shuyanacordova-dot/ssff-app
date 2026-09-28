-- Informe mensual para empresas con convenio (Shuyana 2026-09-28): lista de descuentos por rol de pagos del mes.
-- Por óptica (Shuvisión o Focus): todos los empleados de la empresa que deben — con acuerdo de pago firmado
-- (acuerdos_pago) o en la lista del convenio (convenio_personas con carpeta) — y cada venta con saldo pendiente.
-- Cuota del mes: con acuerdo = valor de la cuota (o el saldo si es menor; si ya pasaron todas las cuotas, el saldo);
-- sin acuerdo = el saldo (se puede cambiar en pantalla antes de imprimir).
create or replace function public.informe_convenio_mensual(p_convenio uuid, p_optica uuid, p_mes date)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'app_private'
as $$
declare v_mes date := date_trunc('month', coalesce(p_mes, (now() at time zone 'America/Guayaquil')::date))::date;
        v_filas jsonb; v_convenio record; v_optica record;
begin
  if not (public.es_superadmin() or exists (
    select 1 from public.usuarios u join public.roles r on r.id = u.rol_id
    where u.auth_user_id = (select auth.uid()) and u.activo and r.nombre = 'admin_sucursal' and u.empresa_id = p_optica)) then
    raise exception 'Solo la administración puede generar el informe del convenio.';
  end if;
  select id, nombre into v_convenio from public.empresas_convenio where id = p_convenio;
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
  )
  select coalesce(jsonb_agg(fila order by fila->>'empleado', fila->>'folio'), '[]'::jsonb) into v_filas
  from (
    select jsonb_build_object(
      'venta_id', d.venta_id, 'folio', d.folio, 'fecha_venta', (d.creado_en at time zone 'America/Guayaquil')::date,
      'empleado', coalesce(nullif(trim(p.nombres || ' ' || coalesce(p.apellidos, '')), ''), d.cliente_nombre, 'Sin nombre'),
      'cedula', p.cedula, 'sucursal', s.nombre,
      'total', d.total, 'pagado', d.pagado, 'saldo', d.saldo,
      'con_acuerdo', a.id is not null, 'cuotas', a.cuotas, 'monto_cuota', a.monto_cuota,
      'cuota_numero', case when a.id is not null then (extract(year from age(v_mes, date_trunc('month', a.fecha_primera_cuota)::date)) * 12
                                                       + extract(month from age(v_mes, date_trunc('month', a.fecha_primera_cuota)::date)))::int + 1 end,
      'cuota_mes', round(case
        when a.id is null then d.saldo
        when v_mes < date_trunc('month', a.fecha_primera_cuota)::date then 0
        when v_mes >= (date_trunc('month', a.fecha_primera_cuota) + make_interval(months => a.cuotas))::date then d.saldo
        else least(a.monto_cuota, d.saldo) end, 2)
    ) fila
    from ventas_deuda d
    left join public.acuerdos_pago a on a.id = d.acuerdo_id
    left join public.pacientes_clinicos p on p.id = d.paciente_id
    left join public.sucursales s on s.id = d.sucursal_id
  ) x;

  return jsonb_build_object(
    'convenio', jsonb_build_object('id', v_convenio.id, 'nombre', v_convenio.nombre),
    'optica', jsonb_build_object('id', v_optica.id, 'nombre', v_optica.nombre, 'direccion', v_optica.direccion, 'telefono', v_optica.telefono, 'email', v_optica.email, 'logo_url', v_optica.logo_url),
    'mes', v_mes, 'filas', v_filas);
end;
$$;
revoke all on function public.informe_convenio_mensual(uuid, uuid, date) from public, anon;
grant execute on function public.informe_convenio_mensual(uuid, uuid, date) to authenticated;
