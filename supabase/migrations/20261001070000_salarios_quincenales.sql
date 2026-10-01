-- Salarios del personal en quincenas (Shuyana 2026-10-01): el sueldo mensual se paga en dos mitades, el 15 y el 1 de
-- cada mes. Cada persona tiene dos pagos mensuales fijos en Mis deudas → Salarios.
--   Yuli $450 (2 × $225) · João $550 · Shuyana $550 · Jassy $550 (2 × $275) · Tiffany $1.000 (2 × $500).
-- El sueldo de Tiffany ya existía ($1.000 el día 30) con un pago de $500 el 01-10 ("QUINCENA"): pasa a ser su quincena
-- del día 1 ($500) y ese pago cuenta para octubre; se agrega su quincena del 15. Las quincenas del 1 de los demás
-- empiezan el 01-10-2026 (salen pendientes hasta que se registre el pago).

update public.deudas_negocio
   set concepto = 'Sueldo · quincena del 1', monto_cuota = 500, monto_original = 500, saldo = 500, dia_pago = 1,
       fecha_inicio = '2026-10-01', notas = 'Mitad del sueldo mensual de $1.000. Sucursal por confirmar.', actualizado_en = now()
 where id = '38ea2eda-6d3d-4da8-a408-be82501c9bf6';
update public.pagos_deuda_negocio set periodo = '2026-10-01'
 where deuda_id = '38ea2eda-6d3d-4da8-a408-be82501c9bf6' and fecha_pago = '2026-10-01' and periodo = '2026-09-01';

insert into public.deudas_negocio (tipo, modalidad, proveedor, concepto, empresa_id, ambito, monto_original, saldo, monto_cuota, dia_pago,
  fecha_inicio, estado, frecuencia, notas, created_by)
select 'salario', 'mensual', x.persona, x.concepto, '51820b6b-9fc1-495c-b2ea-ab50547e2ce3'::uuid, 'general', x.mitad, x.mitad, x.mitad, x.dia,
       x.inicio::date, 'pendiente', 'mensual', format('Mitad del sueldo mensual de $%s. Sucursal por confirmar.', to_char(x.mensual, 'FM9990')),
       '535f7c2d-fc42-4a4c-a7f6-fb8b8a5598b6'::uuid
from (values
  ('Tiffany', 'Sueldo · quincena del 15', 1000, 500.00, 15, '2026-10-15'),
  ('Yuli',    'Sueldo · quincena del 15',  450, 225.00, 15, '2026-10-15'),
  ('Yuli',    'Sueldo · quincena del 1',   450, 225.00,  1, '2026-10-01'),
  ('João',    'Sueldo · quincena del 15',  550, 275.00, 15, '2026-10-15'),
  ('João',    'Sueldo · quincena del 1',   550, 275.00,  1, '2026-10-01'),
  ('Shuyana', 'Sueldo · quincena del 15',  550, 275.00, 15, '2026-10-15'),
  ('Shuyana', 'Sueldo · quincena del 1',   550, 275.00,  1, '2026-10-01'),
  ('Jassy',   'Sueldo · quincena del 15',  550, 275.00, 15, '2026-10-15'),
  ('Jassy',   'Sueldo · quincena del 1',   550, 275.00,  1, '2026-10-01')
) x(persona, concepto, mensual, mitad, dia, inicio)
where not exists (select 1 from public.deudas_negocio d where d.tipo = 'salario' and d.proveedor = x.persona and d.concepto = x.concepto and d.estado <> 'anulada');
