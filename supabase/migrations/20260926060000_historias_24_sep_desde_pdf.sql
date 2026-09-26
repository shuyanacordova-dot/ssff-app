-- Historias clínicas del 24-sep-2026 que no se guardaron por el error de Rx en cero (L-bitácora), reingresadas
-- desde los PDF de Optox que envió Shuyana el 2026-09-26. Solo existen estas dos (Shuvision y Focus).
select set_config('request.jwt.claims', json_build_object('sub', 'b5e6cfbf-3829-4904-b4e5-e8274e4e9960', 'role', 'authenticated')::text, true);

with nuevas(paciente_id, empresa_id, sucursal_id, optometrista_id, motivo, av, quera, rx, dx, obs) as (values
  -- MARIA ISABEL CAMPO VERDE SARITAMA · Shuvision · Shuyana Córdova
  ('e012d273-b715-4815-a5e9-8b410a3e179d'::uuid, '51820b6b-9fc1-495c-b2ea-ab50547e2ce3'::uuid, '3bd2a17c-b4e0-4137-a5f3-66475dbcb836'::uuid, '535f7c2d-fc42-4a4c-a7f6-fb8b8a5598b6'::uuid,
   'px acude por molestias en visión próxima',
   '{"sc_od":"20/28","sc_oi":"20/28","scp_od":"2.00M","scp_oi":"2.00M"}'::jsonb,
   '{"od_k1":"43.50","od_k2":"44.00","od_eje":"171","od_astigmatismo":"0.50","oi_k1":"43.50","oi_k2":"44.00","oi_eje":"107","oi_astigmatismo":"0.50"}'::jsonb,
   '{"od_esfera":"+0.50","od_cilindro":"","od_eje":"","od_add":"+2.00","od_av_lejos":"20/22","od_av_cerca":"","od_dnp":"30.0","oi_esfera":"+0.50","oi_cilindro":"","oi_eje":"","oi_add":"+2.00","oi_av_lejos":"20/20","oi_av_cerca":"","oi_dnp":"30.0"}'::jsonb,
   'OD: Hipermetropía (CIE-10 H52.0). OI: Hipermetropía (CIE-10 H52.0). Presbicia (CIE-10 H52.4)',
   'PX RECUPERA AO 20/20. PX COMODA CON LA MEDIDA.' || chr(10) || 'CV lejana: OD 20/22 · OI 20/22.' || chr(10) || '(Reingresada desde el PDF de Optox del 24-sep-2026)'),
  -- ANGELA NAGUECHA NIETO · Focus · Erick Balseca
  ('919d0720-301d-42bd-9599-7cd3a65fd276'::uuid, 'be1dc246-219a-40a2-9e92-707e5845d295'::uuid, 'e2775b83-2105-46a7-8c40-d8de6b3a63dd'::uuid, '40d6c60f-662d-4535-b8f7-91010dead3b8'::uuid,
   'DOLOR DE CABEZA/PROBLEMAS PARA VER DE CERCA',
   '{"sc_od":"20/20-","sc_oi":"20/20-","scp_od":"1.5M","scp_oi":"1.5M"}'::jsonb,
   '{"od_k1":"42.75","od_k2":"43.50","od_eje":"118","od_astigmatismo":"0.75","oi_k1":"43.00","oi_k2":"44.50","oi_eje":"169","oi_astigmatismo":"1.50"}'::jsonb,
   '{"od_esfera":"+0.25","od_cilindro":"","od_eje":"","od_add":"","od_av_lejos":"20/20","od_av_cerca":"","od_dnp":"30.7","oi_esfera":"+0.25","oi_cilindro":"-0.25","oi_eje":"80","oi_add":"","oi_av_lejos":"20/20","oi_av_cerca":"","oi_dnp":"30.7"}'::jsonb,
   'OD: Hipermetropía (CIE-10 H52.0). OI: Hipermetropía (CIE-10 H52.0) y Astigmatismo (CIE-10 H52.2)',
   'PROBLEMAS DE ACOMODACION' || chr(10) || 'CV lejana: OD 20/20 · OI 20/20.' || chr(10) || '(Reingresada desde el PDF de Optox del 24-sep-2026)')
)
insert into public.consultas_optometricas (paciente_id, empresa_atencion_id, sucursal_atencion_id, optometrista_id, fecha_consulta, motivo_consulta,
  antecedentes, agudeza_visual, lensometria, queratometria, autorefractor, refraccion, examen_binocular, biomicroscopia, impresion_diagnostica, receta, observaciones, created_by, creado_en)
select n.paciente_id, n.empresa_id, n.sucursal_id, n.optometrista_id, timestamptz '2026-09-24 12:00:00-05', n.motivo,
  '{}'::jsonb, n.av, '{}'::jsonb, n.quera, '{}'::jsonb, n.rx, '{}'::jsonb, '{"od":"","oi":"","otros_detalles":""}'::jsonb, n.dx,
  '{"lagrimas_artificiales":false,"lagrimas_productos":[],"lagrimas_otro":"","lagrimas_frecuencia":"","vitaminas":false,"vitaminas_productos":[],"vitaminas_otro":"","vitaminas_frecuencia":"","terapia_visual":false,"terapia_instrucciones":""}'::jsonb,
  n.obs, '535f7c2d-fc42-4a4c-a7f6-fb8b8a5598b6'::uuid, timestamptz '2026-09-24 12:00:00-05'
from nuevas n
where not exists (select 1 from public.consultas_optometricas c where c.paciente_id = n.paciente_id and (c.fecha_consulta at time zone 'America/Guayaquil')::date = date '2026-09-24');
