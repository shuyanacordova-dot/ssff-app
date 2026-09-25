-- Carga de lo que faltaba de Optox (capturas del Resumen del día 22, 23 y 24-sep-2026 enviadas por Shuyana).
-- Idempotente: cada venta se identifica por "Migración OPTOX - folio N" dentro de su sucursal.
do $$
declare
  shu constant uuid := '51820b6b-9fc1-495c-b2ea-ab50547e2ce3';
  foc constant uuid := 'be1dc246-219a-40a2-9e92-707e5845d295';
  s_shu constant uuid := '3bd2a17c-b4e0-4137-a5f3-66475dbcb836';
  s_sac constant uuid := '1db17433-cc24-409f-92d2-794a01ce79d4';
  s_foc constant uuid := 'e2775b83-2105-46a7-8c40-d8de6b3a63dd';
  u_shuyana constant uuid := '535f7c2d-fc42-4a4c-a7f6-fb8b8a5598b6';
  u_ruby constant uuid := 'd72aa0c5-ced4-4dd5-b504-c98758630e23';
  u_tiffany constant uuid := 'bd1c3f4d-23a7-4f5b-8909-dd328d4e79d4';
  u_erick constant uuid := '40d6c60f-662d-4535-b8f7-91010dead3b8';
  r record;
  v_id uuid;
