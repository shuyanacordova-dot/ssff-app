-- Descuento a rol: el TITULAR (trabajador de la empresa del convenio) no siempre es el paciente (Shuyana 2026-09-30).
-- Ej.: Ricardo Gudiño → el descuento es a Sandra Macarena Ruiz; Marilyn Zambrano → a su papá Luis Zambrano.
-- Titular = el elegido al generar la autorización; si no se elige, el "responsable de la cuenta" del paciente;
-- si no tiene, el propio paciente. El documento lo firma el titular y menciona al paciente como beneficiario.
-- El informe mensual del convenio muestra al titular (a quien se descuenta) y al beneficiario.

alter table public.acuerdos_pago add column if not exists titular_paciente_id uuid references public.pacientes_clinicos(id);

-- Acuerdos existentes: titular = responsable del paciente, si tiene; si no, el paciente.
update public.acuerdos_pago a set titular_paciente_id = coalesce(p.responsable_id, p.id)
from public.ventas v join public.pacientes_clinicos p on p.id = v.paciente_id
where v.id = a.venta_id and a.titular_paciente_id is null;

drop function if exists public.crear_acuerdo_pago(uuid, uuid, integer);
create function public.crear_acuerdo_pago(p_venta uuid, p_empresa_convenio uuid, p_cuotas integer, p_titular uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'app_private'
as $$
declare v_user uuid; v_role text; v_atendio_nombre text; v_empresa uuid; v_paciente uuid; v_saldo numeric; v_total numeric; v_pagado numeric; v_folio int;
        v_titular uuid; v_paciente_nombre text; v_paciente_cedula text;
        v_titular_nombre text; v_titular_cedula text; v_titular_ocupacion text; v_titular_telefono text;
        v_empresa_convenio_nombre text; v_empresa_nombre text; v_empresa_direccion text; v_empresa_telefono text; v_empresa_email text; v_empresa_logo text; v_sucursal_nombre text;
        v_fecha date; v_monto_cuota numeric; v_texto text; v_id uuid; v_items jsonb; v_abonos jsonb; v_beneficiario text;
begin
  select v.empresa_id, v.paciente_id, v.saldo, v.total, v.pagado, v.folio into v_empresa, v_paciente, v_saldo, v_total, v_pagado, v_folio from public.ventas v where v.id = p_venta;
  if v_empresa is null then raise exception 'Venta no encontrada'; end if;
  if v_saldo is null or v_saldo <= 0 then raise exception 'Esta venta no tiene saldo pendiente para un acuerdo de pago.'; end if;
  if p_cuotas is null or p_cuotas < 1 then raise exception 'Indica un número de cuotas válido.'; end if;

  select u.id, ro.nombre, u.nombre into v_user, v_role, v_atendio_nombre
  from public.usuarios u join public.roles ro on ro.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and (ro.nombre = 'superadmin' or u.empresa_id = v_empresa);
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('ventas', 'crear')) then
    raise exception 'No autorizado';
  end if;

  select trim(coalesce(nombres,'') || ' ' || coalesce(apellidos,'')), cedula, responsable_id into v_paciente_nombre, v_paciente_cedula, v_titular
  from public.pacientes_clinicos where id = v_paciente;
  if v_paciente_nombre is null or v_paciente_nombre = '' then raise exception 'La venta no tiene un paciente vinculado.'; end if;
  v_titular := coalesce(p_titular, v_titular, v_paciente);
  select trim(coalesce(nombres,'') || ' ' || coalesce(apellidos,'')), cedula, ocupacion, telefono
    into v_titular_nombre, v_titular_cedula, v_titular_ocupacion, v_titular_telefono from public.pacientes_clinicos where id = v_titular;
  if v_titular_nombre is null or v_titular_nombre = '' then raise exception 'No se encontró al trabajador titular.'; end if;
  v_beneficiario := case when v_titular <> v_paciente then v_paciente_nombre end;

  select nombre into v_empresa_convenio_nombre from public.empresas_convenio where id = p_empresa_convenio;
  if v_empresa_convenio_nombre is null then raise exception 'Empresa de convenio no encontrada.'; end if;
  select nombre, direccion, telefono, email, logo_url into v_empresa_nombre, v_empresa_direccion, v_empresa_telefono, v_empresa_email, v_empresa_logo from public.empresas where id = v_empresa;
  select nombre into v_sucursal_nombre from public.sucursales where id = (select sucursal_id from public.ventas where id = p_venta);

  select coalesce(jsonb_agg(jsonb_build_object('descripcion', descripcion, 'cantidad', cantidad, 'precio_unitario', precio_unitario, 'total_linea', total_linea) order by id), '[]'::jsonb)
    into v_items from public.venta_items where venta_id = p_venta;
  select coalesce(jsonb_agg(jsonb_build_object('fecha', creado_en, 'monto', monto, 'metodo', metodo) order by creado_en), '[]'::jsonb)
    into v_abonos from public.pagos_venta where venta_id = p_venta;

  v_fecha := (date_trunc('month', current_date) + interval '1 month')::date;
  v_monto_cuota := round(v_saldo / p_cuotas, 2);
  v_texto := format(
    E'1. Acepto el presupuesto detallado en esta solicitud%s por un total de $%s, del cual he cancelado $%s como cuota inicial, y financio el saldo de $%s en %s cuota(s) de $%s cada una, mediante descuento directo del rol de pagos de %s, iniciando el %s.\n\n2. Entiendo que cuento con dos (2) días hábiles desde la fecha de esta solicitud para cancelar o modificar mi pedido sin costo. Pasado este plazo, o si mis lentes u otros productos ya fueron elaborados o personalizados, la cancelación ya no procede y el saldo pendiente sigue siendo exigible.\n\n3. Autorizo expresamente a %s a descontar de mi rol de pagos el valor de cada cuota hasta cubrir la totalidad del saldo señalado, y me comprometo a informar oportunamente cualquier cambio en mi situación laboral que pudiera afectar este descuento.\n\n4. En caso de que mi relación laboral con %s termine antes de cubrir la totalidad de esta deuda, reconozco y me comprometo a pagar incondicionalmente a %s el saldo pendiente a la fecha de mi salida, cancelándolo en las oficinas de %s dentro de los 30 días siguientes a la terminación de mi relación laboral.',
    case when v_beneficiario is not null then format(', correspondiente a la compra de %s%s,', v_beneficiario, coalesce(' (C.I. ' || v_paciente_cedula || ')', '')) else '' end,
    to_char(v_total, 'FM999999990.00'), to_char(v_pagado, 'FM999999990.00'), to_char(v_saldo, 'FM999999990.00'), p_cuotas, to_char(v_monto_cuota, 'FM999999990.00'), v_empresa_convenio_nombre, to_char(v_fecha, 'DD/MM/YYYY'),
    v_empresa_convenio_nombre, v_empresa_convenio_nombre, coalesce(v_empresa_nombre, 'la óptica'), coalesce(v_empresa_nombre, 'la óptica')
  );

  insert into public.acuerdos_pago (venta_id, empresa_convenio_id, cuotas, monto_cuota, fecha_primera_cuota, texto, firmado_por, titular_paciente_id)
  values (p_venta, p_empresa_convenio, p_cuotas, v_monto_cuota, v_fecha, v_texto, v_user, v_titular)
  on conflict (venta_id) do update set empresa_convenio_id = excluded.empresa_convenio_id, cuotas = excluded.cuotas, monto_cuota = excluded.monto_cuota,
    fecha_primera_cuota = excluded.fecha_primera_cuota, texto = excluded.texto, firmado_en = now(), firmado_por = excluded.firmado_por, titular_paciente_id = excluded.titular_paciente_id
  returning id into v_id;

  -- paciente_* = quien firma (titular); beneficiario_* = el paciente de la venta cuando es otra persona.
  return jsonb_build_object(
    'id', v_id, 'texto', v_texto, 'monto_cuota', v_monto_cuota, 'fecha_primera_cuota', v_fecha, 'cuotas', p_cuotas,
    'paciente_nombre', v_titular_nombre, 'paciente_cedula', v_titular_cedula, 'paciente_ocupacion', v_titular_ocupacion, 'paciente_telefono', v_titular_telefono,
    'titular_id', v_titular, 'beneficiario_nombre', v_beneficiario, 'beneficiario_cedula', case when v_beneficiario is not null then v_paciente_cedula end,
    'empresa_convenio_nombre', v_empresa_convenio_nombre, 'atendio_nombre', v_atendio_nombre,
    'empresa_nombre', v_empresa_nombre, 'empresa_direccion', v_empresa_direccion, 'empresa_telefono', v_empresa_telefono, 'empresa_email', v_empresa_email, 'empresa_logo_url', v_empresa_logo, 'sucursal_nombre', v_sucursal_nombre,
    'folio', v_folio, 'items', v_items, 'abonos', v_abonos, 'total', v_total, 'pagado', v_pagado, 'saldo', v_saldo
  );
