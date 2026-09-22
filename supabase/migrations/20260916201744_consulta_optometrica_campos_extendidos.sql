
alter table public.consultas_optometricas
  add column if not exists antecedentes jsonb not null default '{}'::jsonb,
  add column if not exists lensometria jsonb not null default '{}'::jsonb,
  add column if not exists queratometria jsonb not null default '{}'::jsonb,
  add column if not exists autorefractor jsonb not null default '{}'::jsonb,
  add column if not exists receta jsonb not null default '{}'::jsonb;
;