begin
  -- Se ejecuta con la identidad de Shuyana (superadmin) para pasar los controles de abonos
  perform set_config('request.jwt.claims', json_build_object('sub','b5e6cfbf-3829-4904-b4e5-e8274e4e9960','role','authenticated')::text, true);
  -- 1) Ventas nuevas del 24-sep con sus abonos
  for r in
    select * from (values
      (shu, s_shu, 6802, '2026-09-24 16:37:02', 'e012d273-b715-4815-a5e9-8b410a3e179d'::uuid, null::text, 200.00, 0.00, u_ruby,
         jsonb_build_array(jsonb_build_object('m','efectivo','monto',100))),
      (shu, s_shu, 6803, '2026-09-24 17:33:48', null, 'FINAL 2026 CONSUMIDOR', 1.00, 0.00, u_ruby,
         jsonb_build_array(jsonb_build_object('m','efectivo','monto',1))),
      (shu, s_sac, 174, '2026-09-24 18:07:57', null, 'Final Consumidor', 35.00, 0.00, u_tiffany,
         jsonb_build_array(jsonb_build_object('m','transferencia','monto',20), jsonb_build_object('m','efectivo','monto',15))),
      (shu, s_sac, 175, '2026-09-24 18:51:51', null, 'Dilan Orley Loor Parraga', 10.00, 0.00, u_tiffany,
         jsonb_build_array(jsonb_build_object('m','efectivo','monto',10))),
      (foc, s_foc, 6565, '2026-09-24 12:47:24', '919d0720-301d-42bd-9599-7cd3a65fd276'::uuid, null, 100.00, 0.00, u_erick,
         jsonb_build_array(jsonb_build_object('m','efectivo','monto',100))),
      (foc, s_foc, 6566, '2026-09-24 14:29:01', null, 'FINAL CONSUMIDOR', 70.00, 0.00, u_erick,
         jsonb_build_array(jsonb_build_object('m','transferencia','monto',70)))
    ) t(empresa, sucursal, folio_optox, hora, paciente, cliente, total, descuento, recibio, pagos)
  loop
    if exists (
      select 1 from public.ventas v join public.venta_items i on i.venta_id = v.id
      where v.sucursal_id = r.sucursal and i.descripcion = 'Migración OPTOX - folio ' || r.folio_optox
    ) then
      continue;
    end if;

    insert into public.ventas (empresa_id, sucursal_id, paciente_id, cliente_nombre, estado, subtotal, descuento, total, pagado, saldo, created_by, creado_en, actualizado_en)
    values (r.empresa, r.sucursal, r.paciente, r.cliente, 'completada', r.total + r.descuento, r.descuento, r.total,
            (select coalesce(sum((p->>'monto')::numeric), 0) from jsonb_array_elements(r.pagos) p),
            r.total - (select coalesce(sum((p->>'monto')::numeric), 0) from jsonb_array_elements(r.pagos) p),
            u_shuyana, (r.hora::timestamp at time zone 'America/Guayaquil'), now())
    returning id into v_id;

    insert into public.venta_items (venta_id, descripcion, cantidad, precio_unitario, descuento, total_linea)
    values (v_id, 'Migración OPTOX - folio ' || r.folio_optox, 1, r.total + r.descuento, r.descuento, r.total);

    insert into public.pagos_venta (venta_id, metodo, monto, referencia, recibido_por, creado_en)
    select v_id, p->>'m', (p->>'monto')::numeric, 'Optox folio ' || r.folio_optox, r.recibio,
           (r.hora::timestamp at time zone 'America/Guayaquil')
    from jsonb_array_elements(r.pagos) p;
  end loop;

  -- Angela Naguecha Nieto queda vinculada a Focus
  insert into public.paciente_empresas (paciente_id, empresa_id, primera_sucursal_id, primera_atencion_en, ultima_atencion_en, created_by)
  select '919d0720-301d-42bd-9599-7cd3a65fd276', foc, s_foc, '2026-09-24 17:47:24+00', '2026-09-24 17:47:24+00', u_shuyana
  where not exists (select 1 from public.paciente_empresas where paciente_id = '919d0720-301d-42bd-9599-7cd3a65fd276' and empresa_id = foc);

  -- 2) Abonos que existían en Optox pero no en LumOS (ventas ya cargadas).
  --    En 5766/5767 el abono había quedado en la copia anulada; en 5599/5600/5768 nunca se creó.
  for r in
    select * from (values
      (5599, 'efectivo', 5.00, '2026-09-23 13:16:14', u_ruby, 'Optox abono 7296', false),
      (5600, 'efectivo', 5.00, '2026-09-23 15:21:57', u_ruby, 'Optox abono 7297', false),
      (5766, 'efectivo', 120.00, '2026-09-23 11:01:07', u_ruby, 'Optox abono 7293', false),
      (5767, 'efectivo', 120.00, '2026-09-23 15:51:36', u_ruby, 'Optox abono 7298', false),
      (5768, 'transferencia', 340.00, '2026-09-23 20:03:53', u_shuyana, 'Optox abono 7300', false),
      (5652, 'transferencia', 100.00, '2026-09-24 12:00:00', u_erick, 'Optox abono 787', true),
      (5197, 'transferencia', 55.00, '2026-09-19 12:00:00', u_erick, 'Abono del 19-sep (estaba en la copia anulada 5650)', true)
    ) t(folio, metodo, monto, hora, recibio, ref, suma_al_pagado)
  loop
    select id into v_id from public.ventas where folio = r.folio and estado <> 'anulada';
    if v_id is null or exists (select 1 from public.pagos_venta where venta_id = v_id and referencia = r.ref) then
      continue;
    end if;
    insert into public.pagos_venta (venta_id, metodo, monto, referencia, recibido_por, creado_en)
    values (v_id, r.metodo, r.monto, r.ref, r.recibio, (r.hora::timestamp at time zone 'America/Guayaquil'));
    if r.suma_al_pagado then
      update public.ventas set pagado = pagado + r.monto, saldo = greatest(saldo - r.monto, 0), actualizado_en = now() where id = v_id;
    end if;
  end loop;

  -- 3) Salidas del 24-sep
  insert into public.gastos (empresa_id, sucursal_id, fecha, clasificacion, concepto, monto, origen, observaciones, created_by)
  select g.* from (values
    (shu, s_shu, date '2026-09-24', 'pago_proveedor', 'BAÑOS', 5.00, 'caja', 'PAQUETE PARA PROVISION (1 de 2)', u_ruby),
    (shu, s_shu, date '2026-09-24', 'pago_proveedor', 'BAÑOS', 5.00, 'caja', 'PAQUETE PARA PROVISION (2 de 2)', u_ruby),
    (shu, s_shu, date '2026-09-24', 'gastos_operacion', 'GASTOS DIARIOS', 1.00, 'caja', 'JULI', u_ruby),
    (shu, s_sac, date '2026-09-24', 'gastos_operacion', 'Manis Sra Jassy', 1.00, 'caja', null, u_tiffany)
  ) g(empresa_id, sucursal_id, fecha, clasificacion, concepto, monto, origen, observaciones, created_by)
  where not exists (
    select 1 from public.gastos x
    where x.sucursal_id = g.sucursal_id and x.fecha = g.fecha and x.concepto = g.concepto
      and x.observaciones is not distinct from g.observaciones
  );
end $$;
