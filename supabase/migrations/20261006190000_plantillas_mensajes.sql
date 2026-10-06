-- Plantillas de WhatsApp configurables desde LumOS (Shuyana 2026-10-06).
-- El texto usa marcadores legibles ({{nombre}}, {{saldo}}…); al enviarlo a Meta se convierten en {{1}}, {{2}}…
-- y "variables" guarda ese orden. Una sola plantilla activa por empresa y tipo.
create table if not exists public.plantillas_mensajes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  tipo text not null check (tipo in ('cumpleanos','control_anual','control_periodico','cobro','cobro_insistente','cobro_apartado')),
  nombre_meta text not null,
  categoria text not null default 'MARKETING' check (categoria in ('MARKETING','UTILITY')),
  texto text not null,
  variables text[] not null default '{}',
  imagen text,
  estado text not null default 'BORRADOR',
  motivo_rechazo text,
  meta_id text,
  activa boolean not null default false,
  creado_por uuid references public.usuarios(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (nombre_meta)
);
create unique index if not exists plantillas_mensajes_activa_idx on public.plantillas_mensajes (empresa_id, tipo) where activa;
alter table public.plantillas_mensajes enable row level security;

drop policy if exists plantillas_select on public.plantillas_mensajes;
create policy plantillas_select on public.plantillas_mensajes for select to authenticated
  using (exists (select 1 from public.usuarios u join public.roles r on r.id=u.rol_id
    where u.auth_user_id=(select auth.uid()) and u.activo and (r.nombre='superadmin' or u.empresa_id=plantillas_mensajes.empresa_id)));
drop policy if exists plantillas_superadmin_write on public.plantillas_mensajes;
create policy plantillas_superadmin_write on public.plantillas_mensajes for all to authenticated
  using (exists (select 1 from public.usuarios u join public.roles r on r.id=u.rol_id where u.auth_user_id=(select auth.uid()) and u.activo and r.nombre='superadmin'))
  with check (exists (select 1 from public.usuarios u join public.roles r on r.id=u.rol_id where u.auth_user_id=(select auth.uid()) and u.activo and r.nombre='superadmin'));

-- La plantilla de control de 3/6 meses es compartida por ambas empresas: el nombre es único por empresa.
alter table public.plantillas_mensajes drop constraint if exists plantillas_mensajes_nombre_meta_key;
alter table public.plantillas_mensajes add constraint plantillas_mensajes_empresa_nombre_key unique (empresa_id, nombre_meta);
