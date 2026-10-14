do $$
declare
  v_focus uuid := current_setting('t.focus')::uuid;
  v_sf uuid := current_setting('t.suc_focus')::uuid;
  vf uuid := current_setting('t.vend_focus')::uuid;
  su uuid := current_setting('t.su')::uuid;
  v_prog uuid;
  a uuid; b uuid; c uuid; d uuid; e uuid; f uuid; k uuid; ref uuid;
  ca text; s uuid; s2 uuid; n int; v_monto numeric; v_disp numeric; r record; i int;
  lote uuid; v_vence timestamptz;
begin
  select id into v_prog from public.programas_referidos where empresa_id = v_focus;
  a := pg_temp.paciente('Ana', '0993000001', v_focus, v_sf);
  select codigo into ca from public.codigos_referido where programa_id = v_prog and paciente_id = a;

  -- D1: pago parcial no paga nada; el abono final sí, una sola vez, con vencimiento a 60 días
  b := pg_temp.paciente('Beto', '0993000002', v_focus, v_sf);
  s := pg_temp.vender(v_focus, v_sf, vf, b, ca, 150, 100);
  if exists (select 1 from public.monedero_movimientos where paciente_id = a) then raise exception 'FALLO D1a: crédito antes de pagar el 100 %%'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', vf, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.registrar_abono_venta(s, 'efectivo', 35);
  reset role;
  select count(*), max(monto), max(vence_en) into n, v_monto, v_vence from public.monedero_movimientos where paciente_id = a and tipo = 'credito';
  if n <> 1 or v_monto <> 10 then raise exception 'FALLO D1b: crédito %, monto %', n, v_monto; end if;
  if v_vence < now() + interval '59 days' or v_vence > now() + interval '61 days' then raise exception 'FALLO D1c: vencimiento %', v_vence; end if;
  if (select estado from public.referidos where venta_id = s) <> 'recompensado' then raise exception 'FALLO D1d: estado'; end if;

  -- D2: tocar la venta de nuevo no duplica (idempotencia)
  update public.ventas set actualizado_en = now() where id = s;
  select id into ref from public.referidos where venta_id = s;
  perform app_private.otorgar_recompensa(ref);
  select count(*) into n from public.monedero_movimientos where paciente_id = a and tipo = 'credito';
  if n <> 1 then raise exception 'FALLO D2: se duplicó la recompensa (%)', n; end if;

  -- D4 (Review Focus 2): venta pagada completa al registrar dispara la recompensa en el mismo paso
  c := pg_temp.paciente('Carla', '0993000003', v_focus, v_sf);
  s := pg_temp.vender(v_focus, v_sf, vf, c, ca, 150, 135);
  if (select estado from public.referidos where venta_id = s) <> 'recompensado' then raise exception 'FALLO D4a: no se otorgó al pagar todo de una vez'; end if;
  select count(*) into n from public.monedero_movimientos where paciente_id = a and tipo = 'credito';
  if n <> 2 then raise exception 'FALLO D4b: créditos %', n; end if;

  -- D5: bono de 3 referidos ($15) una sola vez; bono de 5 ($25) con el quinto
  d := pg_temp.paciente('Dani', '0993000004', v_focus, v_sf);
  perform pg_temp.vender(v_focus, v_sf, vf, d, ca, 150, 135);
  select count(*), max(monto) into n, v_monto from public.monedero_movimientos where paciente_id = a and tipo = 'bono_hito' and hito = 3;
  if n <> 1 or v_monto <> 15 then raise exception 'FALLO D5a: bono de 3 (% / %)', n, v_monto; end if;
  e := pg_temp.paciente('Eva', '0993000005', v_focus, v_sf);
  perform pg_temp.vender(v_focus, v_sf, vf, e, ca, 150, 135);
  f := pg_temp.paciente('Fer', '0993000006', v_focus, v_sf);
  perform pg_temp.vender(v_focus, v_sf, vf, f, ca, 150, 135);
  select count(*), max(monto) into n, v_monto from public.monedero_movimientos where paciente_id = a and tipo = 'bono_hito';
  if n <> 2 then raise exception 'FALLO D5b: bonos %', n; end if;
  if (select monto from public.monedero_movimientos where paciente_id = a and tipo = 'bono_hito' and hito = 5) <> 25 then raise exception 'FALLO D5c: bono de 5'; end if;
  k := pg_temp.paciente('Kiko', '0993000007', v_focus, v_sf);
  perform pg_temp.vender(v_focus, v_sf, vf, k, ca, 150, 135);
  if (select count(*) from public.monedero_movimientos where paciente_id = a and tipo = 'bono_hito') <> 2 then raise exception 'FALLO D5d: el bono se repitió'; end if;

  -- D6: cambiar la configuración no altera lo ya generado (monto congelado en el referido)
  update public.programas_referidos set credito_por_referido = 10 where id = v_prog;
  declare a2 uuid; ca2 text; g uuid; sg uuid;
  begin
    a2 := pg_temp.paciente('Ana2', '0993000010', v_focus, v_sf);
    select codigo into ca2 from public.codigos_referido where programa_id = v_prog and paciente_id = a2;
    g := pg_temp.paciente('Gabo', '0993000011', v_focus, v_sf);
    sg := pg_temp.vender(v_focus, v_sf, vf, g, ca2, 150, 100);
    update public.programas_referidos set credito_por_referido = 99 where id = v_prog;
    perform set_config('request.jwt.claims', json_build_object('sub', vf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.registrar_abono_venta(sg, 'efectivo', 35);
    reset role;
    if (select monto from public.monedero_movimientos where paciente_id = a2 and tipo = 'credito') <> 10 then raise exception 'FALLO D6: el crédito usó la regla nueva'; end if;
    update public.programas_referidos set credito_por_referido = 10 where id = v_prog;
  end;

  -- D7: recompensas suspendidas dejan el referido "en_pago"; al reanudar se otorgan
  declare a3 uuid; ca3 text; h uuid; sh uuid;
  begin
    a3 := pg_temp.paciente('Ana3', '0993000020', v_focus, v_sf);
    select codigo into ca3 from public.codigos_referido where programa_id = v_prog and paciente_id = a3;
    update public.programas_referidos set recompensas_suspendidas = true where id = v_prog;
    h := pg_temp.paciente('Hugo', '0993000021', v_focus, v_sf);
    sh := pg_temp.vender(v_focus, v_sf, vf, h, ca3, 150, 135);
    if (select estado from public.referidos where venta_id = sh) <> 'en_pago' or exists (select 1 from public.monedero_movimientos where paciente_id = a3) then
      raise exception 'FALLO D7a: se otorgó con recompensas suspendidas';
    end if;
    perform set_config('request.jwt.claims', json_build_object('sub', su, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.guardar_programa_referidos(v_prog, '{"recompensas_suspendidas": false}'::jsonb);
    reset role;
    if (select estado from public.referidos where venta_id = sh) <> 'recompensado' or (select count(*) from public.monedero_movimientos where paciente_id = a3 and tipo = 'credito') <> 1 then
      raise exception 'FALLO D7b: no se otorgó al reanudar';
    end if;
  end;

  -- D8: usar crédito: máximo 20 %% de la compra, nunca más que el saldo, y gasta el lote que vence antes
  declare p uuid; l1 uuid; l2 uuid; sv uuid;
  begin
    p := pg_temp.paciente('Pau', '0993000030', v_focus, v_sf);
    insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, vence_en, motivo)
      values (v_prog, p, 'ajuste', 10, now() + interval '30 days', 'lote largo prueba') returning id into l1;
    insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, vence_en, motivo)
      values (v_prog, p, 'ajuste', 10, now() + interval '5 days', 'lote corto prueba') returning id into l2;
    perform pg_temp.vender_falla('D8a', 'no puede superar', v_focus, v_sf, vf, p, null, 100, 0, 25);
    sv := pg_temp.vender(v_focus, v_sf, vf, p, null, 100, 87, 13);
    select * into r from public.ventas where id = sv;
    if r.descuento <> 13 or r.total <> 87 or r.saldo <> 0 then raise exception 'FALLO D8b: totales % / % / %', r.descuento, r.total, r.saldo; end if;
    if (select -sum(monto) from public.monedero_movimientos where lote_id = l2 and tipo = 'uso') <> 10 or (select -sum(monto) from public.monedero_movimientos where lote_id = l1 and tipo = 'uso') <> 3 then
      raise exception 'FALLO D8c: no gastó primero el lote que vence antes';
    end if;
    if app_private.saldo_disponible_monedero(v_prog, p) <> 7 then raise exception 'FALLO D8d: saldo %', app_private.saldo_disponible_monedero(v_prog, p); end if;
    perform pg_temp.vender_falla('D8e', 'suficiente crédito', v_focus, v_sf, vf, p, null, 200, 0, 8);
    -- D8f: el crédito no entra a caja ni cuenta como cobro: pagado = lo que pagó en efectivo
    if r.pagado <> 87 then raise exception 'FALLO D8f: pagado %', r.pagado; end if;
  end;

  -- D9 (Review Focus 3): anular la venta del referido con el crédito ya gastado
  declare ra uuid; cra text; rb uuid; srb uuid; sgasto uuid; rest numeric;
  begin
    ra := pg_temp.paciente('Rafa', '0993000040', v_focus, v_sf);
    select codigo into cra from public.codigos_referido where programa_id = v_prog and paciente_id = ra;
    rb := pg_temp.paciente('Rita', '0993000041', v_focus, v_sf);
    srb := pg_temp.vender(v_focus, v_sf, vf, rb, cra, 150, 135);          -- Rafa gana $10
    sgasto := pg_temp.vender(v_focus, v_sf, vf, ra, null, 100, 96, 4);   -- Rafa gasta $4
    perform set_config('request.jwt.claims', json_build_object('sub', su, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.anular_venta_con_modo(srb, 'Prueba de anulación del referido', 'credito');
    reset role;
    if (select estado from public.referidos where venta_id = srb) <> 'revertido' then raise exception 'FALLO D9a: el referido no quedó revertido'; end if;
    if (select -monto from public.monedero_movimientos where paciente_id = ra and tipo = 'reversa') <> 6 then raise exception 'FALLO D9b: debía revertirse solo lo no gastado ($6)'; end if;
    if app_private.saldo_disponible_monedero(v_prog, ra) <> 0 then raise exception 'FALLO D9c: saldo distinto de 0'; end if;
    if (select coalesce(sum(monto), 0) from public.monedero_movimientos where paciente_id = ra) < 0 then raise exception 'FALLO D9d: saldo negativo'; end if;
    if not exists (select 1 from public.referidos_auditoria where evento = 'reversa_incompleta' and referido_id = (select id from public.referidos where venta_id = srb) and (detalle->>'no_recuperado')::numeric = 4) then
      raise exception 'FALLO D9e: falta la marca de reversa incompleta ($4 gastados)';
    end if;
    -- D10: anular la venta donde se usó crédito devuelve ese crédito al monedero
    perform set_config('request.jwt.claims', json_build_object('sub', su, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.anular_venta_con_modo(sgasto, 'Prueba de anulación con crédito usado', 'credito');
    reset role;
    if (select monto from public.monedero_movimientos where paciente_id = ra and tipo = 'devolucion') <> 4 then raise exception 'FALLO D10: no se devolvió el crédito usado'; end if;
  end;


  -- D11: public.estado_monedero (la tarjeta que ve el equipo): disponible, pendiente, usado, referidos, movimientos y referido_por
  declare pe uuid; spe uuid; j jsonb; jb jsonb; jp jsonb; el jsonb; prev timestamptz; cur timestamptz; n_ok int := 0; v_rechazo boolean := false;
  begin
    -- Ana ya tiene 6 referidos recompensados ($10 c/u) y los dos bonos ($15 + $25): generó $100. Ahora gasta $15 en una compra.
    perform pg_temp.vender(v_focus, v_sf, vf, a, null, 100, 85, 15);
    -- Un referido más que sigue "en_pago" (paga 100 de 135): su crédito queda pendiente.
    pe := pg_temp.paciente('Pedro', '0993000050', v_focus, v_sf);
    spe := pg_temp.vender(v_focus, v_sf, vf, pe, ca, 150, 100);
    -- Dos ajustes con fecha explícita (dentro de una transacción now() es igual para todo): fijan el orden "más nuevo primero".
    insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, vence_en, motivo, creado_en)
      values (v_prog, a, 'ajuste', 5, now() + interval '30 days', 'ajuste prueba uno', now() + interval '1 day');
    insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, vence_en, motivo, creado_en)
      values (v_prog, a, 'ajuste', 7, now() + interval '30 days', 'ajuste prueba dos', now() + interval '2 days');

    perform set_config('request.jwt.claims', json_build_object('sub', vf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    j := public.estado_monedero(a, v_focus);
    jb := public.estado_monedero(b, v_focus);
    jp := public.estado_monedero(pe, v_focus);
    reset role;

    if (j->>'programa_activo')::boolean is not true or j->>'codigo' <> ca or j->>'prefijo' <> 'FOC' then raise exception 'FALLO D11a: cabecera % ', j; end if;
    if (j->>'disponible')::numeric <> 97 then raise exception 'FALLO D11b: disponible % (se esperaba 100 - 15 + 12 = 97)', j->>'disponible'; end if;
    if (j->>'pendiente')::numeric <> 10 then raise exception 'FALLO D11c: pendiente % (se esperaba 10)', j->>'pendiente'; end if;
    if (j->>'usado')::numeric <> 15 then raise exception 'FALLO D11d: usado % (se esperaba 15)', j->>'usado'; end if;
    if (j->>'generado')::numeric <> 112 then raise exception 'FALLO D11e: generado % (se esperaba 112)', j->>'generado'; end if;
    if (j->>'vencido')::numeric <> 0 then raise exception 'FALLO D11f: vencido %', j->>'vencido'; end if;
    if (j->>'exitosos')::int <> 6 then raise exception 'FALLO D11g: exitosos %', j->>'exitosos'; end if;
    if jsonb_array_length(j->'referidos') <> 7
       or (select count(*) from jsonb_array_elements(j->'referidos') x where x->>'estado' = 'recompensado') <> 6
       or (select count(*) from jsonb_array_elements(j->'referidos') x where x->>'estado' = 'en_pago' and x->>'nombre' = 'ZZ Pedro Prueba' and (x->>'credito')::numeric = 10) <> 1 then
      raise exception 'FALLO D11h: referidos %', j->'referidos';
    end if;
    -- movimientos: 6 créditos + 2 bonos + 1 uso + 2 ajustes = 11, el más nuevo primero
    if jsonb_array_length(j->'movimientos') <> 11 then raise exception 'FALLO D11i: movimientos % (se esperaban 11)', jsonb_array_length(j->'movimientos'); end if;
    if (j->'movimientos'->0->>'tipo') <> 'ajuste' or (j->'movimientos'->0->>'monto')::numeric <> 7 or (j->'movimientos'->1->>'monto')::numeric <> 5 then
      raise exception 'FALLO D11j: no viene el más nuevo primero: % / %', j->'movimientos'->0, j->'movimientos'->1;
    end if;
    prev := null;
    for el in select value from jsonb_array_elements(j->'movimientos') loop
      cur := (el->>'creado_en')::timestamptz;
      if prev is not null and cur > prev then raise exception 'FALLO D11k: movimientos fuera de orden'; end if;
      prev := cur;
    end loop;
    if not exists (select 1 from jsonb_array_elements(j->'movimientos') x where x->>'tipo' = 'uso' and (x->>'monto')::numeric < 0) then raise exception 'FALLO D11l: falta el movimiento de uso'; end if;
    if not exists (select 1 from jsonb_array_elements(j->'movimientos') x where x->>'tipo' = 'credito' and x->>'referido' = 'ZZ Beto Prueba') then raise exception 'FALLO D11m: el crédito no trae el nombre del referido'; end if;
    -- Ana no fue referida por nadie
    if jsonb_typeof(j->'referido_por') <> 'null' then raise exception 'FALLO D11n: Ana no debería tener referido_por (%)', j->'referido_por'; end if;
    -- Beto fue referido por Ana y su venta ya está pagada y recompensada
    if jb->'referido_por'->>'nombre' <> 'ZZ Ana Prueba' or jb->'referido_por'->>'codigo' <> ca or jb->'referido_por'->>'estado' <> 'recompensado' then
      raise exception 'FALLO D11o: referido_por de Beto %', jb->'referido_por';
    end if;
    if (jb->>'disponible')::numeric <> 0 or jsonb_array_length(jb->'referidos') <> 0 or jsonb_array_length(jb->'movimientos') <> 0 then raise exception 'FALLO D11p: monedero de Beto %', jb; end if;
    -- Pedro sigue en pago
    if jp->'referido_por'->>'estado' <> 'en_pago' or jp->'referido_por'->>'codigo' <> ca then raise exception 'FALLO D11q: referido_por de Pedro %', jp->'referido_por'; end if;
    -- Otra empresa no puede mirar el monedero de Focus
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('t.vend_shu'), 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform public.estado_monedero(a, v_focus);
    exception when others then
      v_rechazo := position('no autorizado' in lower(sqlerrm)) > 0;
    end;
    reset role;
    if not v_rechazo then raise exception 'FALLO D11r: otra empresa pudo leer el monedero de Focus'; end if;
  end;

  raise exception 'PRUEBAS_OK: recompensas, bonos y reversas (D1-D11)';
end $$;
