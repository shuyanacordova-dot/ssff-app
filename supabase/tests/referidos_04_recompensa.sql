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

  -- D4c: un canje (la superadministradora deja el saldo en 0 sin que entre dinero) NO dispara la recompensa: exige venta 100 %% pagada
  declare cano uuid; cano_cod text; cora uuid; s_cora uuid;
  begin
    cano := pg_temp.paciente('Cano', '0993000060', v_focus, v_sf);
    select codigo into cano_cod from public.codigos_referido where programa_id = v_prog and paciente_id = cano;
    cora := pg_temp.paciente('Cora', '0993000061', v_focus, v_sf);
    s_cora := pg_temp.vender(v_focus, v_sf, vf, cora, cano_cod, 150, 100);   -- total 135, pagó 100, saldo 35
    perform set_config('request.jwt.claims', json_build_object('sub', su, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.registrar_canje_venta(s_cora, 35, 'Prueba de canje del saldo');
    reset role;
    if (select saldo from public.ventas where id = s_cora) <> 0 or (select pagado from public.ventas where id = s_cora) <> 100 then
      raise exception 'FALLO D4c-a: el canje debía dejar saldo 0 con pagado 100 (saldo %, pagado %)', (select saldo from public.ventas where id = s_cora), (select pagado from public.ventas where id = s_cora);
    end if;
    -- Corrección DB-7 (migración 6): un canje ya no deja el referido "en_pago" para siempre; queda "rechazado" (antes se esperaba 'en_pago').
    if (select estado from public.referidos where venta_id = s_cora) <> 'rechazado' or exists (select 1 from public.monedero_movimientos where paciente_id = cano) then
      raise exception 'FALLO D4c-b: un canje no debe otorgar la recompensa y el referido debe quedar rechazado';
    end if;
    if app_private.procesar_recompensas_pendientes(v_prog) <> 0 or (select estado from public.referidos where venta_id = s_cora) <> 'rechazado' then
      raise exception 'FALLO D4c-c: el reproceso de pendientes otorgó una venta canjeada';
    end if;
  end;

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
    -- D10: el crédito que Rafa usó salió de un lote que D9 ya revirtió: NO se devuelve; queda marcado en auditoría
    perform set_config('request.jwt.claims', json_build_object('sub', su, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.anular_venta_con_modo(sgasto, 'Prueba de anulación con crédito usado', 'credito');
    reset role;
    if exists (select 1 from public.monedero_movimientos where paciente_id = ra and tipo = 'devolucion') then raise exception 'FALLO D10a: se devolvió crédito de un lote ya revertido'; end if;
    if not exists (select 1 from public.referidos_auditoria where evento = 'credito_no_devuelto' and paciente_id = ra and venta_id = sgasto and (detalle->>'monto')::numeric = 4) then
      raise exception 'FALLO D10b: falta la marca credito_no_devuelto ($4)';
    end if;
    if app_private.saldo_disponible_monedero(v_prog, ra) <> 0 then raise exception 'FALLO D10c: saldo de Rafa %', app_private.saldo_disponible_monedero(v_prog, ra); end if;
  end;


  -- D12: camino feliz de la devolución: Rosa gana $10, gasta $4, anula esa compra: vuelve exactamente $4 (una sola devolución)
  declare r2 uuid; cr2 text; r2b uuid; sr2b uuid; sg2 uuid;
  begin
    r2 := pg_temp.paciente('Rosa', '0993000070', v_focus, v_sf);
    select codigo into cr2 from public.codigos_referido where programa_id = v_prog and paciente_id = r2;
    r2b := pg_temp.paciente('Rolo', '0993000071', v_focus, v_sf);
    sr2b := pg_temp.vender(v_focus, v_sf, vf, r2b, cr2, 150, 135);
    sg2 := pg_temp.vender(v_focus, v_sf, vf, r2, null, 100, 96, 4);
    if app_private.saldo_disponible_monedero(v_prog, r2) <> 6 then raise exception 'FALLO D12a: saldo tras gastar %', app_private.saldo_disponible_monedero(v_prog, r2); end if;
    perform set_config('request.jwt.claims', json_build_object('sub', su, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.anular_venta_con_modo(sg2, 'Prueba de anulación con crédito usado', 'credito');
    reset role;
    if (select count(*) from public.monedero_movimientos where paciente_id = r2 and tipo = 'devolucion') <> 1
       or (select monto from public.monedero_movimientos where paciente_id = r2 and tipo = 'devolucion') <> 4 then
      raise exception 'FALLO D12b: debía haber una sola devolución de $4';
    end if;
    if app_private.saldo_disponible_monedero(v_prog, r2) <> 10 then raise exception 'FALLO D12c: saldo final %', app_private.saldo_disponible_monedero(v_prog, r2); end if;
    if exists (select 1 from public.referidos_auditoria where paciente_id = r2 and evento in ('credito_no_devuelto', 'reversa_incompleta')) then raise exception 'FALLO D12d: no debía quedar ninguna marca'; end if;
  end;

  -- D13: segunda anulación del mismo referidor: el bono de 3 se revierte una sola vez y no se marca "reversa incompleta"
  declare r3 uuid; cr3 text; q1 uuid; q2 uuid; q3 uuid; sq1 uuid; sq2 uuid; sq3 uuid; bono3 uuid;
  begin
    r3 := pg_temp.paciente('Remi', '0993000080', v_focus, v_sf);
    select codigo into cr3 from public.codigos_referido where programa_id = v_prog and paciente_id = r3;
    q1 := pg_temp.paciente('Quim1', '0993000081', v_focus, v_sf);
    sq1 := pg_temp.vender(v_focus, v_sf, vf, q1, cr3, 150, 135);
    q2 := pg_temp.paciente('Quim2', '0993000082', v_focus, v_sf);
    sq2 := pg_temp.vender(v_focus, v_sf, vf, q2, cr3, 150, 135);
    q3 := pg_temp.paciente('Quim3', '0993000083', v_focus, v_sf);
    sq3 := pg_temp.vender(v_focus, v_sf, vf, q3, cr3, 150, 135);
    select id into bono3 from public.monedero_movimientos where paciente_id = r3 and tipo = 'bono_hito' and hito = 3;
    if bono3 is null then raise exception 'FALLO D13a: no se otorgó el bono de 3'; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', su, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.anular_venta_con_modo(sq1, 'Prueba primera anulación', 'credito');
    reset role;
    if (select count(*) from public.monedero_movimientos where lote_id = bono3 and tipo = 'reversa') <> 1 then raise exception 'FALLO D13b: el bono no se revirtió al bajar a 2'; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', su, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.anular_venta_con_modo(sq2, 'Prueba segunda anulación', 'credito');
    reset role;
    if (select count(*) from public.monedero_movimientos where lote_id = bono3 and tipo = 'reversa') <> 1 then raise exception 'FALLO D13c: el bono tiene más de una reversa'; end if;
    if exists (select 1 from public.referidos_auditoria where paciente_id = r3 and evento = 'reversa_incompleta') then
      raise exception 'FALLO D13d: se marcó reversa incompleta sin que nada se hubiera gastado';
    end if;
    if app_private.saldo_disponible_monedero(v_prog, r3) <> 10 then raise exception 'FALLO D13e: saldo %', app_private.saldo_disponible_monedero(v_prog, r3); end if;
  end;

  -- D14: anular la venta de un referido que sigue "en_pago": queda revertido y no se mueve el monedero
  declare r4 uuid; cr4 text; q4 uuid; sq4 uuid;
  begin
    r4 := pg_temp.paciente('Reno', '0993000090', v_focus, v_sf);
    select codigo into cr4 from public.codigos_referido where programa_id = v_prog and paciente_id = r4;
    q4 := pg_temp.paciente('Quino', '0993000091', v_focus, v_sf);
    sq4 := pg_temp.vender(v_focus, v_sf, vf, q4, cr4, 150, 100);
    if (select estado from public.referidos where venta_id = sq4) <> 'en_pago' then raise exception 'FALLO D14a: el referido debía seguir en_pago'; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', su, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.anular_venta_con_modo(sq4, 'Prueba de anulación en pago', 'credito');
    reset role;
    if (select estado from public.referidos where venta_id = sq4) <> 'revertido' then raise exception 'FALLO D14b: no quedó revertido'; end if;
    if exists (select 1 from public.monedero_movimientos where paciente_id = r4) then raise exception 'FALLO D14c: se movió el monedero'; end if;
    if exists (select 1 from public.referidos_auditoria where paciente_id = r4 and evento = 'reversa_incompleta') then raise exception 'FALLO D14d: marca de reversa incompleta indebida'; end if;
  end;

  -- D15: bono de 3 gastado en parte: al bajar a 2 referidos se revierte solo lo no gastado y lo gastado queda marcado
  declare r5 uuid; cr5 text; q5a uuid; q5b uuid; q5c uuid; sq5a uuid; sq5b uuid; sq5c uuid; bono5 uuid; cred5a uuid; v_vig integer;
  begin
    select vigencia_credito_dias into v_vig from public.programas_referidos where id = v_prog;
    r5 := pg_temp.paciente('Remy', '0993000100', v_focus, v_sf);
    select codigo into cr5 from public.codigos_referido where programa_id = v_prog and paciente_id = r5;
    -- Los créditos de los referidos vencen a 120 días y el bono a 60: el bono es lo primero que se gasta.
    update public.programas_referidos set vigencia_credito_dias = 120 where id = v_prog;
    q5a := pg_temp.paciente('Quil1', '0993000101', v_focus, v_sf);
    sq5a := pg_temp.vender(v_focus, v_sf, vf, q5a, cr5, 150, 135);
    q5b := pg_temp.paciente('Quil2', '0993000102', v_focus, v_sf);
    sq5b := pg_temp.vender(v_focus, v_sf, vf, q5b, cr5, 150, 135);
    q5c := pg_temp.paciente('Quil3', '0993000103', v_focus, v_sf);
    sq5c := pg_temp.vender(v_focus, v_sf, vf, q5c, cr5, 150, 100);
    update public.programas_referidos set vigencia_credito_dias = 60 where id = v_prog;
    perform set_config('request.jwt.claims', json_build_object('sub', vf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.registrar_abono_venta(sq5c, 'efectivo', 35);
    reset role;
    update public.programas_referidos set vigencia_credito_dias = v_vig where id = v_prog;
    select id into bono5 from public.monedero_movimientos where paciente_id = r5 and tipo = 'bono_hito' and hito = 3;
    if bono5 is null then raise exception 'FALLO D15a: no se otorgó el bono de 3'; end if;
    perform pg_temp.vender(v_focus, v_sf, vf, r5, null, 100, 95, 5);
    if (select -sum(monto) from public.monedero_movimientos where lote_id = bono5 and tipo = 'uso') <> 5 then raise exception 'FALLO D15b: debía gastar $5 del bono (el que vence primero)'; end if;
    select id into cred5a from public.monedero_movimientos where referido_id = (select id from public.referidos where venta_id = sq5a) and tipo = 'credito';
    perform set_config('request.jwt.claims', json_build_object('sub', su, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.anular_venta_con_modo(sq5a, 'Prueba de bono gastado en parte', 'credito');
    reset role;
    if (select -monto from public.monedero_movimientos where lote_id = bono5 and tipo = 'reversa') <> 10 then raise exception 'FALLO D15c: la reversa del bono debía ser lo no gastado ($10)'; end if;
    if (select -monto from public.monedero_movimientos where lote_id = cred5a and tipo = 'reversa') <> 10 then raise exception 'FALLO D15d: reversa del crédito del referido'; end if;
    if not exists (select 1 from public.referidos_auditoria where evento = 'reversa_incompleta' and referido_id = (select id from public.referidos where venta_id = sq5a) and (detalle->>'no_recuperado')::numeric = 5) then
      raise exception 'FALLO D15e: no_recuperado debía ser $5 (lo gastado del bono)';
    end if;
    if app_private.saldo_disponible_monedero(v_prog, r5) <> 20 then raise exception 'FALLO D15f: saldo %', app_private.saldo_disponible_monedero(v_prog, r5); end if;
    if (select coalesce(sum(monto), 0) from public.monedero_movimientos where paciente_id = r5) < 0 then raise exception 'FALLO D15g: saldo negativo'; end if;
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
    -- 6 créditos + 2 bonos + 2 ajustes + el uso de $15 (puede venir partido en varias filas si salió de más de un lote)
    if (select count(*) from jsonb_array_elements(j->'movimientos') x where x->>'tipo' = 'credito') <> 6
       or (select count(*) from jsonb_array_elements(j->'movimientos') x where x->>'tipo' = 'bono_hito') <> 2
       or (select count(*) from jsonb_array_elements(j->'movimientos') x where x->>'tipo' = 'ajuste') <> 2
       or (select -sum((x->>'monto')::numeric) from jsonb_array_elements(j->'movimientos') x where x->>'tipo' = 'uso') <> 15
       or jsonb_array_length(j->'movimientos') <> 10 + (select count(*) from jsonb_array_elements(j->'movimientos') x where x->>'tipo' = 'uso') then
      raise exception 'FALLO D11i: movimientos % ', j->'movimientos';
    end if;
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

  raise exception 'PRUEBAS_OK: recompensas, bonos y reversas (D1-D15)';
end $$;
