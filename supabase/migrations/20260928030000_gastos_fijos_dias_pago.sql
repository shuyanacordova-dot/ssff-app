-- Días de pago de los gastos fijos (Shuyana 2026-09-28) y renta de Tiffany ($150 el 13, sucursal Sacha donde trabaja).
select set_config('request.jwt.claims', json_build_object('sub', 'b5e6cfbf-3829-4904-b4e5-e8274e4e9960', 'role', 'authenticated')::text, true);

update public.deudas_negocio d set dia_pago = v.dia
from (values
  ('Renta local Shushufindi', 30), ('Renta local Focus', 15), ('Renta local Sacha', 8),
  ('Luz Shuvision', 8), ('Luz Focus', 15),
  ('Internet Shuvision', 30), ('Internet Focus', 30), ('Internet Shuvision Sacha', 30)
) as v(proveedor, dia)
where d.tipo = 'gasto_fijo' and d.proveedor = v.proveedor;

insert into public.deudas_negocio (tipo, modalidad, proveedor, concepto, notas, empresa_id, sucursal_id, ambito, monto_cuota, monto_original, saldo, dia_pago, fecha_inicio, frecuencia, created_by)
select 'gasto_fijo', 'mensual', 'Renta Tiffany', 'Renta', null, s.empresa_id, s.id, 'general', 150.00, 150.00, 150.00, 13, date '2026-10-01', 'mensual', '535f7c2d-fc42-4a4c-a7f6-fb8b8a5598b6'
from public.sucursales s
where s.id = '1db17433-cc24-409f-92d2-794a01ce79d4'
  and not exists (select 1 from public.deudas_negocio d where d.tipo = 'gasto_fijo' and d.proveedor = 'Renta Tiffany');
