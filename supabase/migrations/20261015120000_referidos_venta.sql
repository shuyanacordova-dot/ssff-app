-- Referidos y recompensas, fase 1 (3/5): validaciones, monedero, referido en ficha, vista previa y registrar_venta.

create or replace function app_private.es_paciente_convenio(p_paciente uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.convenio_personas where paciente_id = p_paciente)
      or exists (select 1 from public.acuerdos_pago where titular_paciente_id = p_paciente)
      or exists (select 1 from public.acuerdos_pago ap join public.ventas v on v.id = ap.venta_id where v.paciente_id = p_paciente);
$$;
revoke all on function app_private.es_paciente_convenio(uuid) from public, anon, authenticated;

-- Costo promocional del mes (hora de Ecuador): descuentos de bienvenida aplicados + créditos y bonos USADOS.
create or replace function app_private.costo_mes_programa(p_programa uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce((select sum(descuento_aplicado) from public.referidos
                    where programa_id = p_programa and estado in ('en_pago', 'recompensado')
                      and aplicado_en >= (date_trunc('month', now() at time zone 'America/Guayaquil') at time zone 'America/Guayaquil')), 0)
       + coalesce((select -sum(monto) from public.monedero_movimientos
                    where programa_id = p_programa and tipo = 'uso'
                      and creado_en >= (date_trunc('month', now() at time zone 'America/Guayaquil') at time zone 'America/Guayaquil')), 0);
$$;
revoke all on function app_private.costo_mes_programa(uuid) from public, anon, authenticated;

create or replace function app_private.saldo_disponible_monedero(p_programa uuid, p_paciente uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(t.restante), 0) from (
    select sum(m.monto) as restante
    from public.monedero_movimientos l
    join public.monedero_movimientos m on m.id = l.id or m.lote_id = l.id
    where l.programa_id = p_programa and l.paciente_id = p_paciente and l.monto > 0 and l.vence_en > now()
    group by l.id
    having sum(m.monto) > 0
  ) t;
$$;
revoke all on function app_private.saldo_disponible_monedero(uuid, uuid) from public, anon, authenticated;

-- Consume crédito empezando por el lote que vence antes. Devuelve lo realmente consumido.
create or replace function app_private.consumir_monedero(p_programa uuid, p_paciente uuid, p_monto numeric, p_tipo text, p_venta uuid, p_motivo text, p_user uuid)
returns numeric language plpgsql security definer set search_path = '' as $$
declare r record; v_resta numeric := round(p_monto, 2); v_toma numeric;
begin
  for r in
    select l.id, sum(m.monto) as restante
    from public.monedero_movimientos l
    join public.monedero_movimientos m on m.id = l.id or m.lote_id = l.id
    where l.programa_id = p_programa and l.paciente_id = p_paciente and l.monto > 0 and l.vence_en > now()
    group by l.id, l.vence_en, l.creado_en
    having sum(m.monto) > 0
    order by l.vence_en, l.creado_en
  loop
    exit when v_resta <= 0;
    v_toma := least(r.restante, v_resta);
    insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, lote_id, venta_id, motivo, creado_por)
    values (p_programa, p_paciente, p_tipo, -v_toma, r.id, p_venta, p_motivo, p_user);
    v_resta := v_resta - v_toma;
  end loop;
  return round(p_monto, 2) - v_resta;
end $$;
revoke all on function app_private.consumir_monedero(uuid, uuid, numeric, text, uuid, text, uuid) from public, anon, authenticated;

