-- Referidos y recompensas: correcciones de la revisión final (convenio posterior, Consumidor Final, pagos reales,
-- devoluciones, bloqueos y orden estable). Los programas siguen APAGADOS; esta migración no los enciende.
-- Solo reemplaza funciones (misma firma) y crea índices; no borra tablas ni columnas.

-- DB-9: índices para las llaves foráneas que el asesor marcó sin índice.
create index if not exists monedero_venta_idx on public.monedero_movimientos (venta_id) where venta_id is not null;
create index if not exists monedero_referido_idx on public.monedero_movimientos (referido_id) where referido_id is not null;
create index if not exists referidos_codigo_idx on public.referidos (codigo_id);
create index if not exists referidos_referidor_paciente_idx on public.referidos (referidor_paciente_id);
create index if not exists referidos_referido_paciente_idx on public.referidos (referido_paciente_id);
create index if not exists codigos_referido_paciente_idx on public.codigos_referido (paciente_id);
create index if not exists referidos_auditoria_programa_idx on public.referidos_auditoria (programa_id, creado_en desc);
create index if not exists referidos_auditoria_referido_idx on public.referidos_auditoria (referido_id) where referido_id is not null;
create index if not exists referidos_auditoria_venta_idx on public.referidos_auditoria (venta_id) where venta_id is not null;
create index if not exists referidos_auditoria_paciente_idx on public.referidos_auditoria (paciente_id) where paciente_id is not null;

