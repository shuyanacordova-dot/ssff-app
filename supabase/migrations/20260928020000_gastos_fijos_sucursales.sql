-- Gastos fijos mensuales por sucursal (dictados por Shuyana 2026-09-28). Día de pago por confirmar (se usa fin de mes).
-- Empiezan en octubre 2026 para no marcar septiembre como pendiente (septiembre ya se pagó fuera de LumOS).
select set_config('request.jwt.claims', json_build_object('sub', 'b5e6cfbf-3829-4904-b4e5-e8274e4e9960', 'role', 'authenticated')::text, true);

insert into public.deudas_negocio (tipo, modalidad, proveedor, concepto, notas, empresa_id, sucursal_id, ambito, monto_cuota, monto_original, saldo, dia_pago, fecha_inicio, frecuencia, created_by)
select 'gasto_fijo', 'mensual', g.proveedor, g.concepto, g.notas, s.empresa_id, s.id, 'general', g.monto, g.monto, g.monto, null, date '2026-10-01', 'mensual', '535f7c2d-fc42-4a4c-a7f6-fb8b8a5598b6'
from (values
  ('3bd2a17c-b4e0-4137-a5f3-66475dbcb836'::uuid, 'Renta local Shushufindi', 'Renta', 300.00, null),
  ('e2775b83-2105-46a7-8c40-d8de6b3a63dd'::uuid, 'Renta local Focus', 'Renta', 300.00, null),
  ('1db17433-cc24-409f-92d2-794a01ce79d4'::uuid, 'Renta local Sacha', 'Renta', 450.00, null),
  ('3bd2a17c-b4e0-4137-a5f3-66475dbcb836'::uuid, 'Internet Shuvision', 'Internet', 48.00, null),
  ('e2775b83-2105-46a7-8c40-d8de6b3a63dd'::uuid, 'Internet Focus', 'Internet', 48.00, null),
  ('1db17433-cc24-409f-92d2-794a01ce79d4'::uuid, 'Internet Shuvision Sacha', 'Internet', 22.00, null),
  ('3bd2a17c-b4e0-4137-a5f3-66475dbcb836'::uuid, 'Luz Shuvision', 'Luz', 50.00, 'Valor aproximado: al pagar, escribe el valor real de la planilla.'),
  ('e2775b83-2105-46a7-8c40-d8de6b3a63dd'::uuid, 'Luz Focus', 'Luz', 50.00, 'Valor aproximado: al pagar, escribe el valor real de la planilla.')
) as g(sucursal_id, proveedor, concepto, monto, notas)
join public.sucursales s on s.id = g.sucursal_id
where not exists (select 1 from public.deudas_negocio d where d.tipo = 'gasto_fijo' and d.sucursal_id = g.sucursal_id and d.proveedor = g.proveedor);
