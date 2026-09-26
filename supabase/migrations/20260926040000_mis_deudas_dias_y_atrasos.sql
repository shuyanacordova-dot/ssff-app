-- Mis deudas (confirmado por Shuyana 2026-09-25): día de pago de los créditos Pichincha (Jassy 1, Shu 15)
-- y pagos atrasados de tarjetas del estado de cuenta de septiembre (se registran como abonos libres vencidos).
update public.deudas_negocio set dia_pago = 1, fecha_inicio = '2025-04-01', fecha_vencimiento = '2030-03-01',
  notas = 'Saldo provisional (42 cuotas x $600). Saldo real por confirmar.', actualizado_en = now()
where proveedor = 'Banco Pichincha' and concepto = 'Crédito Jassy';
update public.deudas_negocio set dia_pago = 15, fecha_inicio = '2025-08-15', fecha_vencimiento = '2030-07-15',
  notas = null, actualizado_en = now()
where proveedor = 'Banco Pichincha' and concepto = 'Crédito Shu';

insert into public.deudas_negocio (tipo, modalidad, proveedor, concepto, empresa_id, ambito, monto_original, saldo, fecha_vencimiento, estado, frecuencia, notas, created_by)
select 'tarjeta', 'libre', x.proveedor, x.concepto, x.empresa, 'general', x.monto, x.monto, x.vence::date, 'pendiente', 'unica', x.notas, '535f7c2d-fc42-4a4c-a7f6-fb8b8a5598b6'::uuid
from (values
  ('American Business (Guayaquil)', 'Pago atrasado (American Gold)', '51820b6b-9fc1-495c-b2ea-ab50547e2ce3'::uuid, 150.00, '2026-09-13', 'Pago pendiente del estado de cuenta de septiembre.'),
  ('Diners', 'Pago atrasado del estado de cuenta', null::uuid, 111.28, '2026-09-21', 'Monto a pagar hasta el 21 de septiembre.'),
  ('Mastercard Titanium', 'Pago atrasado del estado de cuenta', null::uuid, 200.00, '2026-09-16', 'Monto a pagar hasta el 16 de septiembre.')
) x(proveedor, concepto, empresa, monto, vence, notas)
where not exists (select 1 from public.deudas_negocio d where d.proveedor = x.proveedor and d.concepto = x.concepto and d.estado = 'pendiente');
