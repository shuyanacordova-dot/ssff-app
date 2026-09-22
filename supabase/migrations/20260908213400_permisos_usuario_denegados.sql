create table permisos_usuario_denegados (
  usuario_id  uuid not null references usuarios(id) on delete cascade,
  recurso     text not null,
  accion      text not null,
  motivo      text,
  creado_en   timestamptz not null default now(),
  primary key (usuario_id, recurso, accion)
);

alter table permisos_usuario_denegados enable row level security;
-- sin policy para 'authenticated' a propósito, igual que permisos_rol: solo el
-- servidor (service_role) lo lee, desde lib/authorization.ts.

comment on table permisos_usuario_denegados is
  'Excepciones puntuales que QUITAN un permiso que el rol normalmente daría a una persona específica (ej. Tiffany es admin_sucursal pero no debe ver saldos_cuentas). No usar para dar permisos extra — eso es accesos_cruzados.';;
