-- Al borrar una revisión, la bitácora clínica intentaba guardar consulta_id = la revisión borrada
-- y fallaba por la llave foránea. En DELETE de la propia revisión se guarda consulta_id nulo;
-- el id de la revisión queda en entidad_id.
create or replace function app_private.registrar_evento_clinico()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'app_private'
as $function$
declare v jsonb; v_paciente uuid; v_consulta uuid; v_id uuid; v_campos text[] := '{}'::text[];
begin
  v := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_paciente := coalesce((v->>'paciente_id')::uuid, (v->>'id')::uuid);
  v_consulta := case when tg_table_name = 'consultas_optometricas' then (v->>'id')::uuid else (v->>'consulta_id')::uuid end;
  if tg_op = 'DELETE' and tg_table_name = 'consultas_optometricas' then v_consulta := null; end if;
  v_id := (v->>'id')::uuid;
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(n.key order by n.key), '{}'::text[]) into v_campos
    from jsonb_each(to_jsonb(new)) n left join jsonb_each(to_jsonb(old)) o using(key)
    where n.value is distinct from o.value;
  end if;
  insert into public.historial_clinico_eventos
    (paciente_id, consulta_id, actor_id, accion, entidad, entidad_id, campos_modificados)
  values (v_paciente, v_consulta, app_private.usuario_clinico_actual_id(), tg_op, tg_table_name, v_id, v_campos);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;
