-- La autorización expresa queda en el texto guardado de los compromisos nuevos.
-- Los compromisos existentes conservan su texto al reimprimirse.
create or replace function public.crear_financiamiento_optica(p_venta uuid, p_cuotas integer, p_firmante uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'app_private'
as $$
declare v_user uuid; v_role text; v_atendio text; v_venta record; v_paciente record; v_firmante record;
        v_fecha date; v_inicial numeric; v_financiado numeric; v_cuota numeric; v_texto text; v_id uuid;
        v_optica record; v_sucursal text; v_items jsonb; v_abonos jsonb; v_existente record;
begin
  if p_cuotas is null or p_cuotas < 1 or p_cuotas > 9 then raise exception 'El financiamiento con la óptica admite entre 1 y 9 pagos.'; end if;
  select id, empresa_id, sucursal_id, paciente_id, estado, saldo, total, pagado, folio into v_venta from public.ventas where id = p_venta;
  if v_venta.id is null or v_venta.estado <> 'completada' or v_venta.saldo <= 0 then raise exception 'La venta debe estar completada y tener saldo pendiente.'; end if;
  select u.id, r.nombre, u.nombre into v_user, v_role, v_atendio from public.usuarios u join public.roles r on r.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and (r.nombre = 'superadmin' or u.empresa_id = v_venta.empresa_id);
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('ventas', 'crear')) then raise exception 'No autorizado'; end if;
  select id, trim(coalesce(nombres,'') || ' ' || coalesce(apellidos,'')) nombre, cedula, responsable_id into v_paciente from public.pacientes_clinicos where id = v_venta.paciente_id;
  if v_paciente.id is null then raise exception 'La venta necesita una ficha de paciente.'; end if;
  select id, trim(coalesce(nombres,'') || ' ' || coalesce(apellidos,'')) nombre, cedula, ocupacion, telefono into v_firmante
  from public.pacientes_clinicos where id = coalesce(p_firmante, v_paciente.responsable_id, v_paciente.id);
  if v_firmante.id is null or v_firmante.nombre = '' then raise exception 'Selecciona al paciente o representante que firmará.'; end if;
  select id, modalidad, fecha_primera_cuota, texto into v_existente from public.acuerdos_pago where venta_id = p_venta;
  if v_existente.id is not null and v_existente.modalidad <> 'optica' then raise exception 'Esta venta ya tiene un convenio de descuento a rol.'; end if;
  v_fecha := coalesce(v_existente.fecha_primera_cuota, (date_trunc('month', (now() at time zone 'America/Guayaquil')::date) + interval '1 month')::date);
  select coalesce(sum(monto), 0) into v_inicial from public.pagos_venta where venta_id = p_venta and (creado_en at time zone 'America/Guayaquil')::date < v_fecha;
  v_financiado := v_venta.total - v_inicial;
  if v_financiado <= 0 then raise exception 'No queda valor por financiar.'; end if;
  v_cuota := trunc(v_financiado / p_cuotas, 2);
  select nombre, direccion, telefono, email, logo_url into v_optica from public.empresas where id = v_venta.empresa_id;
  select nombre into v_sucursal from public.sucursales where id = v_venta.sucursal_id;
  select coalesce(jsonb_agg(jsonb_build_object('descripcion', descripcion, 'cantidad', cantidad, 'precio_unitario', precio_unitario, 'total_linea', total_linea) order by id), '[]'::jsonb) into v_items from public.venta_items where venta_id = p_venta;
  select coalesce(jsonb_agg(jsonb_build_object('fecha', creado_en, 'monto', monto, 'metodo', metodo) order by creado_en), '[]'::jsonb) into v_abonos from public.pagos_venta where venta_id = p_venta;
  v_texto := format(E'En %s, a %s, yo, %s%s, reconozco deber a %s la cantidad de $%s correspondiente al saldo financiado de la venta N.º %s%s. El valor total de la venta es $%s y los pagos realizados antes del inicio del plan suman $%s.\n\nMe comprometo a pagar este saldo directamente a la óptica en %s cuotas mensuales. Las primeras %s cuotas serán de $%s y la última será de $%s para completar el saldo. La primera cuota vence el %s y las siguientes el primer día de cada mes. Los abonos posteriores se aplicarán al saldo de esta obligación.\n\nAcepto que este documento deja constancia de mi compromiso personal de pago por la compra indicada. Si un pago se atrasa, el saldo pendiente seguirá siendo exigible. Recibiré constancia de cada abono y podré solicitar el estado actualizado de mi cuenta.',
    coalesce(v_sucursal, 'Ecuador'), to_char((now() at time zone 'America/Guayaquil')::date, 'DD/MM/YYYY'), v_firmante.nombre,
    coalesce(' (C.I. ' || v_firmante.cedula || ')', ''), coalesce(v_optica.nombre, 'la óptica'), to_char(v_financiado, 'FM999999990.00'), coalesce(v_venta.folio::text, '—'),
    case when v_firmante.id <> v_paciente.id then format(', para %s%s', v_paciente.nombre, coalesce(' (C.I. ' || v_paciente.cedula || ')', '')) else '' end,
    to_char(v_venta.total, 'FM999999990.00'), to_char(v_inicial, 'FM999999990.00'), p_cuotas, greatest(p_cuotas - 1, 0), to_char(v_cuota, 'FM999999990.00'), to_char(v_financiado - v_cuota * greatest(p_cuotas - 1, 0), 'FM999999990.00'), to_char(v_fecha, 'DD/MM/YYYY'));
  -- El texto firmado se conserva al volver a generar un compromiso existente.
  if v_existente.id is not null then
    v_texto := v_existente.texto;
  else
    v_texto := v_texto || E'\n\nAUTORIZACIÓN EXPRESA PARA EL REPORTE DE INFORMACIÓN CREDITICIA. Yo, la persona que suscribe este compromiso como deudora, autorizo expresamente a ' || coalesce(v_optica.nombre, 'la óptica') || E' a comunicar a un buró de información crediticia legalmente autorizado en Ecuador los datos de este crédito, sus cuotas y mi historial de pagos, incluido cualquier saldo vencido, conforme a la normativa aplicable. La óptica deberá reportar información veraz y actualizada, registrar los pagos realizados y atender las solicitudes de corrección de datos inexactos. Esta autorización corresponde únicamente a la obligación que asumo al firmar este documento.';
  end if;
  insert into public.acuerdos_pago (venta_id, empresa_convenio_id, modalidad, cuotas, monto_cuota, fecha_primera_cuota, texto, firmado_por, titular_paciente_id)
  values (p_venta, null, 'optica', p_cuotas, v_cuota, v_fecha, v_texto, v_user, v_firmante.id)
  on conflict (venta_id) do update set cuotas = excluded.cuotas, monto_cuota = excluded.monto_cuota, texto = excluded.texto, firmado_en = now(), firmado_por = excluded.firmado_por, titular_paciente_id = excluded.titular_paciente_id
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'modalidad', 'optica', 'texto', v_texto, 'monto_cuota', v_cuota, 'fecha_primera_cuota', v_fecha, 'cuotas', p_cuotas,
    'paciente_nombre', v_firmante.nombre, 'paciente_cedula', v_firmante.cedula, 'paciente_ocupacion', v_firmante.ocupacion, 'paciente_telefono', v_firmante.telefono,
    'titular_id', v_firmante.id, 'beneficiario_nombre', case when v_firmante.id <> v_paciente.id then v_paciente.nombre end,
    'beneficiario_cedula', case when v_firmante.id <> v_paciente.id then v_paciente.cedula end, 'empresa_convenio_nombre', null, 'atendio_nombre', v_atendio,
    'empresa_nombre', v_optica.nombre, 'empresa_direccion', v_optica.direccion, 'empresa_telefono', v_optica.telefono, 'empresa_email', v_optica.email, 'empresa_logo_url', v_optica.logo_url, 'sucursal_nombre', v_sucursal,
    'folio', v_venta.folio, 'items', v_items, 'abonos', v_abonos, 'total', v_venta.total, 'pagado', v_venta.pagado, 'saldo', v_venta.saldo);
end;
$$;

revoke all on function public.crear_financiamiento_optica(uuid, integer, uuid) from public, anon;
grant execute on function public.crear_financiamiento_optica(uuid, integer, uuid) to authenticated;
