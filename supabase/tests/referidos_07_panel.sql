-- Pruebas del panel de referidos (fase 2). Se manda como [migración] + [preludio] + [este archivo] en UNA llamada de execute_sql;
-- termina siempre con un error a propósito (PRUEBAS_OK o FALLO ...) y la transacción se deshace sola.

create or replace function pg_temp.panel(p_auth uuid, p_empresa uuid, p_desde date, p_hasta date, p_suc uuid default null)
returns jsonb language plpgsql as $f$
declare v jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    v := public.panel_referidos(p_empresa, p_desde, p_hasta, p_suc);
  exception when others then
    reset role;
    raise;
  end;
  reset role;
  return v;
end $f$;

create or replace function pg_temp.detalle(p_auth uuid, p_empresa uuid, p_referidor uuid, p_desde date, p_hasta date, p_suc uuid default null)
returns jsonb language plpgsql as $f$
declare v jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    v := public.panel_referidos_detalle(p_empresa, p_referidor, p_desde, p_hasta, p_suc);
  exception when others then
    reset role;
    raise;
  end;
  reset role;
  return v;
end $f$;

-- Ejecuta el panel esperando un error cuyo mensaje contenga el fragmento.
create or replace function pg_temp.panel_falla(p_caso text, p_fragmento text, p_auth uuid, p_empresa uuid, p_desde date, p_hasta date, p_suc uuid default null)
returns void language plpgsql as $f$
begin
  begin
    perform pg_temp.panel(p_auth, p_empresa, p_desde, p_hasta, p_suc);
  exception when others then
    if position(lower(p_fragmento) in lower(sqlerrm)) = 0 then
      raise exception 'FALLO %: se esperaba un error con "%" y salió "%"', p_caso, p_fragmento, sqlerrm;
    end if;
    return;
  end;
  raise exception 'FALLO %: se esperaba un error con "%" pero el panel respondió', p_caso, p_fragmento;
end $f$;

do $$
declare
  v_shu uuid := current_setting('t.shu')::uuid;
  v_focus uuid := current_setting('t.focus')::uuid;
  su uuid := current_setting('t.su')::uuid;
  vend uuid := current_setting('t.vend_shu')::uuid;
  adm_focus uuid := current_setting('t.vend_focus')::uuid;
  s_mat uuid := current_setting('t.suc_shu')::uuid;
  s_foc uuid := current_setting('t.suc_focus')::uuid;
  s_sac uuid; adm_sac uuid; v_prog uuid;
  hoy date := (now() at time zone 'America/Guayaquil')::date;
  a uuid; a2 uuid; b uuid; c uuid; d uuid; e uuid; f uuid; g uuid; ca text; ca2 text; sf uuid; se uuid;
  r jsonb; i jsonb; det jsonb;
