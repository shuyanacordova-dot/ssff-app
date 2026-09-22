create or replace function public.actualizar_orden_laboratorio(p_orden uuid, p_laboratorio text, p_uso_calculado text, p_tipo_lente text, p_rx jsonb, p_medidas jsonb, p_notas text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_empresa uuid;
begin
  select empresa_id into v_empresa from public.ordenes_laboratorio where id = p_orden;
  if v_empresa is null or not app_private.puede_laboratorio_empresa(v_empresa) then raise exception 'No autorizado'; end if;
  if p_laboratorio not in ('provision','optec','indulentes','importlens','otro') then raise exception 'Laboratorio inválido'; end if;
  if p_uso_calculado not in ('lejos','cerca','lejos_y_cerca') then raise exception 'Uso inválido'; end if;
  if p_tipo_lente not in ('monofocal_lejos','monofocal_cerca','bifocal','progresivo') then raise exception 'Tipo de lente inválido'; end if;

  update public.ordenes_laboratorio set
    laboratorio = p_laboratorio, uso_calculado = p_uso_calculado, tipo_lente = p_tipo_lente,
    rx = coalesce(p_rx, '{}'::jsonb), medidas = coalesce(p_medidas, '{}'::jsonb), notas = nullif(p_notas, ''), actualizado_en = now()
  where id = p_orden;
end;
$$;;
