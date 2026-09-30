-- Convenios (Shuyana 2026-09-30):
-- 1) Tamara Cueva (folio 4398, $580) NO es del convenio del Municipio: su deuda es directa con la óptica.
--    Se quita su acuerdo de pago (quedó asignado al Municipio por error), con copia en acuerdos_pago_respaldo.
-- 2) Comisión del convenio: el sindicato del Municipio de Shushufindi se queda con el 5% de lo que se descuenta
--    por rol. Se guarda por empresa (comision_pct) y el informe mensual la muestra.

create table if not exists public.acuerdos_pago_respaldo (
  id uuid primary key default gen_random_uuid(),
  acuerdo_id uuid not null,
  motivo text not null,
  snapshot jsonb not null,
  borrado_en timestamptz not null default now()
);
alter table public.acuerdos_pago_respaldo enable row level security;
revoke all on public.acuerdos_pago_respaldo from public, anon, authenticated;

insert into public.acuerdos_pago_respaldo (acuerdo_id, motivo, snapshot)
select a.id, 'Tamara Cueva no pertenece al convenio del Municipio: deuda directa con la óptica (Shuyana 2026-09-30).', to_jsonb(a)
from public.acuerdos_pago a where a.id = 'dc55442c-9224-4185-9775-a70adebf6adc';
delete from public.acuerdos_pago where id = 'dc55442c-9224-4185-9775-a70adebf6adc';

alter table public.empresas_convenio add column if not exists comision_pct numeric(5,2) not null default 0
  check (comision_pct >= 0 and comision_pct <= 100);
update public.empresas_convenio set comision_pct = 5 where nombre ilike 'Municipio de Shushufindi%';
