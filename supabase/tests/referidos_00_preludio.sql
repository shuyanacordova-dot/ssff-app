-- Preludio común de las pruebas de referidos. Se concatena DESPUÉS de la migración y ANTES del archivo de prueba.
-- Todo corre dentro de una transacción que termina en error a propósito (se deshace sola).

create or replace function pg_temp.paciente(p_nombre text, p_telefono text, p_empresa uuid, p_sucursal uuid)
returns uuid language plpgsql as $f$
declare v uuid;
begin
  insert into public.pacientes_clinicos(nombres, apellidos, cedula, telefono, empresa_origen_id)
  values ('ZZ ' || p_nombre, 'Prueba', lpad((random() * 9999999999)::bigint::text, 10, '0'), p_telefono, p_empresa)
  returning id into v;
  insert into public.paciente_empresas(paciente_id, empresa_id, primera_sucursal_id) values (v, p_empresa, p_sucursal);
  return v;
end $f$;

create or replace function pg_temp.vender(p_empresa uuid, p_sucursal uuid, p_auth uuid, p_paciente uuid, p_codigo text, p_precio numeric, p_pago numeric,
  p_credito numeric default 0, p_convenio boolean default false, p_desc_linea numeric default 0)
returns uuid language plpgsql as $f$
declare v uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    v := public.registrar_venta(p_empresa, p_sucursal, null,
      jsonb_build_array(jsonb_build_object('producto_id', coalesce(nullif(current_setting('t.producto_' || (case when p_empresa = current_setting('t.shu')::uuid then 'shu' else 'focus' end)), ''), current_setting('t.producto_focus')), 'cantidad', 1, 'precio_unitario', p_precio, 'descuento', p_desc_linea)),
      case when p_pago > 0 then jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', p_pago)) else '[]'::jsonb end,
      p_paciente, p_codigo, p_credito, p_convenio);
  exception when others then
    reset role;
    raise;
  end;
  reset role;
  return v;
end $f$;

-- Ejecuta una venta que DEBE fallar y comprueba que el mensaje contenga el fragmento esperado.
create or replace function pg_temp.vender_falla(p_caso text, p_fragmento text, p_empresa uuid, p_sucursal uuid, p_auth uuid, p_paciente uuid, p_codigo text,
  p_precio numeric, p_pago numeric, p_credito numeric default 0, p_convenio boolean default false, p_desc_linea numeric default 0)
returns void language plpgsql as $f$
begin
  begin
    perform pg_temp.vender(p_empresa, p_sucursal, p_auth, p_paciente, p_codigo, p_precio, p_pago, p_credito, p_convenio, p_desc_linea);
  exception when others then
    if position(lower(p_fragmento) in lower(sqlerrm)) = 0 then
      raise exception 'FALLO %: se esperaba un error con "%" y salió "%"', p_caso, p_fragmento, sqlerrm;
    end if;
    return;
  end;
  raise exception 'FALLO %: se esperaba un error con "%" pero la venta fue aceptada', p_caso, p_fragmento;
end $f$;

do $$
declare
  v_focus uuid := 'be1dc246-219a-40a2-9e92-707e5845d295';
  v_shu uuid := '51820b6b-9fc1-495c-b2ea-ab50547e2ce3';
begin
  perform set_config('t.focus', v_focus::text, true);
  perform set_config('t.shu', v_shu::text, true);
  perform set_config('t.su', coalesce((select u.auth_user_id::text from public.usuarios u join public.roles r on r.id = u.rol_id where r.nombre = 'superadmin' and u.activo limit 1), ''), true);
  perform set_config('t.vend_focus', coalesce((select u.auth_user_id::text from public.usuarios u join public.roles r on r.id = u.rol_id where r.nombre in ('vendedor', 'optometra', 'admin_sucursal') and u.empresa_id = v_focus and u.activo order by (r.nombre = 'admin_sucursal') limit 1), ''), true);
  perform set_config('t.vend_shu', coalesce((select u.auth_user_id::text from public.usuarios u join public.roles r on r.id = u.rol_id where r.nombre in ('vendedor', 'optometra', 'admin_sucursal') and u.empresa_id = v_shu and u.activo order by (r.nombre = 'admin_sucursal') limit 1), ''), true);
  perform set_config('t.suc_focus', coalesce((select id::text from public.sucursales where empresa_id = v_focus order by nombre limit 1), ''), true);
  perform set_config('t.suc_shu', coalesce((select id::text from public.sucursales where empresa_id = v_shu order by nombre limit 1), ''), true);
  perform set_config('t.producto_focus', coalesce((select id::text from public.productos_catalogo where empresa_id = v_focus and activo and categoria in ('accesorio', 'servicio') and not controla_inventario limit 1), ''), true);
  perform set_config('t.producto_shu', coalesce((select id::text from public.productos_catalogo where empresa_id = v_shu and activo and categoria in ('accesorio', 'servicio') and not controla_inventario limit 1), ''), true);
  if '' in (current_setting('t.su'), current_setting('t.vend_focus'), current_setting('t.vend_shu'), current_setting('t.suc_focus'), current_setting('t.suc_shu'), current_setting('t.producto_focus'), current_setting('t.producto_shu')) then
    raise exception 'PRELUDIO: falta un dato de prueba (superadmin %, vendedor Focus %, vendedor Shuvisión %, sucursal Focus %, sucursal Shuvisión %, producto Focus %, producto Shuvisión %).',
      current_setting('t.su'), current_setting('t.vend_focus'), current_setting('t.vend_shu'), current_setting('t.suc_focus'), current_setting('t.suc_shu'), current_setting('t.producto_focus'), current_setting('t.producto_shu');
  end if;
  -- Dentro de la prueba los dos programas se encienden (esto se deshace al final).
  update public.programas_referidos set activo = true where empresa_id in (v_focus, v_shu);
end $$;
