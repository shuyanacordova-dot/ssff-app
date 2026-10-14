-- Referidos y recompensas, fase 1 (2/5): códigos únicos y guardado de configuración.

-- Crea (o devuelve) el código del paciente. Bloquea la fila del programa para numerar sin huecos ni repetidos.
create or replace function app_private.asegurar_codigo_referido(p_programa uuid, p_paciente uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_prog public.programas_referidos; v_codigo text;
begin
  select codigo into v_codigo from public.codigos_referido where programa_id = p_programa and paciente_id = p_paciente;
  if v_codigo is not null then return v_codigo; end if;
  select * into v_prog from public.programas_referidos where id = p_programa for update;
  select codigo into v_codigo from public.codigos_referido where programa_id = p_programa and paciente_id = p_paciente;
  if v_codigo is not null then return v_codigo; end if;
  v_codigo := v_prog.prefijo || '-' || lpad(v_prog.siguiente_numero::text, 6, '0');
  insert into public.codigos_referido (programa_id, paciente_id, codigo) values (p_programa, p_paciente, v_codigo);
  update public.programas_referidos set siguiente_numero = siguiente_numero + 1 where id = p_programa;
  return v_codigo;
end $$;
revoke all on function app_private.asegurar_codigo_referido(uuid, uuid) from public, anon, authenticated;

-- Paciente nuevo en una empresa con programa encendido: recibe su código. Nunca debe romper el alta del paciente.
create or replace function app_private.trg_codigo_nuevo_paciente()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_prog uuid;
begin
  begin
    select id into v_prog from public.programas_referidos where empresa_id = new.empresa_id and activo;
    if v_prog is not null then perform app_private.asegurar_codigo_referido(v_prog, new.paciente_id); end if;
  exception when others then
    raise warning 'No se pudo crear el código de referido: %', sqlerrm;
  end;
  return new;
end $$;
revoke all on function app_private.trg_codigo_nuevo_paciente() from public, anon, authenticated;
drop trigger if exists trg_codigo_nuevo_paciente on public.paciente_empresas;
create trigger trg_codigo_nuevo_paciente after insert on public.paciente_empresas
  for each row execute function app_private.trg_codigo_nuevo_paciente();

create or replace function public.obtener_codigo_referido(p_paciente uuid, p_empresa uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_prog public.programas_referidos;
begin
  if public.rol_referidos(p_empresa) is null then raise exception 'No autorizado'; end if;
  select * into v_prog from public.programas_referidos where empresa_id = p_empresa;
  if not found or not v_prog.activo then return null; end if;
  if not exists (select 1 from public.paciente_empresas where paciente_id = p_paciente and empresa_id = p_empresa) then
    raise exception 'El paciente no pertenece a esta óptica.';
  end if;
  return app_private.asegurar_codigo_referido(v_prog.id, p_paciente);
end $$;
revoke all on function public.obtener_codigo_referido(uuid, uuid) from public, anon;
grant execute on function public.obtener_codigo_referido(uuid, uuid) to authenticated;

-- Marcador: la Task 4 lo reemplaza por la versión real (otorga recompensas que quedaron en espera).
create or replace function app_private.procesar_recompensas_pendientes(p_programa uuid)
returns integer language plpgsql security definer set search_path = '' as $$
begin
  return 0;
end $$;
revoke all on function app_private.procesar_recompensas_pendientes(uuid) from public, anon, authenticated;

create or replace function public.guardar_programa_referidos(p_programa uuid, p_cambios jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_antes public.programas_referidos; v_despues public.programas_referidos; v_user uuid; v_creados integer := 0; v_otorgadas integer := 0;
begin
  if not public.es_superadmin() then raise exception 'Solo la Superadministradora puede configurar los programas de referidos.'; end if;
  select id into v_user from public.usuarios where auth_user_id = (select auth.uid()) and activo;
  select * into v_antes from public.programas_referidos where id = p_programa for update;
  if not found then raise exception 'Programa no encontrado.'; end if;

  update public.programas_referidos set
    nombre = coalesce(nullif(btrim(p_cambios->>'nombre'), ''), nombre),
    activo = coalesce((p_cambios->>'activo')::boolean, activo),
    recompensas_suspendidas = coalesce((p_cambios->>'recompensas_suspendidas')::boolean, recompensas_suspendidas),
    compra_minima = coalesce((p_cambios->>'compra_minima')::numeric, compra_minima),
    descuento_bienvenida = coalesce((p_cambios->>'descuento_bienvenida')::numeric, descuento_bienvenida),
    credito_por_referido = coalesce((p_cambios->>'credito_por_referido')::numeric, credito_por_referido),
    bono_3_referidos = coalesce((p_cambios->>'bono_3_referidos')::numeric, bono_3_referidos),
    bono_5_referidos = coalesce((p_cambios->>'bono_5_referidos')::numeric, bono_5_referidos),
    vigencia_credito_dias = coalesce((p_cambios->>'vigencia_credito_dias')::integer, vigencia_credito_dias),
    tope_uso_porcentaje = coalesce((p_cambios->>'tope_uso_porcentaje')::numeric, tope_uso_porcentaje),
    presupuesto_mensual = case when p_cambios ? 'presupuesto_mensual' then nullif(p_cambios->>'presupuesto_mensual', '')::numeric else presupuesto_mensual end,
    campana_desde = case when p_cambios ? 'campana_desde' then nullif(p_cambios->>'campana_desde', '')::date else campana_desde end,
    campana_hasta = case when p_cambios ? 'campana_hasta' then nullif(p_cambios->>'campana_hasta', '')::date else campana_hasta end,
    categorias_excluidas = case when p_cambios ? 'categorias_excluidas' then coalesce(array(select jsonb_array_elements_text(p_cambios->'categorias_excluidas')), '{}') else categorias_excluidas end,
    actualizado_en = now(), actualizado_por = v_user
  where id = p_programa
  returning * into v_despues;

  insert into public.referidos_auditoria (programa_id, evento, detalle, usuario_id)
  values (p_programa, 'config', jsonb_build_object('antes', to_jsonb(v_antes), 'despues', to_jsonb(v_despues)), v_user);

  -- Al encender: códigos para todos los pacientes de la empresa que aún no tienen (sin Consumidor Final).
  if v_despues.activo and not v_antes.activo then
    with nuevos as (
      select pe.paciente_id, row_number() over (order by pe.paciente_id) as rn
      from public.paciente_empresas pe
      join public.pacientes_clinicos pc on pc.id = pe.paciente_id
      where pe.empresa_id = v_despues.empresa_id
        and pc.cedula is distinct from '9999999999999'
        and not exists (select 1 from public.codigos_referido c where c.programa_id = v_despues.id and c.paciente_id = pe.paciente_id)
    ), ins as (
      insert into public.codigos_referido (programa_id, paciente_id, codigo)
      select v_despues.id, n.paciente_id, v_despues.prefijo || '-' || lpad((v_despues.siguiente_numero + n.rn - 1)::text, 6, '0')
      from nuevos n
      returning 1
    )
    select count(*) into v_creados from ins;
    update public.programas_referidos set siguiente_numero = siguiente_numero + v_creados where id = p_programa;
  end if;

  -- Al reanudar recompensas: otorga las que quedaron en espera.
  if v_antes.recompensas_suspendidas and not v_despues.recompensas_suspendidas then
    v_otorgadas := app_private.procesar_recompensas_pendientes(p_programa);
  end if;

  return jsonb_build_object('ok', true, 'codigos_creados', v_creados, 'recompensas_otorgadas', v_otorgadas);
end $$;
revoke all on function public.guardar_programa_referidos(uuid, jsonb) from public, anon;
grant execute on function public.guardar_programa_referidos(uuid, jsonb) to authenticated;