-- Reglas de la pareja referidor/referido (sin reglas de la venta). Devuelve {ok, motivo?, codigo_id?, referidor_id?, referido_existente?}.
create or replace function app_private.validar_pareja_referido(p_programa uuid, p_codigo text, p_paciente uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_prog public.programas_referidos; c public.codigos_referido; a public.pacientes_clinicos; b public.pacientes_clinicos; v_ref public.referidos;
  v_hoy date := (now() at time zone 'America/Guayaquil')::date;
  v_tel_a text; v_tel_b text;
begin
  select * into v_prog from public.programas_referidos where id = p_programa;
  if not found or not v_prog.activo then return jsonb_build_object('ok', false, 'motivo', 'El programa de referidos no está activo.'); end if;
  if (v_prog.campana_desde is not null and v_hoy < v_prog.campana_desde) or (v_prog.campana_hasta is not null and v_hoy > v_prog.campana_hasta) then
    return jsonb_build_object('ok', false, 'motivo', 'El programa de referidos está fuera de las fechas de la campaña.');
  end if;
  select * into c from public.codigos_referido where programa_id = p_programa and codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found then return jsonb_build_object('ok', false, 'motivo', 'Código de referido no encontrado.'); end if;
  if c.paciente_id = p_paciente then return jsonb_build_object('ok', false, 'motivo', 'No se puede usar el propio código de referido.'); end if;
  select * into a from public.pacientes_clinicos where id = c.paciente_id;
  select * into b from public.pacientes_clinicos where id = p_paciente;
  v_tel_a := nullif(regexp_replace(coalesce(a.telefono, ''), '\D', '', 'g'), '');
  v_tel_b := nullif(regexp_replace(coalesce(b.telefono, ''), '\D', '', 'g'), '');
  if (v_tel_a is not null and v_tel_a = v_tel_b)
     or b.responsable_id = a.id or a.responsable_id = b.id
     or (a.responsable_id is not null and a.responsable_id = b.responsable_id) then
    return jsonb_build_object('ok', false, 'motivo', 'No se puede usar el código de alguien de la misma cuenta o con el mismo teléfono.');
  end if;
  if app_private.es_paciente_convenio(p_paciente) then
    return jsonb_build_object('ok', false, 'motivo', 'Los pacientes de convenio (descuento a rol) no participan en el programa de referidos.');
  end if;
  if exists (select 1 from public.ventas v where v.paciente_id = p_paciente and v.empresa_id = v_prog.empresa_id and v.estado = 'completada') then
    return jsonb_build_object('ok', false, 'motivo', 'El beneficio solo aplica a clientes nuevos: este paciente ya tiene compras en esta óptica.');
  end if;
  select * into v_ref from public.referidos where programa_id = p_programa and referido_paciente_id = p_paciente;
  if found and (v_ref.venta_id is not null or v_ref.estado <> 'registrado') then
    return jsonb_build_object('ok', false, 'motivo', 'Este paciente ya usó el beneficio de primera compra.');
  end if;
  if found and v_ref.referidor_paciente_id <> c.paciente_id then
    return jsonb_build_object('ok', false, 'motivo', 'Este paciente ya fue registrado con otro referidor.');
  end if;
  return jsonb_build_object('ok', true, 'codigo_id', c.id, 'referidor_id', c.paciente_id, 'referido_existente', case when found then v_ref.id else null end);
end $$;
revoke all on function app_private.validar_pareja_referido(uuid, text, uuid) from public, anon, authenticated;

-- Reglas completas para una venta. p_base = valor de la compra sin categorías excluidas y ANTES del descuento.
create or replace function app_private.evaluar_referido_venta(p_programa uuid, p_codigo text, p_paciente uuid, p_base numeric, p_es_convenio boolean, p_bloquea_por_descuentos boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_prog public.programas_referidos; v_par jsonb; v_desc numeric;
begin
  select * into v_prog from public.programas_referidos where id = p_programa;
  if p_paciente is null then return jsonb_build_object('ok', false, 'motivo', 'Elige el paciente para usar un código de referido.'); end if;
  if coalesce(p_es_convenio, false) then
    return jsonb_build_object('ok', false, 'motivo', 'Las ventas de convenio (descuento a rol) no participan en el programa de referidos.');
  end if;
  if coalesce(p_bloquea_por_descuentos, false) then
    return jsonb_build_object('ok', false, 'motivo', 'Esta venta ya tiene descuentos; solo administración puede combinarlos con el código de referido.');
  end if;
  v_par := app_private.validar_pareja_referido(p_programa, p_codigo, p_paciente);
  if not (v_par->>'ok')::boolean then return v_par; end if;
  if coalesce(p_base, 0) < v_prog.compra_minima then
    return jsonb_build_object('ok', false, 'motivo', 'La compra mínima para usar el código es $' || to_char(v_prog.compra_minima, 'FM999990.00') || '.');
  end if;
  v_desc := least(v_prog.descuento_bienvenida, p_base);
  if v_prog.presupuesto_mensual is not null and app_private.costo_mes_programa(p_programa) + v_desc > v_prog.presupuesto_mensual then
    return jsonb_build_object('ok', false, 'motivo', 'Se alcanzó el presupuesto promocional del mes para este programa.');
  end if;
  return v_par || jsonb_build_object('ok', true, 'descuento', v_desc, 'credito', v_prog.credito_por_referido);
end $$;
revoke all on function app_private.evaluar_referido_venta(uuid, text, uuid, numeric, boolean, boolean) from public, anon, authenticated;

create or replace function public.buscar_codigo_referido(p_empresa uuid, p_codigo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_prog public.programas_referidos; c public.codigos_referido; pc public.pacientes_clinicos;
begin
  if public.rol_referidos(p_empresa) is null then raise exception 'No autorizado'; end if;
  select * into v_prog from public.programas_referidos where empresa_id = p_empresa and activo;
  if not found then return jsonb_build_object('encontrado', false); end if;
  select * into c from public.codigos_referido where programa_id = v_prog.id and codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found then return jsonb_build_object('encontrado', false); end if;
  select * into pc from public.pacientes_clinicos where id = c.paciente_id;
  return jsonb_build_object('encontrado', true, 'paciente_id', pc.id, 'nombre', btrim(pc.nombres || ' ' || pc.apellidos));
end $$;
revoke all on function public.buscar_codigo_referido(uuid, text) from public, anon;
grant execute on function public.buscar_codigo_referido(uuid, text) to authenticated;

-- Registra "quién lo refirió" en la ficha (antes de comprar). Idempotente para el mismo referidor.
create or replace function public.registrar_referido_ficha(p_paciente uuid, p_empresa uuid, p_codigo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_prog public.programas_referidos; v_par jsonb; v_user uuid; v_nombre text; v_id uuid;
begin
  if public.rol_referidos(p_empresa) is null then raise exception 'No autorizado'; end if;
  select * into v_prog from public.programas_referidos where empresa_id = p_empresa;
  if not found or not v_prog.activo then raise exception 'El programa de referidos no está activo en esta óptica.'; end if;
  if not exists (select 1 from public.paciente_empresas where paciente_id = p_paciente and empresa_id = p_empresa) then
    raise exception 'El paciente no pertenece a esta óptica.';
  end if;
  v_par := app_private.validar_pareja_referido(v_prog.id, p_codigo, p_paciente);
  if not (v_par->>'ok')::boolean then raise exception '%', v_par->>'motivo'; end if;
  select id into v_user from public.usuarios where auth_user_id = (select auth.uid()) and activo;
  if v_par->>'referido_existente' is null then
    insert into public.referidos (programa_id, codigo_id, referidor_paciente_id, referido_paciente_id, registrado_por)
    values (v_prog.id, (v_par->>'codigo_id')::uuid, (v_par->>'referidor_id')::uuid, p_paciente, v_user)
    returning id into v_id;
    insert into public.referidos_auditoria (programa_id, evento, paciente_id, referido_id, usuario_id)
    values (v_prog.id, 'referido_registrado', (v_par->>'referidor_id')::uuid, v_id, v_user);
  end if;
  select btrim(nombres || ' ' || apellidos) into v_nombre from public.pacientes_clinicos where id = (v_par->>'referidor_id')::uuid;
  return jsonb_build_object('ok', true, 'referidor_nombre', v_nombre);
end $$;
revoke all on function public.registrar_referido_ficha(uuid, uuid, text) from public, anon;
grant execute on function public.registrar_referido_ficha(uuid, uuid, text) to authenticated;

create or replace function public.previsualizar_referido(p_empresa uuid, p_paciente uuid, p_codigo text, p_base numeric, p_es_convenio boolean default false, p_bloquea boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_prog public.programas_referidos; v_cod jsonb := null; v_disp numeric := 0; v_nombre text;
begin
  if public.rol_referidos(p_empresa) is null then raise exception 'No autorizado'; end if;
  select * into v_prog from public.programas_referidos where empresa_id = p_empresa;
  if not found or not v_prog.activo then return jsonb_build_object('programa_activo', false); end if;
  if nullif(btrim(coalesce(p_codigo, '')), '') is not null then
    v_cod := app_private.evaluar_referido_venta(v_prog.id, p_codigo, p_paciente, p_base, p_es_convenio, p_bloquea);
    if (v_cod->>'ok')::boolean then
      select btrim(nombres || ' ' || apellidos) into v_nombre from public.pacientes_clinicos where id = (v_cod->>'referidor_id')::uuid;
      v_cod := v_cod || jsonb_build_object('referidor_nombre', v_nombre);
    end if;
  end if;
  if p_paciente is not null then v_disp := app_private.saldo_disponible_monedero(v_prog.id, p_paciente); end if;
  return jsonb_build_object('programa_activo', true, 'nombre', v_prog.nombre, 'codigo', v_cod,
    'credito_disponible', v_disp, 'credito_maximo', least(v_disp, round(coalesce(p_base, 0) * v_prog.tope_uso_porcentaje / 100, 2)));
end $$;
revoke all on function public.previsualizar_referido(uuid, uuid, text, numeric, boolean, boolean) from public, anon;
grant execute on function public.previsualizar_referido(uuid, uuid, text, numeric, boolean, boolean) to authenticated;

create or replace function public.estado_monedero(p_paciente uuid, p_empresa uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_prog public.programas_referidos; v_codigo text;
begin
  if public.rol_referidos(p_empresa) is null then raise exception 'No autorizado'; end if;
  select * into v_prog from public.programas_referidos where empresa_id = p_empresa;
  if not found then return jsonb_build_object('programa_activo', false); end if;
  if v_prog.activo and exists (select 1 from public.paciente_empresas where paciente_id = p_paciente and empresa_id = p_empresa) then
    v_codigo := app_private.asegurar_codigo_referido(v_prog.id, p_paciente);
  else
    select codigo into v_codigo from public.codigos_referido where programa_id = v_prog.id and paciente_id = p_paciente;
  end if;
  return jsonb_build_object(
    'programa_activo', v_prog.activo, 'programa_id', v_prog.id, 'nombre', v_prog.nombre, 'prefijo', v_prog.prefijo,
    'descuento_bienvenida', v_prog.descuento_bienvenida, 'compra_minima', v_prog.compra_minima, 'vigencia_dias', v_prog.vigencia_credito_dias,
    'codigo', v_codigo,
    'disponible', app_private.saldo_disponible_monedero(v_prog.id, p_paciente),
    'pendiente', coalesce((select sum(credito_a_otorgar) from public.referidos where programa_id = v_prog.id and referidor_paciente_id = p_paciente and estado = 'en_pago'), 0),
    'vencido', coalesce((select -sum(monto) from public.monedero_movimientos where programa_id = v_prog.id and paciente_id = p_paciente and tipo = 'vencimiento'), 0),
    'generado', coalesce((select sum(monto) from public.monedero_movimientos where programa_id = v_prog.id and paciente_id = p_paciente and tipo in ('credito', 'bono_hito', 'ajuste') and monto > 0), 0),
    'usado', coalesce((select -sum(monto) from public.monedero_movimientos where programa_id = v_prog.id and paciente_id = p_paciente and tipo = 'uso'), 0),
    'exitosos', (select count(*) from public.referidos where programa_id = v_prog.id and referidor_paciente_id = p_paciente and estado = 'recompensado'),
    'referido_por', (select jsonb_build_object('nombre', btrim(pc.nombres || ' ' || pc.apellidos), 'codigo', c.codigo, 'estado', rf.estado)
                       from public.referidos rf join public.pacientes_clinicos pc on pc.id = rf.referidor_paciente_id join public.codigos_referido c on c.id = rf.codigo_id
                      where rf.programa_id = v_prog.id and rf.referido_paciente_id = p_paciente),
    'referidos', coalesce((select jsonb_agg(jsonb_build_object('nombre', btrim(pc.nombres || ' ' || pc.apellidos), 'estado', rf.estado, 'creado_en', rf.creado_en, 'credito', rf.credito_a_otorgar) order by rf.creado_en desc)
                             from public.referidos rf join public.pacientes_clinicos pc on pc.id = rf.referido_paciente_id
                            where rf.programa_id = v_prog.id and rf.referidor_paciente_id = p_paciente), '[]'::jsonb),
    'movimientos', coalesce((select jsonb_agg(to_jsonb(x) order by x.creado_en desc) from (
                      select m.tipo, m.monto, m.vence_en, m.motivo, m.creado_en,
                             (select btrim(pc.nombres || ' ' || pc.apellidos) from public.referidos rf join public.pacientes_clinicos pc on pc.id = rf.referido_paciente_id where rf.id = m.referido_id) as referido
                        from public.monedero_movimientos m
                       where m.programa_id = v_prog.id and m.paciente_id = p_paciente
                       order by m.creado_en desc limit 50) x), '[]'::jsonb)
  );
end $$;
revoke all on function public.estado_monedero(uuid, uuid) from public, anon;
grant execute on function public.estado_monedero(uuid, uuid) to authenticated;

-- registrar_venta con código de referido y crédito (REFERIDOS: parámetros y bloques marcados).
drop function if exists public.registrar_venta(uuid, uuid, text, jsonb, jsonb, uuid);
create or replace function public.registrar_venta(
  p_empresa uuid, p_sucursal uuid, p_cliente text, p_items jsonb, p_pagos jsonb default '[]'::jsonb, p_paciente uuid default null,
  p_codigo_referido text default null, p_usar_credito numeric default 0, p_es_convenio boolean default false, p_autoriza_combinar boolean default false)
returns uuid language plpgsql security definer set search_path to 'public', 'app_private'
as $function$
declare
  v_user uuid; v_role text; v_sale uuid; v_sub numeric := 0; v_paid numeric := 0; v_favor numeric := 0;
  r record; p record; v_producto record; v_stock_disponible numeric; v_pago uuid; v_precio numeric;
  -- REFERIDOS
  v_prog public.programas_referidos; v_eval jsonb; v_desc numeric := 0; v_cred numeric := 0; v_total numeric; v_base numeric := 0;
  v_hay_desc boolean := false; v_excl text[] := '{}'; v_bloquea boolean; v_ref uuid; v_linea numeric;
begin
  select u.id, ro.nombre into v_user, v_role
  from public.usuarios u join public.roles ro on ro.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and (ro.nombre = 'superadmin' or u.empresa_id = p_empresa);
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('ventas', 'crear')) then raise exception 'No autorizado'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Agrega al menos un producto'; end if;

  -- REFERIDOS: programa de la empresa (si existe) y categorías que no cuentan para el beneficio
  select * into v_prog from public.programas_referidos where empresa_id = p_empresa;
  if found then v_excl := coalesce(v_prog.categorias_excluidas, '{}'); end if;

  insert into public.ventas(empresa_id, sucursal_id, paciente_id, cliente_nombre, estado, created_by)
  values (p_empresa, p_sucursal, p_paciente, nullif(p_cliente, ''), 'borrador', v_user) returning id into v_sale;

  for r in select * from jsonb_to_recordset(p_items) as x(producto_id uuid, cantidad numeric, descuento numeric, precio_unitario numeric) loop
    select pr.id, pr.nombre, pr.categoria, pr.precio_venta, pr.controla_inventario into v_producto
    from public.productos_catalogo pr where pr.id = r.producto_id and pr.empresa_id = p_empresa and pr.activo;
    if not found then raise exception 'Producto no disponible'; end if;
    v_precio := coalesce(r.precio_unitario, v_producto.precio_venta);
    if v_precio is null or v_precio < 0 then raise exception 'Precio inválido para "%".', v_producto.nombre; end if;
    if v_producto.controla_inventario and v_producto.categoria in ('montura', 'gafas_sol') and p_sucursal is not null then
      select coalesce(cantidad, 0) into v_stock_disponible from public.inventario_stock where producto_id = v_producto.id and sucursal_id = p_sucursal;
      if coalesce(v_stock_disponible, 0) < r.cantidad then raise exception 'No hay stock de "%" en esta sucursal.', v_producto.nombre; end if;
    end if;
    v_linea := greatest(0, r.cantidad * v_precio - coalesce(r.descuento, 0));
    insert into public.venta_items(venta_id, producto_id, descripcion, cantidad, precio_unitario, descuento, total_linea)
    values (v_sale, v_producto.id, v_producto.nombre, r.cantidad, v_precio, coalesce(r.descuento, 0), v_linea);
    -- REFERIDOS: base elegible y detección de otros descuentos
    if not (v_producto.categoria = any (v_excl)) then v_base := v_base + v_linea; end if;
    if coalesce(r.descuento, 0) > 0 then v_hay_desc := true; end if;
    if v_producto.controla_inventario and p_sucursal is not null then
      insert into public.movimientos_inventario (producto_id, sucursal_id, tipo, cantidad, motivo, venta_id, created_by)
      values (v_producto.id, p_sucursal, 'salida', r.cantidad, 'Venta', v_sale, v_user);
    end if;
  end loop;

  select coalesce(sum(total_linea), 0) into v_sub from public.venta_items where venta_id = v_sale;

  -- REFERIDOS: descuento de bienvenida y/o crédito (misma transacción, antes de validar los pagos)
  v_bloquea := v_hay_desc and not (coalesce(p_autoriza_combinar, false) and v_role in ('superadmin', 'admin_sucursal'));
  if nullif(btrim(coalesce(p_codigo_referido, '')), '') is not null or coalesce(p_usar_credito, 0) > 0 then
    if v_prog.id is null or not v_prog.activo then raise exception 'El programa de referidos no está activo en esta óptica.'; end if;
  end if;
  if nullif(btrim(coalesce(p_codigo_referido, '')), '') is not null then
    v_eval := app_private.evaluar_referido_venta(v_prog.id, p_codigo_referido, p_paciente, v_base, p_es_convenio, v_bloquea);
    if not (v_eval->>'ok')::boolean then raise exception '%', v_eval->>'motivo'; end if;
    v_desc := (v_eval->>'descuento')::numeric;
  end if;
  if coalesce(p_usar_credito, 0) > 0 then
    if p_paciente is null then raise exception 'Elige el paciente para usar su crédito de referidos.'; end if;
    if coalesce(p_es_convenio, false) then raise exception 'Las ventas de convenio (descuento a rol) no participan en el programa de referidos.'; end if;
    if v_bloquea then raise exception 'Esta venta ya tiene descuentos; solo administración puede combinarlos con el crédito de referidos.'; end if;
    perform 1 from public.pacientes_clinicos where id = p_paciente for update;
    v_cred := round(p_usar_credito, 2);
    if v_cred > round(v_base * v_prog.tope_uso_porcentaje / 100, 2) then
      raise exception 'El crédito no puede superar el % %% de la compra (máximo $%).', v_prog.tope_uso_porcentaje, to_char(round(v_base * v_prog.tope_uso_porcentaje / 100, 2), 'FM999990.00');
    end if;
    if v_cred > app_private.saldo_disponible_monedero(v_prog.id, p_paciente) then raise exception 'El paciente no tiene suficiente crédito de referidos disponible.'; end if;
  end if;
  if v_desc + v_cred > v_sub then raise exception 'El descuento y el crédito no pueden superar el total de la compra.'; end if;
  v_total := v_sub - v_desc - v_cred;

  for p in select * from jsonb_to_recordset(p_pagos) as x(metodo text, monto numeric, referencia text, banco text) loop
    if p.monto <= 0 or p.metodo not in ('efectivo', 'transferencia', 'tarjeta', 'credito', 'otro', 'saldo_favor') then raise exception 'Pago inválido'; end if;
    insert into public.pagos_venta(venta_id, metodo, monto, referencia, banco, recibido_por)
    values (v_sale, p.metodo, p.monto, nullif(p.referencia, ''), case when p.metodo = 'saldo_favor' then null else nullif(p.banco, '') end, v_user)
    returning id into v_pago;
    if p.metodo = 'saldo_favor' then
      if p_paciente is null then raise exception 'Elige el paciente para usar su saldo a favor.'; end if;
      v_favor := v_favor + p.monto;
      insert into public.creditos_paciente (paciente_id, empresa_id, monto, tipo, venta_uso_id, pago_id, creado_por)
      values (p_paciente, p_empresa, -p.monto, 'uso', v_sale, v_pago, v_user);
    end if;
    v_paid := v_paid + p.monto;
  end loop;
  if v_paid > v_total then raise exception 'Los pagos no pueden superar el total'; end if;
  if v_favor > 0 then
    perform 1 from public.pacientes_clinicos where id = p_paciente for update;
    if (select coalesce(sum(monto), 0) from public.creditos_paciente where paciente_id = p_paciente and empresa_id = p_empresa) < 0 then
      raise exception 'El paciente no tiene suficiente saldo a favor.';
    end if;
  end if;

  -- REFERIDOS: registrar el referido en pago y gastar el crédito ANTES de completar la venta
  if v_desc > 0 then
    if v_eval->>'referido_existente' is not null then
      update public.referidos set estado = 'en_pago', venta_id = v_sale, descuento_aplicado = v_desc, credito_a_otorgar = v_prog.credito_por_referido,
             vigencia_dias = v_prog.vigencia_credito_dias, reglas = to_jsonb(v_prog), aplicado_en = now()
       where id = (v_eval->>'referido_existente')::uuid returning id into v_ref;
    else
      insert into public.referidos (programa_id, codigo_id, referidor_paciente_id, referido_paciente_id, estado, venta_id, descuento_aplicado, credito_a_otorgar, vigencia_dias, reglas, registrado_por, aplicado_en)
      values (v_prog.id, (v_eval->>'codigo_id')::uuid, (v_eval->>'referidor_id')::uuid, p_paciente, 'en_pago', v_sale, v_desc, v_prog.credito_por_referido, v_prog.vigencia_credito_dias, to_jsonb(v_prog), v_user, now())
      returning id into v_ref;
    end if;
    insert into public.referidos_auditoria (programa_id, evento, paciente_id, referido_id, venta_id, detalle, usuario_id)
    values (v_prog.id, 'descuento_aplicado', p_paciente, v_ref, v_sale, jsonb_build_object('descuento', v_desc), v_user);
  end if;
  if v_cred > 0 then
    perform app_private.consumir_monedero(v_prog.id, p_paciente, v_cred, 'uso', v_sale, 'Crédito usado en venta', v_user);
    insert into public.referidos_auditoria (programa_id, evento, paciente_id, venta_id, detalle, usuario_id)
    values (v_prog.id, 'credito_usado', p_paciente, v_sale, jsonb_build_object('monto', v_cred), v_user);
  end if;

  update public.ventas set subtotal = v_sub, descuento = v_desc + v_cred, total = v_total, pagado = v_paid, saldo = v_total - v_paid, estado = 'completada', actualizado_en = now() where id = v_sale;
  return v_sale;
end;
$function$;
revoke all on function public.registrar_venta(uuid, uuid, text, jsonb, jsonb, uuid, text, numeric, boolean, boolean) from public, anon;
grant execute on function public.registrar_venta(uuid, uuid, text, jsonb, jsonb, uuid, text, numeric, boolean, boolean) to authenticated;
