
create or replace function app_private.proteger_campos_clinicos_base()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'No se puede cambiar quién creó un registro clínico.';
  end if;
  if tg_table_name <> 'pacientes_clinicos' then
    if new.paciente_id is distinct from old.paciente_id then
      raise exception 'No se puede mover un registro clínico a otro paciente.';
    end if;
  end if;
  return new;
end;
$$;
;
