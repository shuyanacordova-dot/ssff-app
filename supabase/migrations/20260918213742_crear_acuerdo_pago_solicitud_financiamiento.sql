CREATE OR REPLACE FUNCTION public.crear_acuerdo_pago(p_venta uuid, p_empresa_convenio uuid, p_cuotas integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private'
AS $function$
declare v_user uuid; v_role text; v_atendio_nombre text; v_empresa uuid; v_paciente uuid; v_saldo numeric; v_total numeric; v_pagado numeric; v_folio int;
        v_paciente_nombre text; v_paciente_cedula text; v_paciente_ocupacion text; v_paciente_telefono text;
        v_empresa_convenio_nombre text; v_empresa_nombre text; v_empresa_direccion text; v_empresa_telefono text; v_empresa_email text; v_empresa_logo text; v_sucursal_nombre text;
        v_fecha date; v_monto_cuota numeric; v_texto text; v_id uuid; v_items jsonb; v_abonos jsonb;
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

  select trim(coalesce(nombres,'') || ' ' || coalesce(apellidos,'')), cedula, ocupacion, telefono into v_paciente_nombre, v_paciente_cedula, v_paciente_ocupacion, v_paciente_telefono from public.pacientes_clinicos where id = v_paciente;
  if v_paciente_nombre is null or v_paciente_nombre = '' then raise exception 'La venta no tiene un paciente vinculado.'; end if;
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
    E'1. Acepto el presupuesto detallado en esta solicitud por un total de $%s, del cual he cancelado $%s como cuota inicial, y financio el saldo de $%s en %s cuota(s) de $%s cada una, mediante descuento directo del rol de pagos de %s, iniciando el %s.\n\n2. Entiendo que cuento con dos (2) días hábiles desde la fecha de esta solicitud para cancelar o modificar mi pedido sin costo. Pasado este plazo, o si mis lentes u otros productos ya fueron elaborados o personalizados, la cancelación ya no procede y el saldo pendiente sigue siendo exigible.\n\n3. Autorizo expresamente a %s a descontar de mi rol de pagos el valor de cada cuota hasta cubrir la totalidad del saldo señalado, y me comprometo a informar oportunamente cualquier cambio en mi situación laboral que pudiera afectar este descuento.\n\n4. En caso de que mi relación laboral con %s termine antes de cubrir la totalidad de esta deuda, reconozco y me comprometo a pagar incondicionalmente a %s el saldo pendiente a la fecha de mi salida, cancelándolo en las oficinas de %s dentro de los 30 días siguientes a la terminación de mi relación laboral.',
    to_char(v_total, 'FM999999990.00'), to_char(v_pagado, 'FM999999990.00'), to_char(v_saldo, 'FM999999990.00'), p_cuotas, to_char(v_monto_cuota, 'FM999999990.00'), v_empresa_convenio_nombre, to_char(v_fecha, 'DD/MM/YYYY'),
    v_empresa_convenio_nombre, v_empresa_convenio_nombre, coalesce(v_empresa_nombre, 'la óptica'), coalesce(v_empresa_nombre, 'la óptica')
  );

  insert into public.acuerdos_pago (venta_id, empresa_convenio_id, cuotas, monto_cuota, fecha_primera_cuota, texto, firmado_por)
  values (p_venta, p_empresa_convenio, p_cuotas, v_monto_cuota, v_fecha, v_texto, v_user)
  on conflict (venta_id) do update set empresa_convenio_id = excluded.empresa_convenio_id, cuotas = excluded.cuotas, monto_cuota = excluded.monto_cuota, fecha_primera_cuota = excluded.fecha_primera_cuota, texto = excluded.texto, firmado_en = now(), firmado_por = excluded.firmado_por
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id, 'texto', v_texto, 'monto_cuota', v_monto_cuota, 'fecha_primera_cuota', v_fecha, 'cuotas', p_cuotas,
    'paciente_nombre', v_paciente_nombre, 'paciente_cedula', v_paciente_cedula, 'paciente_ocupacion', v_paciente_ocupacion, 'paciente_telefono', v_paciente_telefono,
    'empresa_convenio_nombre', v_empresa_convenio_nombre, 'atendio_nombre', v_atendio_nombre,
    'empresa_nombre', v_empresa_nombre, 'empresa_direccion', v_empresa_direccion, 'empresa_telefono', v_empresa_telefono, 'empresa_email', v_empresa_email, 'empresa_logo_url', v_empresa_logo, 'sucursal_nombre', v_sucursal_nombre,
    'folio', v_folio, 'items', v_items, 'abonos', v_abonos, 'total', v_total, 'pagado', v_pagado, 'saldo', v_saldo
  );
end;
$function$;;
