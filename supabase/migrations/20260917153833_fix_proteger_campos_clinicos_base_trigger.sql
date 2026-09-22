
-- Bug preexistente: esta función se usa como trigger compartido en varias tablas clínicas.
-- La condición "tg_table_name <> 'pacientes_clinicos' and new.paciente_id is distinct from old.paciente_id"
-- falla en pacientes_clinicos porque esa tabla no tiene columna paciente_id: PL/pgSQL necesita
-- resolver el campo al preparar la expresión compuesta, aunque el AND debería "saltarla" en teoría.
-- Se separa en un IF anidado para que el acceso a new.paciente_id solo se compile/evalúe
-- cuando la tabla realmente tiene esa columna.
create or replace function public.proteger_campos_clinicos_base()
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
;