begin
  select id into s_sac from public.sucursales where empresa_id = v_shu and nombre = 'Shuvision Sacha';
  select u.auth_user_id into adm_sac from public.usuarios u join public.roles ro on ro.id = u.rol_id
   where ro.nombre = 'admin_sucursal' and u.activo and u.sucursal_id = s_sac limit 1;
  if s_sac is null or adm_sac is null or s_mat = s_sac then raise exception 'PRELUDIO7: falta Sacha, su administrador o la sucursal Shuvision'; end if;
  if (select u.sucursal_id from public.usuarios u where u.auth_user_id = vend) is distinct from s_mat then
    raise exception 'PRELUDIO7: el vendedor de Shuvisión no está en la sucursal Shuvision';
  end if;
  select id into v_prog from public.programas_referidos where empresa_id = v_shu;

  -- Datos: A (referidor) con B, C, D, E, F; A2 con G; A usa $8 de crédito. Descuento SHU = $10.
  a := pg_temp.paciente('Ana', '0995000001', v_shu, s_mat);
  a2 := pg_temp.paciente('Ana2', '0995000002', v_shu, s_mat);
  select codigo into ca from public.codigos_referido where programa_id = v_prog and paciente_id = a;
  select codigo into ca2 from public.codigos_referido where programa_id = v_prog and paciente_id = a2;
  b := pg_temp.paciente('Beto', '0995000003', v_shu, s_mat);
  c := pg_temp.paciente('Carla', '0995000004', v_shu, s_sac);
  d := pg_temp.paciente('Dani', '0995000005', v_shu, s_mat);
  e := pg_temp.paciente('Eva', '0995000006', v_shu, s_mat);
  f := pg_temp.paciente('Fer', '0995000007', v_shu, s_mat);
  g := pg_temp.paciente('Gabo', '0995000008', v_shu, s_mat);

  perform pg_temp.vender(v_shu, s_mat, vend, b, ca, 150, 140);          -- B: matriz, total 140, pagada
  perform pg_temp.vender(v_shu, s_sac, vend, c, ca, 200, 190);          -- C: Sacha, total 190, pagada
  perform set_config('request.jwt.claims', json_build_object('sub', vend, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.registrar_referido_ficha(d, v_shu, ca);                -- D: registrado en la ficha, sin venta
  reset role;
  se := pg_temp.vender(v_shu, s_mat, vend, e, ca, 120, 50);             -- E: matriz, total 110, a medias
  sf := pg_temp.vender(v_shu, s_mat, vend, f, ca, 130, 50);             -- F: matriz, total 120, a medias...
  perform set_config('request.jwt.claims', json_build_object('sub', su, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.anular_venta_con_modo(sf, 'Prueba de anulación del panel', 'credito');  -- ...y anulada
  reset role;
  perform pg_temp.vender(v_shu, s_mat, vend, g, ca2, 200, 190);         -- G (de A2): matriz, total 190, pagada
  perform pg_temp.vender(v_shu, s_mat, vend, a, null, 100, 92, 8);      -- A gasta $8 de crédito en una compra de $100
  insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, vence_en, motivo)
    values (v_prog, a, 'ajuste', 5, now() - interval '1 day', 'lote vencido del panel');
  perform public.vencer_creditos_referidos();                            -- el ajuste de $5 vence (sin venta: solo en "Todas")

  -- P1: "Todas" (superadmin)
  r := pg_temp.panel(su, v_shu, hoy, hoy, null);
  i := r->'indicadores';
  if not (r->>'programa_activo')::boolean then raise exception 'FALLO P1a: programa_activo'; end if;
  if (i->>'codigos')::int <> 8 then raise exception 'FALLO P1b: códigos %', i->>'codigos'; end if;
  if (i->>'registrados')::int <> 6 or (i->>'compraron')::int <> 4 or (i->>'conversion')::numeric <> 66.7 then raise exception 'FALLO P1c: registrados/compraron/conversión %', i; end if;
  if (i->>'ventas_n')::int <> 4 or (i->>'ventas_total')::numeric <> 630 or (i->>'ticket')::numeric <> 157.5 then raise exception 'FALLO P1d: ventas %', i; end if;
  if (i->>'descuentos')::numeric <> 40 or (i->>'pendientes')::numeric <> 10 then raise exception 'FALLO P1e: descuentos/pendientes %', i; end if;
  if (i->>'creditos_generados')::numeric <> 35 or (i->>'creditos_usados')::numeric <> 8 or (i->>'creditos_vencidos')::numeric <> 5 then raise exception 'FALLO P1f: créditos %', i; end if;
  if (i->>'bonos_n')::int <> 0 or (i->>'bonos_monto')::numeric <> 0 then raise exception 'FALLO P1g: bonos %', i; end if;
  -- P2/P3: costo = descuentos + créditos USADOS (no lo generado, no lo vencido); F anulada no cuenta
  if (i->>'costo')::numeric <> 48 or (i->>'resultado')::numeric <> 582 or (i->>'costo_pct')::numeric <> 7.6 then raise exception 'FALLO P3: costo/resultado %', i; end if;

  -- P4: ranking de "Todas": A primero (2 exitosos, $440 en ventas), luego A2
  if (r->>'ranking_total')::int <> 2 then raise exception 'FALLO P4a: ranking_total %', r->>'ranking_total'; end if;
  if (r->'ranking'->0->>'paciente_id')::uuid <> a or (r->'ranking'->0->>'exitosos')::int <> 2 or (r->'ranking'->0->>'ventas')::numeric <> 440
     or (r->'ranking'->0->>'credito_ganado')::numeric <> 20 or (r->'ranking'->0->>'disponible')::numeric <> 12
     or r->'ranking'->0->>'codigo' <> ca then
    raise exception 'FALLO P4b: fila de A %', r->'ranking'->0;
  end if;
  if (r->'ranking'->1->>'paciente_id')::uuid <> a2 or (r->'ranking'->1->>'exitosos')::int <> 1 or (r->'ranking'->1->>'ventas')::numeric <> 190 then
    raise exception 'FALLO P4c: fila de A2 %', r->'ranking'->1;
  end if;

  -- P5/P6: sucursal Matriz (el referido D sin venta cuenta por quien lo registró; C de Sacha no cuenta)
  i := pg_temp.panel(su, v_shu, hoy, hoy, s_mat)->'indicadores';
  if (i->>'registrados')::int <> 5 or (i->>'compraron')::int <> 3 or (i->>'ventas_n')::int <> 3 or (i->>'ventas_total')::numeric <> 440 then raise exception 'FALLO P5a: matriz %', i; end if;
  if (i->>'descuentos')::numeric <> 30 or (i->>'pendientes')::numeric <> 10 or (i->>'creditos_generados')::numeric <> 20 then raise exception 'FALLO P5b: matriz %', i; end if;
  if (i->>'creditos_usados')::numeric <> 8 or (i->>'creditos_vencidos')::numeric <> 0 or (i->>'costo')::numeric <> 38 or (i->>'resultado')::numeric <> 402 then raise exception 'FALLO P5c: matriz %', i; end if;
  -- Sacha
  i := pg_temp.panel(su, v_shu, hoy, hoy, s_sac)->'indicadores';
  if (i->>'registrados')::int <> 1 or (i->>'compraron')::int <> 1 or (i->>'ventas_total')::numeric <> 190 or (i->>'descuentos')::numeric <> 10
     or (i->>'pendientes')::numeric <> 0 or (i->>'creditos_generados')::numeric <> 10 or (i->>'creditos_usados')::numeric <> 0 or (i->>'costo')::numeric <> 10 or (i->>'resultado')::numeric <> 180 then
    raise exception 'FALLO P6: Sacha %', i;
  end if;

  -- P7: el administrador de Sacha queda forzado a su sucursal aunque pida otra o "todas"
  r := pg_temp.panel(adm_sac, v_shu, hoy, hoy, s_mat);
  if (r->>'sucursal')::uuid <> s_sac or (r->'indicadores'->>'registrados')::int <> 1 or jsonb_array_length(r->'sucursales') <> 1 then raise exception 'FALLO P7a: forzado a Sacha %', r; end if;
  r := pg_temp.panel(adm_sac, v_shu, hoy, hoy, null);
  if (r->>'sucursal')::uuid <> s_sac or (r->'indicadores'->>'ventas_total')::numeric <> 190 then raise exception 'FALLO P7b: "todas" forzado a Sacha %', r; end if;
  -- la superadmin ve las dos sucursales en la lista
  if jsonb_array_length(pg_temp.panel(su, v_shu, hoy, hoy, null)->'sucursales') <> 2 then raise exception 'FALLO P7c: sucursales de la superadmin'; end if;

  -- P8: accesos
  perform pg_temp.panel_falla('P8a', 'No autorizado', vend, v_shu, hoy, hoy);            -- vendedor
  perform pg_temp.panel_falla('P8b', 'No autorizado', adm_focus, v_shu, hoy, hoy);       -- administrador de OTRA óptica
  perform pg_temp.panel_falla('P8c', 'no pertenece', su, v_shu, hoy, hoy, s_foc);        -- sucursal de otra óptica
  perform pg_temp.panel_falla('P8d', 'fecha inicial', su, v_shu, hoy, hoy - 1);          -- desde > hasta
  perform pg_temp.panel_falla('P8e', '366 días', su, v_shu, hoy - 400, hoy);             -- más de 366 días

  -- P9: frontera del día en Ecuador: aplicado el 10-oct a las 23:30 (-05) pertenece al 10, no al 11
  update public.referidos set aplicado_en = timestamptz '2026-10-10 23:30:00-05' where venta_id = se;
  i := pg_temp.panel(su, v_shu, date '2026-10-10', date '2026-10-10', null)->'indicadores';
  if (i->>'ventas_n')::int <> 1 or (i->>'ventas_total')::numeric <> 110 then raise exception 'FALLO P9a: el 10-oct %', i; end if;
  i := pg_temp.panel(su, v_shu, date '2026-10-11', date '2026-10-11', null)->'indicadores';
  if (i->>'ventas_n')::int <> 0 then raise exception 'FALLO P9b: el 11-oct %', i; end if;

  -- P10: detalle de A (superadmin) y de Sacha (administrador de Sacha)
  det := pg_temp.detalle(su, v_shu, a, hoy, hoy, null);
  if det->'referidor'->>'codigo' <> ca or jsonb_array_length(det->'referidos') <> 5 then raise exception 'FALLO P10a: referidos de A %', det->'referidos'; end if;
  if (det->'resumen'->>'exitosos')::int <> 2 or (det->'resumen'->>'en_espera')::int <> 1 or (det->'resumen'->>'disponible')::numeric <> 12 then raise exception 'FALLO P10b: resumen %', det->'resumen'; end if;
  if not exists (select 1 from jsonb_array_elements(det->'movimientos') m where m->>'tipo' = 'uso' and (m->>'monto')::numeric = -8) then raise exception 'FALLO P10c: falta el uso de $8'; end if;
  if not exists (select 1 from jsonb_array_elements(det->'referidos') x where x->>'estado' = 'revertido') then raise exception 'FALLO P10d: falta el referido revertido en el detalle'; end if;
  det := pg_temp.detalle(adm_sac, v_shu, a, hoy, hoy, null);
  if jsonb_array_length(det->'referidos') <> 1 then raise exception 'FALLO P10e: el administrador de Sacha vio % referidos', jsonb_array_length(det->'referidos'); end if;
  begin
    perform pg_temp.detalle(vend, v_shu, a, hoy, hoy, null);
    raise exception 'FALLO P10f: un vendedor abrió el detalle';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;

  -- P11: óptica sin datos: ceros y sin errores (administrador de Focus); luego programa apagado
  r := pg_temp.panel(adm_focus, v_focus, hoy, hoy, null);
  i := r->'indicadores';
  if (i->>'registrados')::int <> 0 or (i->>'ventas_total')::numeric <> 0 or (i->>'costo')::numeric <> 0 or i->'conversion' <> 'null'::jsonb or i->'ticket' <> 'null'::jsonb or i->'costo_pct' <> 'null'::jsonb
     or r->'ranking' <> '[]'::jsonb or (r->>'ranking_total')::int <> 0 then
    raise exception 'FALLO P11a: Focus sin datos %', r;
  end if;
  update public.programas_referidos set activo = false where empresa_id = v_focus;
  r := pg_temp.panel(adm_focus, v_focus, hoy, hoy, null);
  if (r->>'programa_activo')::boolean then raise exception 'FALLO P11b: el programa apagado figura activo'; end if;

  raise exception 'PRUEBAS_OK: panel de referidos (P1-P11)';
end $$;
