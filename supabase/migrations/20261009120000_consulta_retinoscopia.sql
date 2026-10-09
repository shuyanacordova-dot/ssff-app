-- Retinoscopía en la historia clínica (mismos campos que el autorrefractor: esfera, cilindro, eje por ojo).
alter table public.consultas_optometricas
  add column if not exists retinoscopia jsonb not null default '{}'::jsonb;
