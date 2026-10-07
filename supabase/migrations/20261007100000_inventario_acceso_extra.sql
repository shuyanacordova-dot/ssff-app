-- Erick (Focus) y Joao (Shuvision) pueden INGRESAR armazones en las sucursales de la otra empresa (Shuyana 2026-10-07).
-- Solo para crear armazones y cargar su stock (subida masiva o uno a uno); no da acceso a ventas ni datos de la otra empresa.
create table if not exists public.inventario_acceso_extra (
  usuario_id uuid not null references public.usuarios(id),
  empresa_id uuid not null references public.empresas(id),
  creado_en timestamptz not null default now(),
  primary key (usuario_id, empresa_id)
);
alter table public.inventario_acceso_extra enable row level security;
drop policy if exists inventario_acceso_extra_propio on public.inventario_acceso_extra;
create policy inventario_acceso_extra_propio on public.inventario_acceso_extra for select to authenticated
  using (usuario_id = (select u.id from public.usuarios u where u.auth_user_id = (select auth.uid())));

insert into public.inventario_acceso_extra (usuario_id, empresa_id) values
  ('40d6c60f-662d-4535-b8f7-91010dead3b8', '51820b6b-9fc1-495c-b2ea-ab50547e2ce3'), -- Erick → Shuvision (Shuvision y Sacha)
  ('d0b9d02f-b42c-497f-a64a-5ecb573be1f8', 'be1dc246-219a-40a2-9e92-707e5845d295')  -- Joao → Focus
on conflict do nothing;
