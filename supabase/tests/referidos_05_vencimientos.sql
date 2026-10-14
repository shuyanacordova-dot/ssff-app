do $$
declare
  v_focus uuid := current_setting('t.focus')::uuid;
  v_sf uuid := current_setting('t.suc_focus')::uuid;
  vf uuid := current_setting('t.vend_focus')::uuid;
  su uuid := current_setting('t.su')::uuid;
  v_prog uuid; p uuid; p2 uuid; l_vencido uuid; l_vigente uuid; l_parcial uuid; n int; estado jsonb;
begin
  select id into v_prog from public.programas_referidos where empresa_id = v_focus;
  p := pg_temp.paciente('Vence', '0994000001', v_focus, v_sf);
  insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, vence_en, motivo)
    values (v_prog, p, 'ajuste', 7, now() - interval '1 day', 'lote vencido prueba') returning id into l_vencido;
  insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, vence_en, motivo)
    values (v_prog, p, 'ajuste', 5, now() + interval '10 days', 'lote vigente prueba') returning id into l_vigente;

  -- E2 (Review Focus 5): el crédito vencido que el cron aún no procesó no se puede usar
  if app_private.saldo_disponible_monedero(v_prog, p) <> 5 then raise exception 'FALLO E2a: el saldo cuenta lo vencido (%)', app_private.saldo_disponible_monedero(v_prog, p); end if;
  perform pg_temp.vender_falla('E2b', 'suficiente crédito', v_focus, v_sf, vf, p, null, 200, 0, 8);

  -- E3: el cron anota el vencimiento una sola vez y no toca el lote vigente
  n := public.vencer_creditos_referidos();
  if n < 1 then raise exception 'FALLO E3a: no procesó vencimientos (%)', n; end if;
  if (select count(*) from public.monedero_movimientos where lote_id = l_vencido and tipo = 'vencimiento' and monto = -7) <> 1 then raise exception 'FALLO E3b: falta el vencimiento'; end if;
  if exists (select 1 from public.monedero_movimientos where lote_id = l_vigente and tipo = 'vencimiento') then raise exception 'FALLO E3c: venció un lote vigente'; end if;
  perform public.vencer_creditos_referidos();
  if (select count(*) from public.monedero_movimientos where lote_id = l_vencido and tipo = 'vencimiento') <> 1 then raise exception 'FALLO E3d: se duplicó el vencimiento'; end if;

  -- E3e: un lote gastado en parte vence solo por lo que le queda (10 con un uso de 4 -> vencimiento de -6)
  p2 := pg_temp.paciente('VenceParcial', '0994000002', v_focus, v_sf);
  insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, vence_en, motivo)
    values (v_prog, p2, 'ajuste', 10, now() - interval '1 day', 'lote parcial prueba') returning id into l_parcial;
  insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, lote_id, motivo)
    values (v_prog, p2, 'uso', -4, l_parcial, 'uso previo al vencimiento');
  perform public.vencer_creditos_referidos();
  if (select count(*) from public.monedero_movimientos where lote_id = l_parcial and tipo = 'vencimiento' and monto = -6) <> 1 then raise exception 'FALLO E3e: el lote parcial no venció por lo que quedaba (%)', (select string_agg(monto::text, ',') from public.monedero_movimientos where lote_id = l_parcial and tipo = 'vencimiento'); end if;
  if (select sum(m.monto) from public.monedero_movimientos m where m.id = l_parcial or m.lote_id = l_parcial) <> 0 then raise exception 'FALLO E3e2: el lote parcial no quedó en cero'; end if;
  perform public.vencer_creditos_referidos();
  if (select count(*) from public.monedero_movimientos where lote_id = l_parcial and tipo = 'vencimiento') <> 1 then raise exception 'FALLO E3e3: se duplicó el vencimiento parcial'; end if;

  -- E4: un usuario normal no puede ejecutar el cron
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', vf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.vencer_creditos_referidos();
    reset role; raise exception 'FALLO E4: un vendedor ejecutó el vencimiento';
  exception when others then
    reset role;
    if sqlerrm like 'FALLO%' then raise; end if;
  end;

  -- E5: estado_monedero muestra lo vencido y lo disponible
  perform set_config('request.jwt.claims', json_build_object('sub', vf, 'role', 'authenticated')::text, true);
  set local role authenticated;
  estado := public.estado_monedero(p, v_focus);
  reset role;
  if (estado->>'vencido')::numeric <> 7 or (estado->>'disponible')::numeric <> 5 then raise exception 'FALLO E5: estado %', estado; end if;

  -- E6: ajustes manuales — solo superadmin, con motivo, nunca más que el saldo
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', vf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.ajustar_monedero(v_prog, p, 10, 'Intento de vendedor');
    reset role; raise exception 'FALLO E6a: un vendedor ajustó el monedero';
  exception when others then
    reset role;
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', su, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.ajustar_monedero(v_prog, p, 20, 'Cortesía autorizada por Shuyana');
  perform public.ajustar_monedero(v_prog, p, -5, 'Corrección de cortesía');
  begin
    perform public.ajustar_monedero(v_prog, p, -500, 'Intento de dejar saldo negativo');
    reset role; raise exception 'FALLO E6b: se aceptó dejar el saldo negativo';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  begin
    perform public.ajustar_monedero(v_prog, p, 3, 'no');
    reset role; raise exception 'FALLO E6c: se aceptó un motivo corto';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  reset role;
  if app_private.saldo_disponible_monedero(v_prog, p) <> 20 then raise exception 'FALLO E6d: saldo tras ajustes %', app_private.saldo_disponible_monedero(v_prog, p); end if;
  if (select count(*) from public.referidos_auditoria where evento = 'ajuste_manual' and paciente_id = p) <> 2 then raise exception 'FALLO E6e: falta auditoría de ajustes'; end if;

  raise exception 'PRUEBAS_OK: vencimientos y ajustes (E2-E6)';
end $$;
