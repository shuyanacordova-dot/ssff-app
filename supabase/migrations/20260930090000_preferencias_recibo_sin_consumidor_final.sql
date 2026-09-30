-- Las casillas de datos/promociones no aplican a ventas de "Consumidor final" (ficha genérica, no es una persona).

create or replace function app_private.es_consumidor_final(p_paciente uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select coalesce((select trim(coalesce(nombres, '') || ' ' || coalesce(apellidos, '')) ~* '^consumidor\s+final$' from public.pacientes_clinicos where id = p_paciente), true);
$$;
revoke all on function app_private.es_consumidor_final(uuid) from public, anon, authenticated;

create or replace function public.preferencias_datos_recibo(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $$
declare v_paciente uuid; v_datos text; v_metodo text; v_promo boolean;
begin
  select paciente_id into v_paciente from public.ventas where recibo_token = p_token;
  if v_paciente is null or app_private.es_consumidor_final(v_paciente) then return null; end if;
  select estado, metodo into v_datos, v_metodo from public.consentimientos_paciente where paciente_id = v_paciente order by registrado_en desc limit 1;
  select acepta into v_promo from public.preferencias_promociones where paciente_id = v_paciente order by registrado_en desc limit 1;
  return jsonb_build_object('datos_confirmado_en_linea', v_datos = 'otorgado' and v_metodo = 'aceptado_en_linea', 'promociones', v_promo);
end;
$$;

create or replace function public.responder_preferencias_recibo(p_token uuid, p_datos boolean, p_promociones boolean)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_venta record; v_ult record; v_promo boolean; v_nombre text;
begin
  select id, paciente_id, empresa_id into v_venta from public.ventas where recibo_token = p_token;
  if v_venta.paciente_id is null or app_private.es_consumidor_final(v_venta.paciente_id) then raise exception 'Recibo no encontrado'; end if;

  if coalesce(p_datos, false) then
    select estado, metodo into v_ult from public.consentimientos_paciente where paciente_id = v_venta.paciente_id order by registrado_en desc limit 1;
    if v_ult.estado is distinct from 'otorgado' or v_ult.metodo is distinct from 'aceptado_en_linea' then
      select trim(coalesce(nombres, '') || ' ' || coalesce(apellidos, '')) into v_nombre from public.pacientes_clinicos where id = v_venta.paciente_id;
      insert into public.consentimientos_paciente (paciente_id, empresa_id, version, estado, metodo, firmado_por, es_representante, notas, registrado_por)
      values (v_venta.paciente_id, v_venta.empresa_id, 'v1-2026-09', 'otorgado', 'aceptado_en_linea', v_nombre, false, 'Aceptado por el paciente en su recibo virtual.', null);
    end if;
  end if;

  if p_promociones is not null then
    select acepta into v_promo from public.preferencias_promociones where paciente_id = v_venta.paciente_id order by registrado_en desc limit 1;
    if v_promo is distinct from p_promociones then
      insert into public.preferencias_promociones (paciente_id, acepta, origen, venta_id) values (v_venta.paciente_id, p_promociones, 'recibo_virtual', v_venta.id);
    end if;
  end if;
end;
$$;
