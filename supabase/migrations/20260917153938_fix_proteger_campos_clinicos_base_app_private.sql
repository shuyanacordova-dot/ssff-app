
-- La función real usada por el trigger vive en app_private, no en public (mi primer intento
-- corrigió una copia sin usar en public). Mismo fix: separar el IF para que el acceso a
-- new.paciente_id no se intente resolver cuando la tabla es pacientes_clinicos.
create or replace function app_private.proteger_campos_clinicos_base()
returns trigger
language plpgsql
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

-- La copia en public no la usa ningún trigger; la quitamos para no dejar dos versiones confusas.
drop function if exists public.proteger_campos_clinicos_base();
;
