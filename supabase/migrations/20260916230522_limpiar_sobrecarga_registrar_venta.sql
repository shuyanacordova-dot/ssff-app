
-- Agregar p_paciente al final creó una sobrecarga nueva en vez de
-- reemplazar la función (las firmas con distinta cantidad de
-- parámetros son funciones distintas en Postgres), dejando la versión
-- vieja huérfana y la nueva sin las restricciones de ejecución.
drop function if exists public.registrar_venta(uuid, uuid, text, jsonb, jsonb);

revoke all on function public.registrar_venta(uuid, uuid, text, jsonb, jsonb, uuid) from public;
revoke all on function public.registrar_venta(uuid, uuid, text, jsonb, jsonb, uuid) from anon;
grant execute on function public.registrar_venta(uuid, uuid, text, jsonb, jsonb, uuid) to authenticated;
;
