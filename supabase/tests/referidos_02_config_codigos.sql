do $$
declare
  v_focus uuid := current_setting('t.focus')::uuid;
  v_shu uuid := current_setting('t.shu')::uuid;
  v_sf uuid := current_setting('t.suc_focus')::uuid;
  v_ss uuid := current_setting('t.suc_shu')::uuid;
  v_prog uuid; v_prog_shu uuid;
  p1 uuid; p2 uuid; p3 uuid; ps uuid;
  c1 text; c2 text; c3 text; cs text;
  v_msg text; v_antes numeric; v_n int;
begin
  select id into v_prog from public.programas_referidos where empresa_id = v_focus;
  select id into v_prog_shu from public.programas_referidos where empresa_id = v_shu;

  -- B1: un paciente nuevo recibe su código con el formato PREFIJO-000000 (trigger), el de Shuvisión con SHU
  p1 := pg_temp.paciente('Uno', '0991000001', v_focus, v_sf);
  p2 := pg_temp.paciente('Dos', '0991000002', v_focus, v_sf);
  ps := pg_temp.paciente('Shu', '0991000003', v_shu, v_ss);
  select codigo into c1 from public.codigos_referido where programa_id = v_prog and paciente_id = p1;
  select codigo into c2 from public.codigos_referido where programa_id = v_prog and paciente_id = p2;
  select codigo into cs from public.codigos_referido where programa_id = v_prog_shu and paciente_id = ps;
  if c1 !~ '^FOC-[0-9]{6}$' or c2 !~ '^FOC-[0-9]{6}$' then raise exception 'FALLO B1a: formato de código Focus % / %', c1, c2; end if;
  if cs !~ '^SHU-[0-9]{6}$' then raise exception 'FALLO B1b: formato de código Shuvisión %', cs; end if;
  if c1 = c2 then raise exception 'FALLO B1c: códigos repetidos'; end if;
  if substr(c2, 5)::int <> substr(c1, 5)::int + 1 then raise exception 'FALLO B1d: los códigos no son consecutivos (% y %)', c1, c2; end if;

  -- B2: obtener_codigo_referido es idempotente y respeta la empresa
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('t.vend_focus'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.obtener_codigo_referido(p1, v_focus) <> c1 then reset role; raise exception 'FALLO B2a: el código cambió'; end if;
  begin
    perform public.obtener_codigo_referido(ps, v_shu);
    reset role; raise exception 'FALLO B2b: un vendedor de Focus pidió un código de Shuvisión';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  reset role;

  -- B3: solo la superadmin configura
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('t.vend_focus'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.guardar_programa_referidos(v_prog, '{"compra_minima": 130}'::jsonb);
    reset role; raise exception 'FALLO B3a: un vendedor pudo configurar';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if position('Superadministradora' in sqlerrm) = 0 then reset role; raise exception 'FALLO B3a: mensaje inesperado %', sqlerrm; end if;
  end;
  reset role;

  -- B4: la superadmin cambia valores y queda historial antes/después; los códigos existentes no cambian
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('t.su'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.guardar_programa_referidos(v_prog, '{"compra_minima": 130, "presupuesto_mensual": 500, "categorias_excluidas": ["servicio"]}'::jsonb);
  reset role;
  select compra_minima into v_antes from public.programas_referidos where id = v_prog;
  if v_antes <> 130 then raise exception 'FALLO B4a: no se guardó la compra mínima'; end if;
  if (select categorias_excluidas from public.programas_referidos where id = v_prog) <> array['servicio'] then raise exception 'FALLO B4b: categorías excluidas'; end if;
  select count(*) into v_n from public.referidos_auditoria where programa_id = v_prog and evento = 'config'
    and (detalle->'antes'->>'compra_minima')::numeric = 120 and (detalle->'despues'->>'compra_minima')::numeric = 130;
  if v_n <> 1 then raise exception 'FALLO B4c: falta el historial de cambio (%)', v_n; end if;
  if (select codigo from public.codigos_referido where programa_id = v_prog and paciente_id = p1) <> c1 then raise exception 'FALLO B4d: cambió un código'; end if;

  -- B5: valores inválidos se rechazan
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('t.su'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.guardar_programa_referidos(v_prog, '{"tope_uso_porcentaje": 150}'::jsonb);
    reset role; raise exception 'FALLO B5: se aceptó un tope de 150 %%';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  reset role;

  -- B6: al encender un programa se generan códigos para los pacientes que no tenían (sin Consumidor Final)
  update public.programas_referidos set activo = false where id = v_prog;
  p3 := pg_temp.paciente('Tres', '0991000004', v_focus, v_sf);
  if exists (select 1 from public.codigos_referido where programa_id = v_prog and paciente_id = p3) then raise exception 'FALLO B6a: con el programa apagado se creó un código'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('t.su'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.guardar_programa_referidos(v_prog, '{"activo": true}'::jsonb);
  reset role;
  select codigo into c3 from public.codigos_referido where programa_id = v_prog and paciente_id = p3;
  if c3 !~ '^FOC-[0-9]{6}$' then raise exception 'FALLO B6b: no se generó el código al encender (%)', c3; end if;
  if exists (select 1 from public.codigos_referido c join public.pacientes_clinicos pc on pc.id = c.paciente_id where c.programa_id = v_prog and pc.cedula = '9999999999999') then
    raise exception 'FALLO B6c: Consumidor Final recibió código';
  end if;
  if (select siguiente_numero from public.programas_referidos where id = v_prog) <= substr(c3, 5)::int then raise exception 'FALLO B6d: el contador no avanzó'; end if;

  raise exception 'PRUEBAS_OK: códigos y configuración (B1-B6)';
end $$;
