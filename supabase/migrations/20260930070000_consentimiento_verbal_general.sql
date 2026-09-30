-- Consentimiento de datos solo por autorización expresa verbal (Shuyana 2026-09-30).
-- 1) Nuevo método 'verbal' (se conservan los métodos anteriores para no romper registros).
-- 2) Registro general: todos los pacientes sin consentimiento quedan como "otorgado" por autorización verbal,
--    según la práctica habitual de la óptica (siempre se explica al paciente para qué se usan sus datos).
--    Autorizado por escrito por Shuyana en el chat del 2026-09-30. La nota deja claro que fue un registro general.

alter table public.consentimientos_paciente drop constraint if exists consentimientos_paciente_metodo_check;
alter table public.consentimientos_paciente add constraint consentimientos_paciente_metodo_check
  check (metodo in ('verbal', 'firma_papel', 'aceptado_en_pantalla', 'verbal_con_testigo'));

insert into public.consentimientos_paciente (paciente_id, empresa_id, version, estado, metodo, firmado_por, es_representante, notas, registrado_por, registrado_en)
select p.id,
       coalesce(p.empresa_origen_id, (select pe.empresa_id from public.paciente_empresas pe where pe.paciente_id = p.id limit 1), '51820b6b-9fc1-495c-b2ea-ab50547e2ce3'::uuid),
       'v1-2026-09', 'otorgado', 'verbal',
       trim(coalesce(p.nombres, '') || ' ' || coalesce(p.apellidos, '')), false,
       'Registro general 2026-09-30 autorizado por Shuyana Córdova: autorización verbal informada, según la práctica habitual de la óptica de explicar al paciente el uso de sus datos.',
       (select u.id from public.usuarios u join public.roles r on r.id = u.rol_id where r.nombre = 'superadmin' and u.activo order by u.id = '535f7c2d-fc42-4a4c-a7f6-fb8b8a5598b6'::uuid desc limit 1),
       now()
from public.pacientes_clinicos p
where not exists (select 1 from public.consentimientos_paciente c where c.paciente_id = p.id);
