
-- historial_citas_eventos no tiene política de INSERT (solo lectura),
-- así que cualquier alta o cambio de estado en citas_agenda fallaba con
-- "permission denied for table historial_citas_eventos", porque el
-- trigger que audita esos cambios no tenía privilegios para escribir en
-- su propia tabla de auditoría. Se corrige igual que su par clínico
-- (app_private.registrar_evento_clinico), que ya es SECURITY DEFINER.
create or replace function app_private.registrar_evento_cita()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $function$
declare campos text[];
begin
  if tg_op = 'INSERT' then
    insert into public.historial_citas_eventos (cita_id, actor_id, accion) values (new.id, app_private.usuario_clinico_actual_id(), 'creada');
  elsif tg_op = 'UPDATE' then
    select coalesce(array_agg(key order by key), '{}'::text[]) into campos from jsonb_each(to_jsonb(new)) as nuevo(key, value) join jsonb_each(to_jsonb(old)) as anterior using (key) where nuevo.value is distinct from anterior.value and key not in ('actualizado_en');
    insert into public.historial_citas_eventos (cita_id, actor_id, accion, campos_modificados) values (new.id, app_private.usuario_clinico_actual_id(), 'actualizada', campos);
  end if;
  return null;
end;
$function$;
;