-- DB-3: el Consumidor Final (cédula 9999999999999, una sola fila compartida por las dos ópticas) no tiene código ni monedero.
create or replace function app_private.asegurar_codigo_referido(p_programa uuid, p_paciente uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_prog public.programas_referidos; v_codigo text;
begin
  if exists (select 1 from public.pacientes_clinicos where id = p_paciente and cedula = '9999999999999') then return null; end if;
  select codigo into v_codigo from public.codigos_referido where programa_id = p_programa and paciente_id = p_paciente;
  if v_codigo is not null then return v_codigo; end if;
  select * into v_prog from public.programas_referidos where id = p_programa for update;
  select codigo into v_codigo from public.codigos_referido where programa_id = p_programa and paciente_id = p_paciente;
  if v_codigo is not null then return v_codigo; end if;
  v_codigo := v_prog.prefijo || '-' || lpad(v_prog.siguiente_numero::text, 6, '0');
  insert into public.codigos_referido (programa_id, paciente_id, codigo) values (p_programa, p_paciente, v_codigo);
  update public.programas_referidos set siguiente_numero = siguiente_numero + 1 where id = p_programa;
  return v_codigo;
end $$;
revoke all on function app_private.asegurar_codigo_referido(uuid, uuid) from public, anon, authenticated;

-- DB-3: sin código para el Consumidor Final (asegurar_codigo_referido devuelve null y aquí se propaga tal cual).
create or replace function public.obtener_codigo_referido(p_paciente uuid, p_empresa uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_prog public.programas_referidos;
begin
  if public.rol_referidos(p_empresa) is null then raise exception 'No autorizado'; end if;
  select * into v_prog from public.programas_referidos where empresa_id = p_empresa;
  if not found or not v_prog.activo then return null; end if;
  if not exists (select 1 from public.paciente_empresas where paciente_id = p_paciente and empresa_id = p_empresa) then
    raise exception 'El paciente no pertenece a esta óptica.';
  end if;
  if exists (select 1 from public.pacientes_clinicos where id = p_paciente and cedula = '9999999999999') then return null; end if;
  return app_private.asegurar_codigo_referido(v_prog.id, p_paciente);
end $$;
revoke all on function public.obtener_codigo_referido(uuid, uuid) from public, anon;
grant execute on function public.obtener_codigo_referido(uuid, uuid) to authenticated;

-- DB-3 y DB-8: el Consumidor Final no participa y no se permiten referidos mutuos.
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
  if a.cedula = '9999999999999' or b.cedula = '9999999999999' then
    return jsonb_build_object('ok', false, 'motivo', 'El consumidor final no participa en el programa de referidos.');
  end if;
  v_tel_a := nullif(regexp_replace(coalesce(a.telefono, ''), '\D', '', 'g'), '');
  v_tel_b := nullif(regexp_replace(coalesce(b.telefono, ''), '\D', '', 'g'), '');
  if (v_tel_a is not null and v_tel_a = v_tel_b)
     or b.responsable_id = a.id or a.responsable_id = b.id
     or (a.responsable_id is not null and a.responsable_id = b.responsable_id) then
    return jsonb_build_object('ok', false, 'motivo', 'No se puede usar el código de alguien de la misma cuenta o con el mismo teléfono.');
  end if;
  if exists (select 1 from public.referidos x
              where x.programa_id = p_programa and x.referidor_paciente_id = p_paciente and x.referido_paciente_id = c.paciente_id and x.estado <> 'revertido') then
    return jsonb_build_object('ok', false, 'motivo', 'No se permiten referidos mutuos entre dos personas.');
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

-- DB-5: con presupuesto mensual, las evaluaciones se serializan sobre la fila del programa antes de leer el costo del mes
-- (el candado lo conserva la transacción de registrar_venta hasta el commit). "for no key update" bloquea a otra evaluación
-- igual que "for update", pero no choca con el KEY SHARE de quien inserta referidos/movimientos del mismo programa.
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
  if v_prog.presupuesto_mensual is not null then
    perform 1 from public.programas_referidos where id = p_programa for no key update;
    if app_private.costo_mes_programa(p_programa) + v_desc > v_prog.presupuesto_mensual then
      return jsonb_build_object('ok', false, 'motivo', 'Se alcanzó el presupuesto promocional del mes para este programa.');
    end if;
  end if;
  return v_par || jsonb_build_object('ok', true, 'descuento', v_desc, 'credito', v_prog.credito_por_referido);
end $$;
revoke all on function app_private.evaluar_referido_venta(uuid, text, uuid, numeric, boolean, boolean) from public, anon, authenticated;

-- DB-3 y DB-10: la tarjeta tolera un paciente sin código y los movimientos salen en un orden estable.
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
    'movimientos', coalesce((select jsonb_agg(to_jsonb(x) - 'id' order by x.creado_en desc, x.id desc) from (
                      select m.id, m.tipo, m.monto, m.vence_en, m.motivo, m.creado_en,
                             (select btrim(pc.nombres || ' ' || pc.apellidos) from public.referidos rf join public.pacientes_clinicos pc on pc.id = rf.referido_paciente_id where rf.id = m.referido_id) as referido
                        from public.monedero_movimientos m
                       where m.programa_id = v_prog.id and m.paciente_id = p_paciente
                       order by m.creado_en desc, m.id desc limit 50) x), '[]'::jsonb)
  );
end $$;
revoke all on function public.estado_monedero(uuid, uuid) from public, anon;
grant execute on function public.estado_monedero(uuid, uuid) to authenticated;

-- DB-1, DB-4 y DB-6: recompensa solo si la venta no pasó a convenio y los pagos registrados cubren el total.
create or replace function app_private.otorgar_recompensa(p_referido uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.referidos; v_prog public.programas_referidos; v_cuenta integer; v_hito integer; v_bono numeric;
begin
  select * into r from public.referidos where id = p_referido and estado = 'en_pago' for update;
  if not found then return; end if;
  -- DB-1: una venta que se volvió convenio después de registrada no da recompensa ni cuenta para bonos.
  if exists (select 1 from public.acuerdos_pago where venta_id = r.venta_id and modalidad = 'convenio') then
    update public.referidos set estado = 'rechazado', motivo_rechazo = 'venta de convenio' where id = r.id;
    insert into public.referidos_auditoria (programa_id, evento, paciente_id, referido_id, venta_id, detalle)
    values (r.programa_id, 'recompensa_rechazada_convenio', r.referidor_paciente_id, r.id, r.venta_id, jsonb_build_object('motivo', 'venta de convenio'));
    return;
  end if;
  -- DB-4: no se confía solo en ventas.pagado (el personal puede escribirlo); los pagos registrados deben cubrir el total.
  if not coalesce((select coalesce(sum(pv.monto), 0) from public.pagos_venta pv where pv.venta_id = r.venta_id)
                  >= (select v.total from public.ventas v where v.id = r.venta_id) - 0.005, false) then
    insert into public.referidos_auditoria (programa_id, evento, paciente_id, referido_id, venta_id, detalle)
    values (r.programa_id, 'recompensa_bloqueada_pagos', r.referidor_paciente_id, r.id, r.venta_id,
            jsonb_build_object('pagos_registrados', coalesce((select sum(pv.monto) from public.pagos_venta pv where pv.venta_id = r.venta_id), 0),
                               'total', (select v.total from public.ventas v where v.id = r.venta_id)));
    return;
  end if;
  -- Bloquea al referidor: dos recompensas simultáneas no pueden contar el mismo total y saltarse el bono.
  perform 1 from public.pacientes_clinicos where id = r.referidor_paciente_id for no key update;
  select * into v_prog from public.programas_referidos where id = r.programa_id;
  if v_prog.recompensas_suspendidas then
    insert into public.referidos_auditoria (programa_id, evento, paciente_id, referido_id, venta_id, detalle)
    values (r.programa_id, 'recompensa_en_espera', r.referidor_paciente_id, r.id, r.venta_id, jsonb_build_object('motivo', 'recompensas suspendidas'));
    return;
  end if;
  if r.credito_a_otorgar > 0 then
    insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, vence_en, referido_id, venta_id)
    values (r.programa_id, r.referidor_paciente_id, 'credito', r.credito_a_otorgar,
            now() + make_interval(days => coalesce(r.vigencia_dias, v_prog.vigencia_credito_dias)), r.id, r.venta_id)
    on conflict do nothing;
  end if;
  update public.referidos set estado = 'recompensado', pagado_en = now() where id = r.id;
  select count(*) into v_cuenta from public.referidos
   where programa_id = r.programa_id and referidor_paciente_id = r.referidor_paciente_id and estado = 'recompensado';
  foreach v_hito in array array[3, 5] loop
    if v_cuenta >= v_hito then
      v_bono := case v_hito when 3 then v_prog.bono_3_referidos else v_prog.bono_5_referidos end;
      if v_bono > 0 then
        insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, vence_en, referido_id, hito, venta_id)
        values (r.programa_id, r.referidor_paciente_id, 'bono_hito', v_bono, now() + make_interval(days => v_prog.vigencia_credito_dias), r.id, v_hito, r.venta_id)
        on conflict do nothing;
      end if;
    end if;
  end loop;
  insert into public.referidos_auditoria (programa_id, evento, paciente_id, referido_id, venta_id, detalle)
  values (r.programa_id, 'recompensa_otorgada', r.referidor_paciente_id, r.id, r.venta_id, jsonb_build_object('credito', r.credito_a_otorgar, 'exitosos', v_cuenta));
