-- Referidos y recompensas, fase 1 (5/5): vencimientos (cron) y ajustes manuales.

-- Vence los lotes de crédito cuya fecha ya pasó. Recorre lote por lote y, ANTES de calcular lo que
-- queda de cada lote, bloquea la fila del paciente (igual que registrar_venta al gastar crédito),
-- para que el cron no compita con una compra que esté usando ese mismo crédito.
create or replace function public.vencer_creditos_referidos()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_resta numeric;
  v_row integer;
  v_n integer := 0;
begin
  for r in
    select l.id, l.programa_id, l.paciente_id
    from public.monedero_movimientos l
    join public.monedero_movimientos m on m.id = l.id or m.lote_id = l.id
    where l.monto > 0 and l.vence_en <= now()
    group by l.id, l.programa_id, l.paciente_id
    having sum(m.monto) > 0
    order by l.id
  loop
    perform 1 from public.pacientes_clinicos where id = r.paciente_id for update;
    select sum(m.monto) into v_resta
    from public.monedero_movimientos m
    where m.id = r.id or m.lote_id = r.id;
    if coalesce(v_resta, 0) > 0 then
      insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, lote_id, motivo)
      values (r.programa_id, r.paciente_id, 'vencimiento', -v_resta, r.id, 'Crédito vencido')
      on conflict do nothing;
      get diagnostics v_row = row_count;
      v_n := v_n + v_row;
    end if;
  end loop;
  return v_n;
end $$;
revoke all on function public.vencer_creditos_referidos() from public, anon, authenticated;
grant execute on function public.vencer_creditos_referidos() to service_role;

create or replace function public.ajustar_monedero(p_programa uuid, p_paciente uuid, p_monto numeric, p_motivo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_prog public.programas_referidos; v_user uuid; v_consumido numeric;
begin
  if not public.es_superadmin() then raise exception 'Solo la Superadministradora puede ajustar un monedero.'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Indica el motivo del ajuste (mínimo 5 caracteres).'; end if;
  if p_monto is null or p_monto = 0 then raise exception 'El monto del ajuste no puede ser cero.'; end if;
  select * into v_prog from public.programas_referidos where id = p_programa;
  if not found then raise exception 'Programa no encontrado.'; end if;
  if not exists (select 1 from public.paciente_empresas where paciente_id = p_paciente and empresa_id = v_prog.empresa_id) then
    raise exception 'El paciente no pertenece a esta óptica.';
  end if;
  select id into v_user from public.usuarios where auth_user_id = (select auth.uid()) and activo;
  perform 1 from public.pacientes_clinicos where id = p_paciente for update;
  if p_monto > 0 then
    insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, vence_en, motivo, creado_por)
    values (p_programa, p_paciente, 'ajuste', round(p_monto, 2), now() + make_interval(days => v_prog.vigencia_credito_dias), btrim(p_motivo), v_user);
  else
    v_consumido := app_private.consumir_monedero(p_programa, p_paciente, -p_monto, 'ajuste', null, btrim(p_motivo), v_user);
    if v_consumido < round(-p_monto, 2) then
      raise exception 'El paciente solo tiene $% disponible.', to_char(v_consumido, 'FM999990.00');
    end if;
  end if;
  insert into public.referidos_auditoria (programa_id, evento, paciente_id, detalle, usuario_id)
  values (p_programa, 'ajuste_manual', p_paciente, jsonb_build_object('monto', round(p_monto, 2), 'motivo', btrim(p_motivo)), v_user);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.ajustar_monedero(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.ajustar_monedero(uuid, uuid, numeric, text) to authenticated;
