-- 1) Dirección del establecimiento 002 de Focus (Shuyana 2026-09-30).
update public.emisores_sri set direccion_establecimiento = 'Av. 11 de Julio y Napo, Shushufindi, Sucumbíos', actualizado_en = now()
where sucursal_id = 'e2775b83-2105-46a7-8c40-d8de6b3a63dd' and ruc = '1722305412001';

-- 2) Fecha de registro de cada paciente (Shuyana: "es importante").
-- Los pacientes migrados de Optox tienen creado_en = día de la importación (17-09-2026), que no sirve.
-- Para ellos se usa la primera atención registrada (revisión o venta, lo que ocurra primero); para los creados en
-- LumOS, su fecha de creación. Los nuevos la toman sola.
alter table public.pacientes_clinicos add column if not exists fecha_registro date;

update public.pacientes_clinicos p set fecha_registro = coalesce(
  case when p.metadata->>'origen' = 'optox' then least(
    (select min(c.fecha_consulta)::date from public.consultas_optometricas c where c.paciente_id = p.id),
    (select min((v.creado_en at time zone 'America/Guayaquil')::date) from public.ventas v where v.paciente_id = p.id)) end,
  (p.creado_en at time zone 'America/Guayaquil')::date)
where p.fecha_registro is null;

alter table public.pacientes_clinicos alter column fecha_registro set default ((now() at time zone 'America/Guayaquil')::date);