end $$;
revoke all on function app_private.otorgar_recompensa(uuid) from public, anon, authenticated;

-- Reproceso al reanudar: solo cuenta lo que de verdad quedó recompensado (otorgar_recompensa puede rechazar o bloquear).
create or replace function app_private.procesar_recompensas_pendientes(p_programa uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; v_n integer := 0;
begin
  for r in
    select rf.id from public.referidos rf join public.ventas v on v.id = rf.venta_id
     where rf.programa_id = p_programa and rf.estado = 'en_pago' and v.estado = 'completada' and v.saldo <= 0 and v.pagado >= v.total
  loop
    perform app_private.otorgar_recompensa(r.id);
    if exists (select 1 from public.referidos where id = r.id and estado = 'recompensado') then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;
revoke all on function app_private.procesar_recompensas_pendientes(uuid) from public, anon, authenticated;

-- DB-2 y DB-6: la devolución del crédito usado en una venta anulada no incluye lotes revertidos (aunque ya estuvieran
-- gastados del todo) ni lotes vencidos, y vence cuando vence el primero de los lotes devueltos.
create or replace function app_private.revertir_referido_venta(p_venta uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.referidos; l record; u record; v_cuenta integer; v_hito integer; v_no_recuperado numeric;
begin
  for r in select * from public.referidos where venta_id = p_venta and estado in ('en_pago', 'recompensado') for update loop
    v_no_recuperado := 0;
    -- Bloquea al referidor antes de leer lo que queda de cada lote (evita revertir en paralelo a un gasto).
    perform 1 from public.pacientes_clinicos where id = r.referidor_paciente_id for no key update;
    if r.estado = 'recompensado' then
      for l in
        select m.id, m.monto, sum(x.monto) as restante, coalesce(-sum(x.monto) filter (where x.tipo = 'uso'), 0) as gastado
        from public.monedero_movimientos m join public.monedero_movimientos x on x.id = m.id or x.lote_id = m.id
        where m.referido_id = r.id and m.tipo = 'credito'
        group by m.id, m.monto
      loop
        if l.restante > 0 then
          insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, lote_id, venta_id, motivo)
          values (r.programa_id, r.referidor_paciente_id, 'reversa', -l.restante, l.id, p_venta, 'Venta del referido anulada') on conflict do nothing;
        end if;
        v_no_recuperado := v_no_recuperado + l.gastado;
      end loop;
    end if;
    update public.referidos set estado = 'revertido' where id = r.id;

    -- Bonos por hito que ya no corresponden con los referidos que siguen vigentes
    select count(*) into v_cuenta from public.referidos
     where programa_id = r.programa_id and referidor_paciente_id = r.referidor_paciente_id and estado = 'recompensado';
    foreach v_hito in array array[3, 5] loop
      if v_cuenta < v_hito then
        for l in
          select m.id, m.monto, sum(x.monto) as restante, coalesce(-sum(x.monto) filter (where x.tipo = 'uso'), 0) as gastado
          from public.monedero_movimientos m join public.monedero_movimientos x on x.id = m.id or x.lote_id = m.id
          where m.programa_id = r.programa_id and m.paciente_id = r.referidor_paciente_id and m.tipo = 'bono_hito' and m.hito = v_hito
            and not exists (select 1 from public.monedero_movimientos z where z.lote_id = m.id and z.tipo = 'reversa')
          group by m.id, m.monto
        loop
          if l.restante > 0 then
            insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, lote_id, venta_id, motivo)
            values (r.programa_id, r.referidor_paciente_id, 'reversa', -l.restante, l.id, p_venta, 'Bono por hito ya no corresponde') on conflict do nothing;
          end if;
          v_no_recuperado := v_no_recuperado + l.gastado;
        end loop;
      end if;
    end loop;

    insert into public.referidos_auditoria (programa_id, evento, paciente_id, referido_id, venta_id, detalle)
    values (r.programa_id, 'referido_revertido', r.referidor_paciente_id, r.id, p_venta, jsonb_build_object('no_recuperado', v_no_recuperado));
    if v_no_recuperado > 0 then
      insert into public.referidos_auditoria (programa_id, evento, paciente_id, referido_id, venta_id, detalle)
      values (r.programa_id, 'reversa_incompleta', r.referidor_paciente_id, r.id, p_venta, jsonb_build_object('no_recuperado', v_no_recuperado, 'nota', 'El crédito ya se había gastado; revisar con la superadministradora.'));
    end if;
  end loop;

  -- Crédito que quien compró usó en la venta anulada: vuelve al monedero salvo lo que viene de un lote revertido o ya vencido.
  for u in
    select q.programa_id, q.paciente_id,
           -sum(q.monto) as total,
           -coalesce(sum(q.monto) filter (where q.clase = 'revertido'), 0) as revertido,
           -coalesce(sum(q.monto) filter (where q.clase = 'vencido'), 0) as vencido,
           -coalesce(sum(q.monto) filter (where q.clase = 'ok'), 0) as devolvible,
           min(q.vence_en) filter (where q.clase = 'ok') as vence
    from (
      select x.programa_id, x.paciente_id, x.monto, lt.vence_en,
             case
               when exists (select 1 from public.monedero_movimientos z where z.lote_id = lt.id and z.tipo = 'reversa')
                 or (lt.tipo = 'credito' and exists (select 1 from public.referidos rf where rf.id = lt.referido_id and rf.estado = 'revertido'))
                 or (lt.tipo = 'bono_hito' and (select count(*) from public.referidos rf
                                                 where rf.programa_id = lt.programa_id and rf.referidor_paciente_id = lt.paciente_id and rf.estado = 'recompensado') < lt.hito)
                 then 'revertido'
               when lt.vence_en <= now() then 'vencido'
               else 'ok'
             end as clase
      from public.monedero_movimientos x join public.monedero_movimientos lt on lt.id = x.lote_id
      where x.venta_id = p_venta and x.tipo = 'uso'
    ) q
    group by q.programa_id, q.paciente_id
  loop
    if u.revertido > 0 then
      insert into public.referidos_auditoria (programa_id, evento, paciente_id, venta_id, detalle)
      values (u.programa_id, 'credito_no_devuelto', u.paciente_id, p_venta,
              jsonb_build_object('monto', u.revertido, 'motivo', 'el crédito de origen ya fue revertido'));
    end if;
    if u.vencido > 0 then
      insert into public.referidos_auditoria (programa_id, evento, paciente_id, venta_id, detalle)
      values (u.programa_id, 'credito_vencido_no_devuelto', u.paciente_id, p_venta, jsonb_build_object('monto', u.vencido));
    end if;
    if u.devolvible > 0 then
      insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, vence_en, venta_id, motivo)
      values (u.programa_id, u.paciente_id, 'devolucion', u.devolvible, u.vence, p_venta, 'Venta anulada: se devuelve el crédito usado') on conflict do nothing;
    end if;
  end loop;
