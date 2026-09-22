
-- Recurso nuevo "inventario" (Monturas + Lista de Precios de Lunas), módulo Fase 4.
-- admin_sucursal: ve y ajusta stock. vendedor y optometra: solo consulta (necesitan
-- ver existencias/precios para vender o recomendar, no para editarlas).
insert into permisos_rol (rol_id, recurso, accion) values
  ('658cc8c5-f29b-4cb0-95d1-77db5b741cc7', 'inventario', 'leer'),
  ('658cc8c5-f29b-4cb0-95d1-77db5b741cc7', 'inventario', 'editar'),
  ('923ad0ba-6364-46ba-974e-e081a073aa14', 'inventario', 'leer'),
  ('9db311ee-dafb-49b5-8b43-ee02936f722c', 'inventario', 'leer')
on conflict do nothing;
;
