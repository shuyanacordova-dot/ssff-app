-- Pacientes importados sin vínculo a su empresa: se vinculan según dónde fueron atendidos o compraron.
-- Solo agrega filas; no modifica ni borra datos existentes. (2.897 vínculos nuevos el 2026-09-25)
insert into public.paciente_empresas (paciente_id, empresa_id, primera_sucursal_id, created_by)
select x.paciente_id, x.empresa_id,
  (array_agg(x.sucursal_id order by x.fecha) filter (where x.sucursal_id is not null))[1],
  null
from (
  select c.paciente_id, c.empresa_atencion_id empresa_id, c.sucursal_atencion_id sucursal_id, c.fecha_consulta fecha
  from public.consultas_optometricas c where c.empresa_atencion_id is not null
  union all
  select v.paciente_id, v.empresa_id, v.sucursal_id, v.creado_en
  from public.ventas v where v.paciente_id is not null and v.empresa_id is not null and v.estado <> 'anulada'
) x
group by x.paciente_id, x.empresa_id
on conflict (paciente_id, empresa_id) do nothing;