end $$;
revoke all on function app_private.revertir_referido_venta(uuid) from public, anon, authenticated;

-- DB-7: una venta saldada sin pago completo (canje) deja sus referidos "en_pago" en rechazado; la rama de pago completo no cambia.
create or replace function app_private.trg_ventas_referidos()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if new.estado = 'completada' and new.saldo <= 0 and new.pagado >= new.total and (old.estado is distinct from 'completada' or old.saldo > 0) then
    for r in select id from public.referidos where venta_id = new.id and estado = 'en_pago' loop
      perform app_private.otorgar_recompensa(r.id);
    end loop;
  elsif new.estado = 'completada' and new.saldo <= 0 and new.pagado < new.total and (old.estado is distinct from 'completada' or old.saldo > 0) then
    for r in select id, programa_id, referidor_paciente_id from public.referidos where venta_id = new.id and estado = 'en_pago' for update loop
      update public.referidos set estado = 'rechazado', motivo_rechazo = 'venta saldada sin pago completo (canje)' where id = r.id;
      insert into public.referidos_auditoria (programa_id, evento, paciente_id, referido_id, venta_id, detalle)
      values (r.programa_id, 'recompensa_rechazada_canje', r.referidor_paciente_id, r.id, new.id,
              jsonb_build_object('pagado', new.pagado, 'total', new.total));
    end loop;
  elsif new.estado = 'anulada' and old.estado is distinct from 'anulada' then
    perform app_private.revertir_referido_venta(new.id);
  end if;
  return new;
