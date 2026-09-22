
-- Cuadre de Caja General: solo administradores/dueños de sucursal (y superadmin,
-- que ya tiene bypass total). Tiffany es admin_sucursal pero queda excluida vía
-- permisos_usuario_denegados, igual que con saldos_cuentas (confirmado con
-- Shuyana 08-sep-2026: Tiffany y Yuli solo ven Cuadre de Caja Diario).
insert into permisos_rol (rol_id, recurso, accion)
select id, 'cuadre_caja_general', 'leer' from roles where nombre = 'admin_sucursal'
union all
select id, 'cuadre_caja_general', 'crear' from roles where nombre = 'admin_sucursal';

insert into permisos_usuario_denegados (usuario_id, recurso, accion, motivo)
values
  ('bd1c3f4d-23a7-4f5b-8909-dd328d4e79d4', 'cuadre_caja_general', 'leer', 'Tiffany es admin_sucursal pero solo debe ver Cuadre Diario, no el general de depósitos.'),
  ('bd1c3f4d-23a7-4f5b-8909-dd328d4e79d4', 'cuadre_caja_general', 'crear', 'Tiffany es admin_sucursal pero solo debe ver Cuadre Diario, no el general de depósitos.');
;
