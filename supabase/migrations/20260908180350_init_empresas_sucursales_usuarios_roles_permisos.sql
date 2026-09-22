-- ============================================================================
-- Sistema Óptico Inteligente — Shuvisión / Focus
-- Migración inicial (Fase 1): empresas, sucursales, usuarios, roles, permisos,
-- accesos cruzados y log de auditoría.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- EMPRESAS / SUCURSALES
-- ---------------------------------------------------------------------------

create table empresas (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,          -- 'Shuvisión' | 'Focus'
  slug        text not null unique,          -- 'shuvision' | 'focus'
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);

create table sucursales (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references empresas(id) on delete restrict,
  nombre       text not null,                -- 'Shushufindi Matriz' | 'Sacha' | 'Shushufindi'
  es_matriz    boolean not null default false,
  ciudad       text not null,
  activo       boolean not null default true,
  creado_en    timestamptz not null default now(),
  unique (empresa_id, nombre)
);

-- ---------------------------------------------------------------------------
-- ROLES / PERMISOS
-- ---------------------------------------------------------------------------

create table roles (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null unique  -- superadmin | admin_sucursal | optometra | vendedor | caja
);

create table permisos_rol (
  rol_id   uuid not null references roles(id) on delete cascade,
  recurso  text not null,   -- 'pacientes' | 'historias_clinicas' | 'ventas' | 'cuadre_caja' | ...
  accion   text not null,   -- 'leer' | 'crear' | 'editar' | 'eliminar'
  primary key (rol_id, recurso, accion)
);

-- ---------------------------------------------------------------------------
-- USUARIOS
-- ---------------------------------------------------------------------------

create table usuarios (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null unique references auth.users(id) on delete cascade,
  nombre        text not null,
  email         text not null unique,
  rol_id        uuid not null references roles(id) on delete restrict,
  empresa_id    uuid not null references empresas(id) on delete restrict,
  sucursal_id   uuid not null references sucursales(id) on delete restrict,
  activo        boolean not null default true,
  creado_en     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ACCESO CRUZADO
-- ---------------------------------------------------------------------------

create table accesos_cruzados (
  id                    uuid primary key default gen_random_uuid(),
  usuario_id            uuid not null references usuarios(id) on delete cascade,
  empresa_destino_id    uuid not null references empresas(id) on delete cascade,
  sucursal_destino_id   uuid references sucursales(id) on delete cascade,
  paciente_id           text,
  motivo                text not null,
  otorgado_por          uuid not null references usuarios(id),
  fecha_otorgado        timestamptz not null default now(),
  fecha_expiracion      timestamptz,
  activo                boolean not null default true
);

-- ---------------------------------------------------------------------------
-- LOG DE ACCESOS
-- ---------------------------------------------------------------------------

create table log_accesos (
  id                     uuid primary key default gen_random_uuid(),
  usuario_id             uuid not null references usuarios(id),
  accion                 text not null,
  recurso                text not null,
  recurso_id             text,
  empresa_contexto_id    uuid references empresas(id),
  sucursal_contexto_id   uuid references sucursales(id),
  via                    text not null default 'normal',
  fecha_hora             timestamptz not null default now(),
  ip                     text
);

create index idx_log_accesos_usuario on log_accesos (usuario_id, fecha_hora desc);
create index idx_accesos_cruzados_usuario on accesos_cruzados (usuario_id, activo);

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------

alter table empresas enable row level security;
alter table sucursales enable row level security;
alter table roles enable row level security;
alter table permisos_rol enable row level security;
alter table usuarios enable row level security;
alter table accesos_cruzados enable row level security;
alter table log_accesos enable row level security;

create policy "usuarios autenticados leen su propia fila"
  on usuarios for select
  using (auth.uid() = auth_user_id);

create policy "usuarios autenticados leen empresas activas"
  on empresas for select
  using (auth.role() = 'authenticated' and activo = true);

create policy "usuarios autenticados leen sucursales activas"
  on sucursales for select
  using (auth.role() = 'authenticated' and activo = true);

-- ---------------------------------------------------------------------------
-- DATOS SEMILLA
-- ---------------------------------------------------------------------------

insert into empresas (nombre, slug) values
  ('Shuvisión', 'shuvision'),
  ('Focus', 'focus');

insert into sucursales (empresa_id, nombre, es_matriz, ciudad)
select id, 'Shushufindi Matriz', true, 'Shushufindi' from empresas where slug = 'shuvision'
union all
select id, 'Sacha', false, 'Sacha' from empresas where slug = 'shuvision'
union all
select id, 'Shushufindi', true, 'Shushufindi' from empresas where slug = 'focus';

insert into roles (nombre) values
  ('superadmin'), ('admin_sucursal'), ('optometra'), ('vendedor'), ('caja');

insert into permisos_rol (rol_id, recurso, accion)
select r.id, x.recurso, x.accion
from roles r
cross join (values
  ('admin_sucursal','pacientes','leer'), ('admin_sucursal','pacientes','crear'), ('admin_sucursal','pacientes','editar'),
  ('admin_sucursal','historias_clinicas','leer'),
  ('admin_sucursal','ventas','leer'), ('admin_sucursal','ventas','crear'), ('admin_sucursal','ventas','editar'),
  ('admin_sucursal','cuadre_caja','leer'), ('admin_sucursal','cuadre_caja','crear'),
  ('admin_sucursal','saldos_cuentas','leer'), ('admin_sucursal','saldos_cuentas','crear'),
  ('optometra','pacientes','leer'), ('optometra','pacientes','crear'), ('optometra','pacientes','editar'),
  ('optometra','historias_clinicas','leer'), ('optometra','historias_clinicas','crear'), ('optometra','historias_clinicas','editar'),
  ('vendedor','pacientes','leer'), ('vendedor','pacientes','crear'),
  ('vendedor','ventas','leer'), ('vendedor','ventas','crear'),
  ('caja','ventas','leer'),
  ('caja','cuadre_caja','leer'), ('caja','cuadre_caja','crear'),
  ('caja','saldos_cuentas','leer'), ('caja','saldos_cuentas','crear')
) as x(rol_nombre, recurso, accion)
where r.nombre = x.rol_nombre;
;