end $$;
revoke all on function app_private.trg_ventas_referidos() from public, anon, authenticated;
-- (El trigger trg_ventas_referidos ya existe y apunta a esta función; no se recrea para no tomar un candado exclusivo sobre ventas.)

-- DB-6: el cron de vencimientos bloquea al paciente sin chocar con quien inserta ventas o movimientos de ese paciente.
create or replace function public.vencer_creditos_referidos()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_resta numeric;
  v_row integer;
  v_n integer := 0;
begin
  for r in
    select l.id, l.programa_id, l.paciente_id
    from public.monedero_movimientos l
    join public.monedero_movimientos m on m.id = l.id or m.lote_id = l.id
    where l.monto > 0 and l.vence_en <= now()
    group by l.id, l.programa_id, l.paciente_id
    having sum(m.monto) > 0
    order by l.id
  loop
    perform 1 from public.pacientes_clinicos where id = r.paciente_id for no key update;
    select sum(m.monto) into v_resta
    from public.monedero_movimientos m
    where m.id = r.id or m.lote_id = r.id;
    if coalesce(v_resta, 0) > 0 then
      insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, lote_id, motivo)
      values (r.programa_id, r.paciente_id, 'vencimiento', -v_resta, r.id, 'Crédito vencido')
      on conflict do nothing;
      get diagnostics v_row = row_count;
      v_n := v_n + v_row;
    end if;
  end loop;
  return v_n;
