-- Prueba de la migración 6 de referidos (correcciones de la revisión final).
-- Se ejecuta como [migración 6] + [preludio] + [este archivo]. Todo corre dentro de una transacción que termina en error a propósito.

-- Anula una venta como superadmin (con crédito de vuelta para lo pagado en dinero).
create or replace function pg_temp.anular(p_venta uuid, p_motivo text)
returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('t.su'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.anular_venta_con_modo(p_venta, p_motivo, 'credito');
  exception when others then
    reset role;
    raise;
  end;
  reset role;
end $f$;

do $$
declare
  v_focus uuid := current_setting('t.focus')::uuid;
  v_sf uuid := current_setting('t.suc_focus')::uuid;
  vf uuid := current_setting('t.vend_focus')::uuid;
  su uuid := current_setting('t.su')::uuid;
  v_prog uuid;
  a uuid; ca text;
  b uuid; c uuid; s uuid; s2 uuid; ref uuid; n int; v_conv uuid; j jsonb;
begin
  select id into v_prog from public.programas_referidos where empresa_id = v_focus;
  select id into v_conv from public.empresas_convenio limit 1;
  a := pg_temp.paciente('Ana', '0996000001', v_focus, v_sf);
  select codigo into ca from public.codigos_referido where programa_id = v_prog and paciente_id = a;
  if ca is null then raise exception 'FALLO DB0: Ana no recibió código'; end if;

  -- DB1- (DB-1): una venta que se vuelve convenio DESPUÉS de registrarse no paga la recompensa ni cuenta para bonos
  b := pg_temp.paciente('Beto', '0996000002', v_focus, v_sf);
  s := pg_temp.vender(v_focus, v_sf, vf, b, ca, 150, 100);                         -- total 135, pagó 100
  if (select estado from public.referidos where venta_id = s) <> 'en_pago' then raise exception 'FALLO DB1-a: debía quedar en_pago'; end if;
  insert into public.acuerdos_pago (venta_id, empresa_convenio_id, cuotas, monto_cuota, fecha_primera_cuota, texto, modalidad)
    values (s, v_conv, 3, 10, current_date, 'Prueba de convenio posterior', 'convenio');
  perform set_config('request.jwt.claims', json_build_object('sub', vf, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.registrar_abono_venta(s, 'efectivo', 35);
  reset role;
  if (select saldo from public.ventas where id = s) <> 0 then raise exception 'FALLO DB1-b: la venta debía quedar saldada'; end if;
  if (select estado from public.referidos where venta_id = s) <> 'rechazado' or (select motivo_rechazo from public.referidos where venta_id = s) <> 'venta de convenio' then
    raise exception 'FALLO DB1-c: el referido de una venta de convenio debía quedar rechazado (%)', (select estado from public.referidos where venta_id = s);
  end if;
  if exists (select 1 from public.monedero_movimientos where paciente_id = a) then raise exception 'FALLO DB1-d: se otorgó crédito o bono por una venta de convenio'; end if;
  if not exists (select 1 from public.referidos_auditoria where evento = 'recompensa_rechazada_convenio' and venta_id = s) then raise exception 'FALLO DB1-e: falta la auditoría'; end if;
  if (select count(*) from public.referidos where referidor_paciente_id = a and estado = 'recompensado') <> 0 then
    raise exception 'FALLO DB1-f: el convenio no debía contar como exitoso';
  end if;
  -- DB1-g: control: un financiamiento propio de la óptica (modalidad "optica") SÍ conserva la recompensa
  c := pg_temp.paciente('Carla', '0996000003', v_focus, v_sf);
  s2 := pg_temp.vender(v_focus, v_sf, vf, c, ca, 150, 100);
  insert into public.acuerdos_pago (venta_id, empresa_convenio_id, cuotas, monto_cuota, fecha_primera_cuota, texto, modalidad)
    values (s2, null, 3, 10, current_date, 'Prueba de financiamiento propio', 'optica');
  perform set_config('request.jwt.claims', json_build_object('sub', vf, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.registrar_abono_venta(s2, 'efectivo', 35);
  reset role;
  if (select estado from public.referidos where venta_id = s2) <> 'recompensado' then raise exception 'FALLO DB1-g: el financiamiento de la óptica debía otorgar la recompensa'; end if;

  -- DB4- (DB-4): ventas.pagado escrito a mano (sin pagos registrados) NO otorga la recompensa; queda en_pago y con auditoría
  declare d uuid; sd uuid; ra uuid; cra text;
  begin
    ra := pg_temp.paciente('Rina', '0996000040', v_focus, v_sf);
    select codigo into cra from public.codigos_referido where programa_id = v_prog and paciente_id = ra;
    d := pg_temp.paciente('Dino', '0996000041', v_focus, v_sf);
    sd := pg_temp.vender(v_focus, v_sf, vf, d, cra, 150, 100);                      -- total 135, pagó 100
    perform set_config('request.jwt.claims', json_build_object('sub', vf, 'role', 'authenticated')::text, true);
    update public.ventas set pagado = pagado + 35, saldo = saldo - 35 where id = sd;   -- escritura directa, sin fila en pagos_venta
    perform set_config('request.jwt.claims', '', true);
    if (select saldo from public.ventas where id = sd) <> 0 or (select pagado from public.ventas where id = sd) <> 135 then raise exception 'FALLO DB4-a: la escritura directa no quedó aplicada'; end if;
    if (select estado from public.referidos where venta_id = sd) <> 'en_pago' then raise exception 'FALLO DB4-b: se otorgó con pagos que no existen (%)', (select estado from public.referidos where venta_id = sd); end if;
    if exists (select 1 from public.monedero_movimientos where paciente_id = ra) then raise exception 'FALLO DB4-c: se creó crédito sin pagos registrados'; end if;
    if (select count(*) from public.referidos_auditoria where evento = 'recompensa_bloqueada_pagos' and venta_id = sd) <> 1 then raise exception 'FALLO DB4-d: falta la auditoría recompensa_bloqueada_pagos'; end if;
    -- DB4-e: el reproceso (al reanudar recompensas) tampoco la otorga y no la cuenta como otorgada
    if app_private.procesar_recompensas_pendientes(v_prog) <> 0 or (select estado from public.referidos where venta_id = sd) <> 'en_pago' then raise exception 'FALLO DB4-e: el reproceso otorgó una venta sin pagos'; end if;
  end;

  -- DB7- (DB-7): canje real (la superadmin deja saldo 0 sin que entre dinero) deja el referido rechazado, sin crédito
  declare e uuid; se uuid; re uuid; cre text;
  begin
    re := pg_temp.paciente('Rene', '0996000070', v_focus, v_sf);
    select codigo into cre from public.codigos_referido where programa_id = v_prog and paciente_id = re;
    e := pg_temp.paciente('Elio', '0996000071', v_focus, v_sf);
    se := pg_temp.vender(v_focus, v_sf, vf, e, cre, 150, 100);                      -- total 135, pagó 100, saldo 35
    perform set_config('request.jwt.claims', json_build_object('sub', su, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.registrar_canje_venta(se, 35, 'Prueba de canje del saldo');
    reset role;
    if (select saldo from public.ventas where id = se) <> 0 or (select pagado from public.ventas where id = se) <> 100 then raise exception 'FALLO DB7-a: el canje debía dejar saldo 0 con pagado 100'; end if;
    if (select estado from public.referidos where venta_id = se) <> 'rechazado' or (select motivo_rechazo from public.referidos where venta_id = se) <> 'venta saldada sin pago completo (canje)' then
      raise exception 'FALLO DB7-b: el referido canjeado debía quedar rechazado (%)', (select estado from public.referidos where venta_id = se);
    end if;
    if exists (select 1 from public.monedero_movimientos where paciente_id = re) then raise exception 'FALLO DB7-c: un canje otorgó crédito'; end if;
    if not exists (select 1 from public.referidos_auditoria where evento = 'recompensa_rechazada_canje' and venta_id = se) then raise exception 'FALLO DB7-d: falta la auditoría del canje'; end if;
    -- DB7-e: control: un pago parcial sin canje NO se rechaza (sigue en_pago hasta completar el pago)
    declare g uuid; sg uuid;
    begin
      g := pg_temp.paciente('Gala', '0996000072', v_focus, v_sf);
      sg := pg_temp.vender(v_focus, v_sf, vf, g, cre, 150, 100);
      if (select estado from public.referidos where venta_id = sg) <> 'en_pago' then raise exception 'FALLO DB7-e: un pago parcial no debía rechazar'; end if;
    end;
  end;

  -- DB8- (DB-8): referidos mutuos
  declare m1 uuid; m2 uuid; m3 uuid; cm1 text; cm2 text; v_par jsonb; v_msg text;
  begin
    m1 := pg_temp.paciente('Mutua1', '0996000080', v_focus, v_sf);
    m2 := pg_temp.paciente('Mutua2', '0996000081', v_focus, v_sf);
    m3 := pg_temp.paciente('Mutua3', '0996000082', v_focus, v_sf);
    select codigo into cm1 from public.codigos_referido where programa_id = v_prog and paciente_id = m1;
    select codigo into cm2 from public.codigos_referido where programa_id = v_prog and paciente_id = m2;
    perform set_config('request.jwt.claims', json_build_object('sub', vf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.registrar_referido_ficha(m2, v_focus, cm1);                      -- m1 refirió a m2
    reset role;
    v_par := app_private.validar_pareja_referido(v_prog, cm2, m1);                  -- ahora m1 intenta ser referido por m2
    if (v_par->>'ok')::boolean or position('mutuos' in lower(v_par->>'motivo')) = 0 then raise exception 'FALLO DB8-a: el referido mutuo se aceptó (%)', v_par; end if;
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', vf, 'role', 'authenticated')::text, true);
      set local role authenticated;
      perform public.registrar_referido_ficha(m1, v_focus, cm2);
      reset role;
      raise exception 'FALLO DB8-b: la ficha aceptó un referido mutuo';
    exception when others then
      reset role;
      v_msg := sqlerrm;
      if v_msg like 'FALLO%' then raise; end if;
      if position('mutuos' in lower(v_msg)) = 0 then raise exception 'FALLO DB8-b: mensaje inesperado "%"', v_msg; end if;
    end;
    -- F8c: control: una tercera persona sí puede usar el código de m2
    v_par := app_private.validar_pareja_referido(v_prog, cm2, m3);
    if not (v_par->>'ok')::boolean then raise exception 'FALLO DB8-c: un referido normal se rechazó (%)', v_par; end if;
  end;

  -- DB2-a (DB-2a): el crédito de un lote GASTADO POR COMPLETO antes de revertir al referido no se devuelve al anular la compra que lo gastó
  declare r uuid; cr text; q uuid; sq uuid; sgasto uuid;
  begin
    r := pg_temp.paciente('Rafa', '0996000100', v_focus, v_sf);
    select codigo into cr from public.codigos_referido where programa_id = v_prog and paciente_id = r;
    q := pg_temp.paciente('Quio', '0996000101', v_focus, v_sf);
    sq := pg_temp.vender(v_focus, v_sf, vf, q, cr, 150, 135);                       -- Rafa gana $10
    sgasto := pg_temp.vender(v_focus, v_sf, vf, r, null, 100, 90, 10);              -- Rafa gasta los $10 completos
    if app_private.saldo_disponible_monedero(v_prog, r) <> 0 then raise exception 'FALLO DB2-a0: el lote debía quedar gastado por completo'; end if;
    perform pg_temp.anular(sq, 'Prueba de anulación del referido');
    if exists (select 1 from public.monedero_movimientos where paciente_id = r and tipo = 'reversa') then raise exception 'FALLO DB2-a1: no debía haber reversa (restante 0)'; end if;
    perform pg_temp.anular(sgasto, 'Prueba de anulación de la compra con crédito');
    if exists (select 1 from public.monedero_movimientos where paciente_id = r and tipo = 'devolucion') then
      raise exception 'FALLO DB2-a2: se devolvió crédito de un referido revertido (%)', (select sum(monto) from public.monedero_movimientos where paciente_id = r and tipo = 'devolucion');
    end if;
    if not exists (select 1 from public.referidos_auditoria where evento = 'credito_no_devuelto' and paciente_id = r and venta_id = sgasto and (detalle->>'monto')::numeric = 10) then
      raise exception 'FALLO DB2-a3: falta credito_no_devuelto por $10';
    end if;
    if app_private.saldo_disponible_monedero(v_prog, r) <> 0 then raise exception 'FALLO DB2-a4: saldo %', app_private.saldo_disponible_monedero(v_prog, r); end if;
  end;

  -- DB2-a (bono): con 3 referidos y todo gastado, al anular uno el bono (hito 3) deja de corresponder; solo se devuelve lo que sigue vigente
  declare r uuid; cr text; q1 uuid; q2 uuid; q3 uuid; s1 uuid; s2x uuid; s3 uuid; sg uuid; v_dev numeric; n_dev int;
  begin
    r := pg_temp.paciente('Remo', '0996000110', v_focus, v_sf);
    select codigo into cr from public.codigos_referido where programa_id = v_prog and paciente_id = r;
    q1 := pg_temp.paciente('Quim1', '0996000111', v_focus, v_sf);
    s1 := pg_temp.vender(v_focus, v_sf, vf, q1, cr, 150, 135);
    q2 := pg_temp.paciente('Quim2', '0996000112', v_focus, v_sf);
    s2x := pg_temp.vender(v_focus, v_sf, vf, q2, cr, 150, 135);
    q3 := pg_temp.paciente('Quim3', '0996000113', v_focus, v_sf);
    s3 := pg_temp.vender(v_focus, v_sf, vf, q3, cr, 150, 135);
    if app_private.saldo_disponible_monedero(v_prog, r) <> 45 then raise exception 'FALLO DB2-b0: Remo debía tener $45 (3 créditos + bono de 3), tiene %', app_private.saldo_disponible_monedero(v_prog, r); end if;
    sg := pg_temp.vender(v_focus, v_sf, vf, r, null, 250, 205, 45);                 -- gasta los $45 (tope 20 %% de 250 = 50)
    if app_private.saldo_disponible_monedero(v_prog, r) <> 0 then raise exception 'FALLO DB2-b1: no se gastó todo'; end if;
    perform pg_temp.anular(s1, 'Prueba: baja a dos referidos');
    if exists (select 1 from public.monedero_movimientos where paciente_id = r and tipo = 'reversa') then raise exception 'FALLO DB2-b2: no debía haber reversas (todo gastado)'; end if;
    perform pg_temp.anular(sg, 'Prueba: anular la compra con crédito');
    select count(*), coalesce(sum(monto), 0) into n_dev, v_dev from public.monedero_movimientos where paciente_id = r and tipo = 'devolucion';
    if n_dev <> 1 or v_dev <> 20 then raise exception 'FALLO DB2-b3: debían volver solo $20 (créditos de los 2 referidos vigentes); devolución % en % filas', v_dev, n_dev; end if;
    if not exists (select 1 from public.referidos_auditoria where evento = 'credito_no_devuelto' and paciente_id = r and venta_id = sg and (detalle->>'monto')::numeric = 25) then
      raise exception 'FALLO DB2-b4: debía quedar credito_no_devuelto por $25 (crédito del referido anulado + bono)';
    end if;
    if app_private.saldo_disponible_monedero(v_prog, r) <> 20 then raise exception 'FALLO DB2-b5: saldo %', app_private.saldo_disponible_monedero(v_prog, r); end if;
  end;

  -- DB2-c (DB-2b): lotes devueltos con vencimientos distintos: la devolución vence con el PRIMERO en vencer
  declare p uuid; l1 uuid; l2 uuid; sv uuid; v_vence timestamptz; v_l2 timestamptz;
  begin
    p := pg_temp.paciente('Pablo', '0996000120', v_focus, v_sf);
    insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, vence_en, motivo)
      values (v_prog, p, 'ajuste', 10, now() + interval '30 days', 'lote largo prueba') returning id into l1;
    insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, vence_en, motivo)
      values (v_prog, p, 'ajuste', 10, now() + interval '5 days', 'lote corto prueba') returning id into l2;
    select vence_en into v_l2 from public.monedero_movimientos where id = l2;
    sv := pg_temp.vender(v_focus, v_sf, vf, p, null, 100, 87, 13);                  -- gasta 10 del lote corto y 3 del largo
    perform pg_temp.anular(sv, 'Prueba de devolución con dos lotes');
    select vence_en into v_vence from public.monedero_movimientos where paciente_id = p and tipo = 'devolucion';
    if (select count(*) from public.monedero_movimientos where paciente_id = p and tipo = 'devolucion') <> 1 or (select monto from public.monedero_movimientos where paciente_id = p and tipo = 'devolucion') <> 13 then
      raise exception 'FALLO DB2-c1: debía haber una sola devolución de $13';
    end if;
    if v_vence <> v_l2 then raise exception 'FALLO DB2-c2: la devolución vence % y debía vencer % (el primero en vencer)', v_vence, v_l2; end if;
  end;

  -- DB2-d (DB-2b): un lote de origen ya vencido no se devuelve (queda en auditoría) y la devolución vence con el lote vigente
  declare p uuid; lv uuid; lg uuid; sv uuid; v_lg timestamptz;
  begin
    p := pg_temp.paciente('Paula', '0996000130', v_focus, v_sf);
    insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, vence_en, motivo)
      values (v_prog, p, 'ajuste', 10, now() - interval '1 day', 'lote vencido prueba') returning id into lv;
    insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, vence_en, motivo)
      values (v_prog, p, 'ajuste', 10, now() + interval '20 days', 'lote vigente prueba') returning id into lg;
    select vence_en into v_lg from public.monedero_movimientos where id = lg;
    sv := pg_temp.vender(v_focus, v_sf, vf, p, null, 100, 100);
    -- Se simula que la compra gastó 4 del lote que hoy ya está vencido y 3 del vigente.
    insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, lote_id, venta_id, motivo) values (v_prog, p, 'uso', -4, lv, sv, 'uso simulado vencido');
    insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, lote_id, venta_id, motivo) values (v_prog, p, 'uso', -3, lg, sv, 'uso simulado vigente');
    perform pg_temp.anular(sv, 'Prueba con un lote ya vencido');
    if (select count(*) from public.monedero_movimientos where paciente_id = p and tipo = 'devolucion') <> 1 or (select monto from public.monedero_movimientos where paciente_id = p and tipo = 'devolucion') <> 3 then
      raise exception 'FALLO DB2-d1: debía devolverse solo $3 (lo del lote vigente); devuelto %', (select sum(monto) from public.monedero_movimientos where paciente_id = p and tipo = 'devolucion');
    end if;
    if (select vence_en from public.monedero_movimientos where paciente_id = p and tipo = 'devolucion') <> v_lg then raise exception 'FALLO DB2-d2: la devolución debía vencer con el lote vigente'; end if;
    if not exists (select 1 from public.referidos_auditoria where evento = 'credito_vencido_no_devuelto' and paciente_id = p and venta_id = sv and (detalle->>'monto')::numeric = 4) then
      raise exception 'FALLO DB2-d3: falta credito_vencido_no_devuelto por $4';
    end if;
    if exists (select 1 from public.referidos_auditoria where evento = 'credito_no_devuelto' and paciente_id = p and venta_id = sv) then raise exception 'FALLO DB2-d4: un lote vencido no es un lote revertido'; end if;
  end;

  -- DB3 (DB-3): Consumidor Final (cédula 9999999999999): sin código, sin monedero, ni como referidor ni como referido
  declare cf uuid; v_sig_antes int; v_sig_despues int; n1 uuid; j2 jsonb; v_cod text; v_par jsonb;
  begin
    select id into cf from public.pacientes_clinicos where cedula = '9999999999999';
    if cf is null then
      -- el entorno no tiene la fila real: se crea una equivalente (la cédula es única en la tabla)
      insert into public.pacientes_clinicos (nombres, apellidos, cedula, empresa_origen_id) values ('CONSUMIDOR FINAL', '', '9999999999999', v_focus) returning id into cf;
    end if;
    if not exists (select 1 from public.paciente_empresas where paciente_id = cf and empresa_id = v_focus) then
      insert into public.paciente_empresas (paciente_id, empresa_id, primera_sucursal_id) values (cf, v_focus, v_sf);
    end if;
    delete from public.codigos_referido where paciente_id = cf and programa_id = v_prog;
    select siguiente_numero into v_sig_antes from public.programas_referidos where id = v_prog;
    -- DB3-a: asegurar_codigo_referido devuelve null, no inserta y no avanza el contador
    v_cod := app_private.asegurar_codigo_referido(v_prog, cf);
    select siguiente_numero into v_sig_despues from public.programas_referidos where id = v_prog;
    if v_cod is not null or exists (select 1 from public.codigos_referido where paciente_id = cf) or v_sig_antes <> v_sig_despues then
      raise exception 'FALLO DB3-a: el Consumidor Final recibió código (% / contador % -> %)', v_cod, v_sig_antes, v_sig_despues;
    end if;
    -- DB3-b: el trigger de alta (se vuelve a insertar su relación con la óptica) tampoco crea código
    delete from public.paciente_empresas where paciente_id = cf and empresa_id = v_focus;
    insert into public.paciente_empresas (paciente_id, empresa_id, primera_sucursal_id) values (cf, v_focus, v_sf);
    if exists (select 1 from public.codigos_referido where paciente_id = cf) then raise exception 'FALLO DB3-b: el trigger de alta creó código al Consumidor Final'; end if;
    -- DB3-c: las funciones que ve el equipo
    perform set_config('request.jwt.claims', json_build_object('sub', vf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_cod := public.obtener_codigo_referido(cf, v_focus);
    j2 := public.estado_monedero(cf, v_focus);
    reset role;
    if v_cod is not null then raise exception 'FALLO DB3-c1: obtener_codigo_referido devolvió código (%)', v_cod; end if;
    if jsonb_typeof(j2->'codigo') <> 'null' or (j2->>'programa_activo')::boolean is not true then raise exception 'FALLO DB3-c2: estado_monedero del Consumidor Final: %', j2; end if;
    if exists (select 1 from public.codigos_referido where paciente_id = cf) then raise exception 'FALLO DB3-c3: estado_monedero creó código al Consumidor Final'; end if;
    -- DB3-d: como referido (compra con el código de Ana)
    perform pg_temp.vender_falla('DB3-d', 'consumidor final', v_focus, v_sf, vf, cf, ca, 150, 0);
    -- DB3-e: como referidor (aunque alguien le hubiera puesto un código a mano)
    insert into public.codigos_referido (programa_id, paciente_id, codigo) values (v_prog, cf, 'FOC-CF0001');
    n1 := pg_temp.paciente('NuevoCF', '0996000140', v_focus, v_sf);
    perform pg_temp.vender_falla('DB3-e', 'consumidor final', v_focus, v_sf, vf, n1, 'FOC-CF0001', 150, 0);
    v_par := app_private.validar_pareja_referido(v_prog, 'FOC-CF0001', n1);
    if (v_par->>'ok')::boolean or position('consumidor final' in lower(v_par->>'motivo')) = 0 then raise exception 'FALLO DB3-f: validar_pareja_referido aceptó al Consumidor Final como referidor (%)', v_par; end if;
    -- DB3-g: un paciente normal sigue recibiendo su código (control)
    if app_private.asegurar_codigo_referido(v_prog, n1) is null then raise exception 'FALLO DB3-g: un paciente normal no recibió código'; end if;
  end;

  -- DB5/DB6 (textos de las funciones): candado del presupuesto y "for no key update" en vez de "for update" sobre pacientes_clinicos
  declare v_def text; v_fn text;
  begin
    v_def := pg_get_functiondef('app_private.evaluar_referido_venta(uuid,text,uuid,numeric,boolean,boolean)'::regprocedure);
    if position('programas_referidos where id = p_programa for no key update' in v_def) = 0 then raise exception 'FALLO DB5-a: evaluar_referido_venta no bloquea el programa del presupuesto'; end if;
    if position('programas_referidos where id = p_programa for no key update' in v_def) > position('costo_mes_programa(' in v_def) then raise exception 'FALLO DB5-b: el candado debe tomarse ANTES de leer el costo del mes'; end if;
    foreach v_fn in array array['app_private.otorgar_recompensa(uuid)', 'app_private.revertir_referido_venta(uuid)', 'public.ajustar_monedero(uuid,uuid,numeric,text)', 'public.vencer_creditos_referidos()'] loop
      v_def := pg_get_functiondef(v_fn::regprocedure);
      if position('for no key update' in v_def) = 0 then raise exception 'FALLO DB6-a: % no usa for no key update', v_fn; end if;
      if v_def ~* 'pacientes_clinicos[^;]*for update' then raise exception 'FALLO DB6-b: % aún bloquea pacientes_clinicos con for update', v_fn; end if;
    end loop;
    v_def := pg_get_functiondef('public.registrar_venta(uuid,uuid,text,jsonb,jsonb,uuid,text,numeric,boolean,boolean)'::regprocedure);
    if position('order by id for no key update' in v_def) = 0 then raise exception 'FALLO DB6-c: registrar_venta no bloquea comprador y referidor juntos y en orden'; end if;
    if (length(v_def) - length(replace(v_def, 'for update', ''))) / length('for update') <> 1 then
      raise exception 'FALLO DB6-d: registrar_venta debe conservar solo el for update previo del saldo a favor (hay %)', (length(v_def) - length(replace(v_def, 'for update', ''))) / length('for update');
    end if;
  end;

  -- DB6-e (funcional): comprador nuevo con código Y crédito en la misma venta (bloquea comprador + referidor ordenados) sigue funcionando
  declare n uuid; sn uuid; r record;
  begin
    n := pg_temp.paciente('Nora', '0996000150', v_focus, v_sf);
    insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, vence_en, motivo)
      values (v_prog, n, 'ajuste', 10, now() + interval '30 days', 'crédito previo prueba');
    sn := pg_temp.vender(v_focus, v_sf, vf, n, ca, 150, 130, 5);                    -- 150 - 15 (bienvenida) - 5 (crédito)
    select * into r from public.ventas where id = sn;
    if r.descuento <> 20 or r.total <> 130 or r.saldo <> 0 then raise exception 'FALLO DB6-e: totales % / % / %', r.descuento, r.total, r.saldo; end if;
    if app_private.saldo_disponible_monedero(v_prog, n) <> 5 then raise exception 'FALLO DB6-e2: saldo %', app_private.saldo_disponible_monedero(v_prog, n); end if;
  end;

  -- DB9: índices de llaves foráneas
  declare v_idx text;
  begin
    foreach v_idx in array array['monedero_venta_idx', 'monedero_referido_idx', 'referidos_codigo_idx', 'referidos_referidor_paciente_idx', 'referidos_referido_paciente_idx',
                                 'codigos_referido_paciente_idx', 'referidos_auditoria_programa_idx', 'referidos_auditoria_referido_idx', 'referidos_auditoria_venta_idx', 'referidos_auditoria_paciente_idx'] loop
      if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = v_idx) then raise exception 'FALLO DB9: falta el índice %', v_idx; end if;
    end loop;
  end;

  -- DB10: movimientos con el mismo creado_en salen siempre en el mismo orden (creado_en desc, id desc)
  declare p uuid; i int; j3 jsonb; j4 jsonb; v_esperado numeric[]; v_real numeric[];
  begin
    p := pg_temp.paciente('Orden', '0996000160', v_focus, v_sf);
    for i in 1..6 loop
      insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, vence_en, motivo)
        values (v_prog, p, 'ajuste', i, now() + interval '30 days', 'movimiento ' || i || ' prueba');
    end loop;
    if (select count(distinct creado_en) from public.monedero_movimientos where paciente_id = p) <> 1 then raise exception 'FALLO DB10-0: la prueba necesita movimientos con el mismo creado_en'; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', vf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    j3 := public.estado_monedero(p, v_focus);
    j4 := public.estado_monedero(p, v_focus);
    reset role;
    select array_agg(monto order by id desc) into v_esperado from public.monedero_movimientos where paciente_id = p;
    select array_agg((x->>'monto')::numeric order by ord) into v_real from jsonb_array_elements(j3->'movimientos') with ordinality as t(x, ord);
    if v_real is distinct from v_esperado then raise exception 'FALLO DB10-a: orden % y se esperaba (id desc) %', v_real, v_esperado; end if;
    if j3->'movimientos' is distinct from j4->'movimientos' then raise exception 'FALLO DB10-b: dos lecturas seguidas dieron distinto orden'; end if;
    if (j3->'movimientos'->0) ? 'id' then raise exception 'FALLO DB10-c: no debe exponerse el id interno'; end if;
  end;

  raise exception 'PRUEBAS_OK: correcciones (DB-1 a DB-10)';
end $$;
