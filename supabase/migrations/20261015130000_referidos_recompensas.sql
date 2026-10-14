-- Referidos y recompensas, fase 1 (4/5): recompensa al 100 % pagado, bonos por hito y reversas.

create or replace function app_private.otorgar_recompensa(p_referido uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.referidos; v_prog public.programas_referidos; v_cuenta integer; v_hito integer; v_bono numeric;
begin
  select * into r from public.referidos where id = p_referido and estado = 'en_pago' for update;
  if not found then return; end if;
  -- Bloquea al referidor: dos recompensas simultáneas no pueden contar el mismo total y saltarse el bono.
  perform 1 from public.pacientes_clinicos where id = r.referidor_paciente_id for update;
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

-- Reemplaza el marcador de la Task 2: otorga lo que quedó "en_pago" con la venta ya pagada.
create or replace function app_private.procesar_recompensas_pendientes(p_programa uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; v_n integer := 0;
begin
  for r in
    select rf.id from public.referidos rf join public.ventas v on v.id = rf.venta_id
     where rf.programa_id = p_programa and rf.estado = 'en_pago' and v.estado = 'completada' and v.saldo <= 0 and v.pagado >= v.total
  loop
    perform app_private.otorgar_recompensa(r.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function app_private.procesar_recompensas_pendientes(uuid) from public, anon, authenticated;

-- Anulación: revierte lo no gastado y devuelve el crédito usado en la venta anulada.
create or replace function app_private.revertir_referido_venta(p_venta uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.referidos; l record; u record; v_cuenta integer; v_hito integer; v_no_recuperado numeric;
begin
  for r in select * from public.referidos where venta_id = p_venta and estado in ('en_pago', 'recompensado') for update loop
    v_no_recuperado := 0;
    -- Bloquea al referidor antes de leer lo que queda de cada lote (evita revertir en paralelo a un gasto).
    perform 1 from public.pacientes_clinicos where id = r.referidor_paciente_id for update;
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

  -- Crédito que quien compró usó en la venta anulada: vuelve al monedero mientras no haya vencido.
  for u in
    select q.programa_id, q.paciente_id,
           -sum(q.monto) as total,
           -coalesce(sum(q.monto) filter (where not q.revertido), 0) as devolvible,
           max(q.vence_en) filter (where not q.revertido) as vence
    from (
      select x.programa_id, x.paciente_id, x.monto, lt.vence_en,
             exists (select 1 from public.monedero_movimientos z where z.lote_id = lt.id and z.tipo = 'reversa') as revertido
      from public.monedero_movimientos x join public.monedero_movimientos lt on lt.id = x.lote_id
      where x.venta_id = p_venta and x.tipo = 'uso'
    ) q
    group by q.programa_id, q.paciente_id
  loop
    if u.total - u.devolvible > 0 then
      insert into public.referidos_auditoria (programa_id, evento, paciente_id, venta_id, detalle)
      values (u.programa_id, 'credito_no_devuelto', u.paciente_id, p_venta,
              jsonb_build_object('monto', u.total - u.devolvible, 'motivo', 'el crédito de origen ya fue revertido'));
    end if;
    if u.devolvible > 0 then
      if u.vence > now() then
        insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, vence_en, venta_id, motivo)
        values (u.programa_id, u.paciente_id, 'devolucion', u.devolvible, u.vence, p_venta, 'Venta anulada: se devuelve el crédito usado') on conflict do nothing;
      else
        insert into public.referidos_auditoria (programa_id, evento, paciente_id, venta_id, detalle)
        values (u.programa_id, 'credito_vencido_no_devuelto', u.paciente_id, p_venta, jsonb_build_object('monto', u.devolvible));
      end if;
    end if;
  end loop;
end $$;
revoke all on function app_private.revertir_referido_venta(uuid) from public, anon, authenticated;

create or replace function app_private.trg_ventas_referidos()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if new.estado = 'completada' and new.saldo <= 0 and new.pagado >= new.total and (old.estado is distinct from 'completada' or old.saldo > 0) then
    for r in select id from public.referidos where venta_id = new.id and estado = 'en_pago' loop
      perform app_private.otorgar_recompensa(r.id);
    end loop;
  elsif new.estado = 'anulada' and old.estado is distinct from 'anulada' then
    perform app_private.revertir_referido_venta(new.id);
  end if;
  return new;
end $$;
revoke all on function app_private.trg_ventas_referidos() from public, anon, authenticated;
drop trigger if exists trg_ventas_referidos on public.ventas;
create trigger trg_ventas_referidos after update on public.ventas
  for each row execute function app_private.trg_ventas_referidos();
