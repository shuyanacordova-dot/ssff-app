-- Mis deudas: ámbito "personal" (deudas de Shu) y carga del Excel "DEUDAS SHU Y SHUVISION TARJETAS" (2026-09-25).
-- Interpretación confirmada con Shuyana: "X/Y" = X cuotas pagadas de Y; SHU = deudas personales; ACESS 1 de 3 pagada;
-- Noon ya pagado (no se carga); Provisión debe $150; Alexandre Vision debe $160. Días de pago: Diners 20, Mastercard 15,
-- American Miles 15, American Business 13 (se asume = "American Gold"), Amazonas 15. Pichincha y BanEcuador: día por confirmar
-- (dia_pago null). Crédito Jassy: saldo provisional 42 x $600 hasta tener el saldo real. Las cuotas se ubican para que la
-- próxima venza en octubre 2026 (las de septiembre se consideran pagadas).
alter table public.deudas_negocio drop constraint if exists deudas_negocio_ambito_check;
alter table public.deudas_negocio add constraint deudas_negocio_ambito_check check (ambito in ('general', 'personal', 'focus', 'sacha'));

insert into public.deudas_negocio (tipo, modalidad, proveedor, concepto, empresa_id, ambito, monto_cuota, cuotas_total, cuotas_previas, dia_pago,
  fecha_inicio, fecha_vencimiento, monto_original, saldo, estado, frecuencia, notas, created_by)
select x.tipo, x.modalidad, x.proveedor, x.concepto, case when x.dueno = 'SHUVISION' then '51820b6b-9fc1-495c-b2ea-ab50547e2ce3'::uuid end,
       case when x.dueno = 'SHU' then 'personal' else 'general' end,
       x.cuota, x.total, x.previas, x.dia, x.inicio::date, x.fin::date, x.original, x.saldo,
       case when x.saldo > 0 then 'pendiente' else 'pagada' end,
       case when x.modalidad = 'libre' then 'unica' else 'mensual' end,
       x.notas, '535f7c2d-fc42-4a4c-a7f6-fb8b8a5598b6'::uuid
from (values
  ('tarjeta','cuotas','Diners','Avance pagos','SHU', 40.64, 15, 8, 20, '2026-02-20','2027-04-20', 609.60, 284.48, null),
  ('tarjeta','cuotas','Diners','Avance carro Shu','SHU', 125.94, 60, 2, 20, '2026-08-20','2031-07-20', 7556.40, 7304.52, null),
  ('tarjeta','mensual','Diners','Canva (recurrente)','SHUVISION', 6.50, null, 0, 20, '2026-10-20', null, 6.50, 6.50, null),
  ('tarjeta','cuotas','Mastercard Titanium','Compu y relojes','SHU', 86.72, 12, 4, 15, '2026-06-15','2027-05-15', 1040.64, 693.76, null),
  ('tarjeta','cuotas','Mastercard Titanium','ACESS permiso Sacha','SHUVISION', 19.66, 3, 1, 15, '2026-09-15','2026-11-15', 58.98, 39.32, null),
  ('tarjeta','cuotas','American Business (Guayaquil)','Tarjeta American Gold','SHUVISION', 150.87, 10, 0, 13, '2026-10-13','2027-07-13', 1508.70, 1437.90, 'En el Excel figura como "American Gold"; se usa el día de pago de American Business (13). Confirmar.'),
  ('tarjeta','mensual','American Miles (Guayaquil)','Recurrente','SHU', 33.93, null, 0, 15, '2026-10-15', null, 33.93, 33.93, null),
  ('tarjeta','cuotas','American Miles (Guayaquil)','Compra diferida','SHUVISION', 13.93, 12, 1, 15, '2026-09-15','2027-08-15', 167.16, 153.28, null),
  ('tarjeta','cuotas','American Miles (Guayaquil)','Compra diferida','SHUVISION', 12.52, 6, 0, 15, '2026-10-15','2027-03-15', 75.15, 75.15, null),
  ('tarjeta','cuotas','Banco Amazonas','Tarjeta','SHUVISION', 37.73, 18, 1, 15, '2026-09-15','2028-02-15', 679.14, 570.30, null),
  ('prestamo_banco','cuotas','Banco Pichincha','Crédito Jassy','SHUVISION', 600.00, 60, 18, null, '2025-04-01','2030-03-01', 36000.00, 25200.00, 'Saldo provisional (42 cuotas x $600). Día de pago y saldo real por confirmar.'),
  ('prestamo_banco','cuotas','Banco Pichincha','Crédito Shu','SHUVISION', 571.33, 60, 14, null, '2025-08-01','2030-07-01', 34279.80, 19500.61, 'Día de pago por confirmar.'),
  ('prestamo_banco','libre','BanEcuador','Crédito BanEcuador Shu','SHUVISION', null, null, 0, null, null, null, 1400.00, 1400.00, 'Cuota mensual $35. Cuotas restantes y día de pago por confirmar.'),
  ('prestamo_banco','libre','BanEcuador','Crédito BanEcuador Joi','SHUVISION', null, null, 0, null, null, null, 3751.00, 3751.00, 'Cuota mensual $45. Cuotas restantes y día de pago por confirmar.'),
  ('proveedor','libre','Provisión','Deuda al 24 de agosto','SHUVISION', null, null, 0, null, null, null, 150.00, 150.00, null),
  ('proveedor','libre','Alexandre Vision','Deuda al 24 de agosto','SHUVISION', null, null, 0, null, null, null, 600.00, 160.00, null)
) x(tipo, modalidad, proveedor, concepto, dueno, cuota, total, previas, dia, inicio, fin, original, saldo, notas)
where not exists (select 1 from public.deudas_negocio d where d.proveedor = x.proveedor and d.concepto = x.concepto and d.monto_original = x.original);
