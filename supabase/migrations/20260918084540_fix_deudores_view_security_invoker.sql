drop view if exists public.deudores_cobro_insistente;
create view public.deudores_cobro_insistente with (security_invoker = true) as
select
  p.id as paciente_id,
  p.nombres,
  p.apellidos,
  p.telefono,
  e.nombre as empresa_nombre,
  sum(v.saldo) as saldo_total,
  count(v.id) as ventas_pendientes,
  min(v.creado_en) as deuda_desde
from public.pacientes_clinicos p
join public.ventas v on v.paciente_id = p.id and v.estado = 'completada' and v.saldo > 0
join public.empresas e on e.id = v.empresa_id
where p.cobro_insistente = true
group by p.id, p.nombres, p.apellidos, p.telefono, e.nombre;

comment on view public.deudores_cobro_insistente is 'Vista para Make.com: pacientes marcados de cobro insistente con su deuda actual. Usa security_invoker, así que respeta RLS; Make debe consultarla con la service_role key (o conexión Postgres directa) para ver todas las empresas, igual que el resto del backend.';;
