-- Sueldo de Erick (Shuyana 2026-10-01): igual que Shuyana, João y Jassy → $550 mensuales en dos quincenas de $275
-- (día 15 y día 1). Erick es de Focus: el sueldo queda en la empresa Focus.
insert into public.deudas_negocio (tipo, modalidad, proveedor, concepto, empresa_id, ambito, monto_original, saldo, monto_cuota, dia_pago,
  fecha_inicio, estado, frecuencia, notas, created_by)
select 'salario', 'mensual', 'Erick', x.concepto, 'be1dc246-219a-40a2-9e92-707e5845d295'::uuid, 'general', 275, 275, 275, x.dia,
       x.inicio::date, 'pendiente', 'mensual', 'Mitad del sueldo mensual de $550. Sucursal por confirmar.', '535f7c2d-fc42-4a4c-a7f6-fb8b8a5598b6'::uuid
from (values ('Sueldo · quincena del 15', 15, '2026-10-15'), ('Sueldo · quincena del 1', 1, '2026-10-01')) x(concepto, dia, inicio)
where not exists (select 1 from public.deudas_negocio d where d.tipo = 'salario' and d.proveedor = 'Erick' and d.concepto = x.concepto and d.estado <> 'anulada');
