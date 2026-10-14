-- Prueba de la migración 3 de referidos. Se ejecuta como [migración 3] + [preludio] + [este archivo].
do $$
declare
  v_focus uuid := current_setting('t.focus')::uuid;
  v_shu uuid := current_setting('t.shu')::uuid;
  v_sf uuid := current_setting('t.suc_focus')::uuid;
  v_ss uuid := current_setting('t.suc_shu')::uuid;
  vf uuid := current_setting('t.vend_focus')::uuid;
  vs uuid := current_setting('t.vend_shu')::uuid;
  v_prog uuid;
  a uuid; b uuid; c uuid; d uuid; e uuid; f uuid; g uuid; h uuid; x uuid; j uuid;
  ca text; cf text;
  s uuid; r record; prev jsonb; n int;
begin
  select id into v_prog from public.programas_referidos where empresa_id = v_focus;
  a := pg_temp.paciente('Ana', '0992000001', v_focus, v_sf);
  select codigo into ca from public.codigos_referido where programa_id = v_prog and paciente_id = a;

  -- C1 (regresión): venta normal sin código = igual que antes (descuento 0, total = subtotal)
  x := pg_temp.paciente('Normal', '0992000099', v_focus, v_sf);
  s := pg_temp.vender(v_focus, v_sf, vf, x, null, 150, 150);
  select * into r from public.ventas where id = s;
  if r.descuento <> 0 or r.total <> 150 or r.subtotal <> 150 or r.saldo <> 0 or r.estado <> 'completada' then
    raise exception 'FALLO C1: la venta normal cambió (desc %, total %, saldo %)', r.descuento, r.total, r.saldo;
  end if;

  -- C2: vista previa para un cliente nuevo con el código de Ana (base 150)
  b := pg_temp.paciente('Beto', '0992000002', v_focus, v_sf);
  perform set_config('request.jwt.claims', json_build_object('sub', vf, 'role', 'authenticated')::text, true);
  set local role authenticated;
  prev := public.previsualizar_referido(v_focus, b, ca, 150);
  reset role;
  if not (prev->'codigo'->>'ok')::boolean or (prev->'codigo'->>'descuento')::numeric <> 15 then raise exception 'FALLO C2: vista previa %', prev; end if;

  -- C3: venta con código: -$15, total $135, referido "en_pago" con el crédito congelado y SIN crédito aún
  s := pg_temp.vender(v_focus, v_sf, vf, b, ca, 150, 0);
  select * into r from public.ventas where id = s;
  if r.descuento <> 15 or r.total <> 135 or r.saldo <> 135 or r.subtotal <> 150 then raise exception 'FALLO C3a: totales % / % / %', r.descuento, r.total, r.saldo; end if;
  select count(*) into n from public.referidos where venta_id = s and estado = 'en_pago' and descuento_aplicado = 15 and credito_a_otorgar = 10 and referidor_paciente_id = a and referido_paciente_id = b;
  if n <> 1 then raise exception 'FALLO C3b: no se registró el referido en pago'; end if;
  if exists (select 1 from public.monedero_movimientos where programa_id = v_prog and paciente_id = a) then raise exception 'FALLO C3c: ya hay crédito sin estar pagada la venta'; end if;

  -- C4: el mismo paciente no puede recibir el beneficio dos veces
  perform pg_temp.vender_falla('C4', 'clientes nuevos', v_focus, v_sf, vf, b, ca, 150, 0);
  -- C5: no se puede usar el propio código
  perform pg_temp.vender_falla('C5', 'propio código', v_focus, v_sf, vf, a, ca, 150, 0);
  -- C6: compra mínima (se mide antes del descuento): 100 < 120
  c := pg_temp.paciente('Carla', '0992000003', v_focus, v_sf);
  perform pg_temp.vender_falla('C6', 'compra mínima', v_focus, v_sf, vf, c, ca, 100, 0);
  -- C7: convenio no participa
  perform pg_temp.vender_falla('C7', 'convenio', v_focus, v_sf, vf, c, ca, 150, 0, 0, true);
  -- C8: mismo teléfono que el referidor
  d := pg_temp.paciente('Dani', '0992000001', v_focus, v_sf);
  perform pg_temp.vender_falla('C8', 'misma cuenta', v_focus, v_sf, vf, d, ca, 150, 0);
  -- C9 (Review Focus 1): dos pacientes SIN teléfono no son "misma cuenta"
  e := pg_temp.paciente('Eva', null, v_focus, v_sf);
  f := pg_temp.paciente('Fer', null, v_focus, v_sf);
  select codigo into cf from public.codigos_referido where programa_id = v_prog and paciente_id = e;
  s := pg_temp.vender(v_focus, v_sf, vf, f, cf, 150, 0);
  if (select descuento from public.ventas where id = s) <> 15 then raise exception 'FALLO C9: el código de alguien sin teléfono fue rechazado'; end if;
  -- C10: ya tiene descuentos de línea
  g := pg_temp.paciente('Gabo', '0992000007', v_focus, v_sf);
  perform pg_temp.vender_falla('C10', 'descuentos', v_focus, v_sf, vf, g, ca, 150, 0, 0, false, 5);
  -- C11: categoría excluida no cuenta para la compra mínima
  update public.programas_referidos set categorias_excluidas = array[(select categoria from public.productos_catalogo where id = current_setting('t.producto_focus')::uuid)] where id = v_prog;
  perform pg_temp.vender_falla('C11', 'compra mínima', v_focus, v_sf, vf, g, ca, 150, 0);
  update public.programas_referidos set categorias_excluidas = '{}' where id = v_prog;
  -- C12: programa apagado
  update public.programas_referidos set activo = false where id = v_prog;
  perform pg_temp.vender_falla('C12', 'no está activo', v_focus, v_sf, vf, g, ca, 150, 0);
  update public.programas_referidos set activo = true where id = v_prog;
  -- C13: presupuesto del mes (ya se dieron $30 de descuento: B y F)
  update public.programas_referidos set presupuesto_mensual = 30 where id = v_prog;
  perform pg_temp.vender_falla('C13', 'presupuesto', v_focus, v_sf, vf, g, ca, 150, 0);
  update public.programas_referidos set presupuesto_mensual = null where id = v_prog;
  -- C14: aislamiento — un vendedor de Shuvisión no puede vender ni consultar en Focus
  perform pg_temp.vender_falla('C14a', 'No autorizado', v_focus, v_sf, vs, g, ca, 150, 0);
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', vs, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.previsualizar_referido(v_focus, g, ca, 150);
    reset role; raise exception 'FALLO C14b: Shuvisión consultó la vista previa de Focus';
  exception when others then
    reset role;
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  -- C15: referido registrado desde la ficha y luego vende sin escribir el código otra vez no es obligatorio;
  --      con el código distinto al del referidor registrado se rechaza
  h := pg_temp.paciente('Hugo', '0992000008', v_focus, v_sf);
  perform set_config('request.jwt.claims', json_build_object('sub', vf, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.registrar_referido_ficha(h, v_focus, ca);
  reset role;
  if (select count(*) from public.referidos where referido_paciente_id = h and estado = 'registrado' and referidor_paciente_id = a) <> 1 then raise exception 'FALLO C15a: no se registró el referido en la ficha'; end if;
  perform pg_temp.vender_falla('C15b', 'otro referidor', v_focus, v_sf, vf, h, cf, 150, 0);
  s := pg_temp.vender(v_focus, v_sf, vf, h, ca, 150, 0);
  if (select estado from public.referidos where referido_paciente_id = h) <> 'en_pago' or (select count(*) from public.referidos where referido_paciente_id = h) <> 1 then
    raise exception 'FALLO C15c: la venta no reutilizó el referido registrado en la ficha';
  end if;
  -- C16: buscar_codigo_referido muestra el nombre para confirmar
  perform set_config('request.jwt.claims', json_build_object('sub', vf, 'role', 'authenticated')::text, true);
  set local role authenticated;
  prev := public.buscar_codigo_referido(v_focus, lower(ca));
  reset role;
  if not (prev->>'encontrado')::boolean or position('Ana' in (prev->>'nombre')) = 0 then raise exception 'FALLO C16: búsqueda de código %', prev; end if;

  raise exception 'PRUEBAS_OK: venta con referido (C1-C16)';
end $$;
