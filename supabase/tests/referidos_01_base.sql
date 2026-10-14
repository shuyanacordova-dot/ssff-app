-- PARTE 1 (antes del preludio): los programas nacen apagados y con los valores acordados.
do $$
begin
  if (select count(*) from public.programas_referidos where nombre in ('Círculo Shu', 'Focus Friends')) <> 2 then
    raise exception 'FALLO A1: faltan los dos programas sembrados';
  end if;
  if exists (select 1 from public.programas_referidos where activo) then
    raise exception 'FALLO A2: un programa nació encendido';
  end if;
  if not exists (select 1 from public.programas_referidos where prefijo = 'FOC' and compra_minima = 120 and descuento_bienvenida = 15 and credito_por_referido = 10
                 and bono_3_referidos = 15 and bono_5_referidos = 25 and vigencia_credito_dias = 60 and tope_uso_porcentaje = 20) then
    raise exception 'FALLO A3: valores de Focus Friends incorrectos';
  end if;
  if not exists (select 1 from public.programas_referidos where prefijo = 'SHU' and compra_minima = 100 and descuento_bienvenida = 10 and credito_por_referido = 10
                 and bono_3_referidos = 10 and bono_5_referidos = 20 and vigencia_credito_dias = 90 and tope_uso_porcentaje = 20) then
    raise exception 'FALLO A4: valores de Círculo Shu incorrectos';
  end if;
end $$;

-- ===== PRELUDIO AQUÍ =====

-- PARTE 2 (después del preludio)
do $$
declare
  v_focus uuid := current_setting('t.focus')::uuid;
  v_shu uuid := current_setting('t.shu')::uuid;
  v_prog uuid;
  v_pac uuid;
  v_mov uuid;
  v_visto int;
  v_bloqueado boolean := false;
begin
  select id into v_prog from public.programas_referidos where empresa_id = v_focus;
  v_pac := pg_temp.paciente('Base', '0990000001', v_focus, current_setting('t.suc_focus')::uuid);

  -- A5: el historial del monedero no se puede modificar ni borrar
  insert into public.monedero_movimientos(programa_id, paciente_id, tipo, monto, vence_en)
  values (v_prog, v_pac, 'credito', 5, now() + interval '1 day') returning id into v_mov;
  begin update public.monedero_movimientos set monto = 1 where id = v_mov; exception when others then v_bloqueado := true; end;
  if not v_bloqueado then raise exception 'FALLO A5a: se pudo modificar un movimiento del monedero'; end if;
  v_bloqueado := false;
  begin delete from public.monedero_movimientos where id = v_mov; exception when others then v_bloqueado := true; end;
  if not v_bloqueado then raise exception 'FALLO A5b: se pudo borrar un movimiento del monedero'; end if;

  -- A6: un movimiento negativo exige lote; un ajuste exige motivo de 5+ caracteres
  v_bloqueado := false;
  begin insert into public.monedero_movimientos(programa_id, paciente_id, tipo, monto) values (v_prog, v_pac, 'uso', -1); exception when others then v_bloqueado := true; end;
  if not v_bloqueado then raise exception 'FALLO A6a: se aceptó un uso sin lote'; end if;
  v_bloqueado := false;
  begin insert into public.monedero_movimientos(programa_id, paciente_id, tipo, monto, vence_en, motivo) values (v_prog, v_pac, 'ajuste', 5, now() + interval '1 day', 'ok'); exception when others then v_bloqueado := true; end;
  if not v_bloqueado then raise exception 'FALLO A6b: se aceptó un ajuste sin motivo suficiente'; end if;

  -- A7: un usuario de Shuvisión no ve el programa de Focus (RLS)
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('t.vend_shu'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_visto from public.programas_referidos where empresa_id = v_focus;
  if v_visto <> 0 then reset role; raise exception 'FALLO A7a: Shuvisión ve el programa de Focus'; end if;
  select count(*) into v_visto from public.programas_referidos where empresa_id = v_shu;
  if v_visto <> 1 then reset role; raise exception 'FALLO A7b: Shuvisión no ve su propio programa'; end if;
  reset role;

  -- A8: el historial de auditoría solo lo lee la superadmin
  insert into public.referidos_auditoria(programa_id, evento) values (v_prog, 'prueba');
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('t.vend_focus'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_visto from public.referidos_auditoria;
  reset role;
  if v_visto <> 0 then raise exception 'FALLO A8: un vendedor lee la auditoría'; end if;

  raise exception 'PRUEBAS_OK: base (A1-A8)';
end $$;
