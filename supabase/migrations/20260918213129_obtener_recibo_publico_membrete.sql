CREATE OR REPLACE FUNCTION public.obtener_recibo_publico(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_venta record; v_paciente_nombre text; v_paciente_telefono text; v_empresa record; v_sucursal_nombre text; v_items jsonb; v_abonos jsonb;
begin
  select id, empresa_id, sucursal_id, paciente_id, cliente_nombre, estado, subtotal, descuento, total, pagado, saldo, fecha_entrega_estimada, creado_en, folio
    into v_venta from public.ventas where recibo_token = p_token;
  if v_venta.id is null then raise exception 'Recibo no encontrado'; end if;

  select trim(coalesce(nombres,'') || ' ' || coalesce(apellidos,'')), telefono into v_paciente_nombre, v_paciente_telefono from public.pacientes_clinicos where id = v_venta.paciente_id;
  select nombre, direccion, telefono, email, logo_url into v_empresa from public.empresas where id = v_venta.empresa_id;
  select nombre into v_sucursal_nombre from public.sucursales where id = v_venta.sucursal_id;

  select coalesce(jsonb_agg(jsonb_build_object('descripcion', descripcion, 'cantidad', cantidad, 'precio_unitario', precio_unitario, 'total_linea', total_linea) order by id), '[]'::jsonb)
    into v_items from public.venta_items where venta_id = v_venta.id;
  select coalesce(jsonb_agg(jsonb_build_object('fecha', creado_en, 'monto', monto, 'metodo', metodo) order by creado_en), '[]'::jsonb)
    into v_abonos from public.pagos_venta where venta_id = v_venta.id;

  return jsonb_build_object(
    'paciente_nombre', coalesce(nullif(v_paciente_nombre, ''), v_venta.cliente_nombre, 'Cliente'),
    'paciente_telefono', v_paciente_telefono,
    'empresa_nombre', v_empresa.nombre,
    'empresa_direccion', v_empresa.direccion,
    'empresa_telefono', v_empresa.telefono,
    'empresa_email', v_empresa.email,
    'empresa_logo_url', v_empresa.logo_url,
    'sucursal_nombre', v_sucursal_nombre,
    'folio', v_venta.folio,
    'estado', v_venta.estado,
    'items', v_items,
    'abonos', v_abonos,
    'subtotal', v_venta.subtotal,
    'descuento', v_venta.descuento,
    'total', v_venta.total,
    'pagado', v_venta.pagado,
    'saldo', v_venta.saldo,
    'fecha_entrega_estimada', v_venta.fecha_entrega_estimada,
    'creado_en', v_venta.creado_en
  );
end;
$function$;;