end $$;
revoke all on function public.vencer_creditos_referidos() from public, anon, authenticated;
grant execute on function public.vencer_creditos_referidos() to service_role;

-- DB-6: ajustes manuales con el mismo candado más liviano.
create or replace function public.ajustar_monedero(p_programa uuid, p_paciente uuid, p_monto numeric, p_motivo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_prog public.programas_referidos; v_user uuid; v_consumido numeric;
begin
  if not public.es_superadmin() then raise exception 'Solo la Superadministradora puede ajustar un monedero.'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Indica el motivo del ajuste (mínimo 5 caracteres).'; end if;
  if p_monto is null or p_monto = 0 then raise exception 'El monto del ajuste no puede ser cero.'; end if;
  select * into v_prog from public.programas_referidos where id = p_programa;
  if not found then raise exception 'Programa no encontrado.'; end if;
  if not exists (select 1 from public.paciente_empresas where paciente_id = p_paciente and empresa_id = v_prog.empresa_id) then
    raise exception 'El paciente no pertenece a esta óptica.';
  end if;
  select id into v_user from public.usuarios where auth_user_id = (select auth.uid()) and activo;
  perform 1 from public.pacientes_clinicos where id = p_paciente for no key update;
  if p_monto > 0 then
    insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, vence_en, motivo, creado_por)
    values (p_programa, p_paciente, 'ajuste', round(p_monto, 2), now() + make_interval(days => v_prog.vigencia_credito_dias), btrim(p_motivo), v_user);
  else
    v_consumido := app_private.consumir_monedero(p_programa, p_paciente, -p_monto, 'ajuste', null, btrim(p_motivo), v_user);
    if v_consumido < round(-p_monto, 2) then
      raise exception 'El paciente solo tiene $% disponible.', to_char(v_consumido, 'FM999990.00');
    end if;
  end if;
  insert into public.referidos_auditoria (programa_id, evento, paciente_id, detalle, usuario_id)
  values (p_programa, 'ajuste_manual', p_paciente, jsonb_build_object('monto', round(p_monto, 2), 'motivo', btrim(p_motivo)), v_user);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.ajustar_monedero(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.ajustar_monedero(uuid, uuid, numeric, text) to authenticated;

-- DB-6: registrar_venta (solo cambia el candado del paciente en la ruta del crédito; ver el bloque marcado "REFERIDOS (correcciones)").
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
    -- REFERIDOS (correcciones): "for no key update" no choca con el KEY SHARE de las filas que se insertan sobre este paciente, y si
    -- también hay un referidor se bloquean los dos pacientes juntos y en orden de id (dos ventas que se citan entre sí no se traban).
    if v_eval is not null and (v_eval->>'referidor_id') is not null then
      perform 1 from public.pacientes_clinicos where id in (p_paciente, (v_eval->>'referidor_id')::uuid) order by id for no key update;
    else
      perform 1 from public.pacientes_clinicos where id = p_paciente for no key update;
    end if;
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

  -- REFERIDOS: registrar el referido en pago (siempre que se evaluó un código, aunque el descuento sea 0) y gastar el crédito ANTES de completar la venta
  if v_eval is not null then
    if v_eval->>'referido_existente' is not null then
      update public.referidos set estado = 'en_pago', venta_id = v_sale, descuento_aplicado = v_desc, credito_a_otorgar = v_prog.credito_por_referido,
             vigencia_dias = v_prog.vigencia_credito_dias, reglas = to_jsonb(v_prog), aplicado_en = now()
       where id = (v_eval->>'referido_existente')::uuid and estado = 'registrado' and venta_id is null returning id into v_ref;
      if v_ref is null then raise exception 'Este paciente ya usó el beneficio de primera compra.'; end if;
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