end;
$$;
revoke all on function public.crear_acuerdo_pago(uuid, uuid, integer, uuid) from public, anon;
grant execute on function public.crear_acuerdo_pago(uuid, uuid, integer, uuid) to authenticated;

-- Informe mensual: "empleado" = titular del acuerdo (a quien se descuenta); "beneficiario" = paciente si es otra persona.
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
      'empleado', coalesce(nullif(trim(t.nombres || ' ' || coalesce(t.apellidos, '')), ''), nullif(trim(p.nombres || ' ' || coalesce(p.apellidos, '')), ''), d.cliente_nombre, 'Sin nombre'),
      'cedula', coalesce(t.cedula, p.cedula),
      'beneficiario', case when t.id is not null and t.id <> p.id then nullif(trim(p.nombres || ' ' || coalesce(p.apellidos, '')), '') end,
      'sucursal', s.nombre,
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
    left join public.pacientes_clinicos t on t.id = a.titular_paciente_id
    left join public.sucursales s on s.id = d.sucursal_id
  ) x;

  return jsonb_build_object(
    'convenio', jsonb_build_object('id', v_convenio.id, 'nombre', v_convenio.nombre),
    'optica', jsonb_build_object('id', v_optica.id, 'nombre', v_optica.nombre, 'direccion', v_optica.direccion, 'telefono', v_optica.telefono, 'email', v_optica.email, 'logo_url', v_optica.logo_url),
    'mes', v_mes, 'filas', v_filas);
end;
$function$;
