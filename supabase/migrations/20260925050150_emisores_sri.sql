-- Datos del emisor para facturación electrónica SRI, uno por sucursal (Shuvision matriz y Sacha tienen RUC distintos).
-- Sin secretos: la firma .p12 y su clave NO se guardan aquí (irán cifradas en un almacén aparte).
create table if not exists public.emisores_sri (
  id uuid primary key default gen_random_uuid(),
  sucursal_id uuid not null unique references public.sucursales(id),
  ruc text not null check (ruc ~ '^\d{13}$'),
  ruc_confirmado boolean not null default false,
  razon_social text,
  nombre_comercial text,
  direccion_matriz text,
  direccion_establecimiento text,
  codigo_establecimiento text not null default '001' check (codigo_establecimiento ~ '^\d{3}$'),
  punto_emision text not null default '001' check (punto_emision ~ '^\d{3}$'),
  obligado_contabilidad boolean not null default false,
  regimen text check (regimen in ('general', 'rimpe_emprendedor', 'rimpe_negocio_popular')),
  contribuyente_especial text,
  ambiente text not null default 'pruebas' check (ambiente in ('pruebas', 'produccion')),
  siguiente_secuencial integer not null default 1 check (siguiente_secuencial > 0),
  firma_cargada boolean not null default false,
  firma_vence date,
  notas text,
  actualizado_en timestamptz not null default now()
);
alter table public.emisores_sri enable row level security;
revoke all on public.emisores_sri from public, anon, authenticated;
grant select, update on public.emisores_sri to authenticated;
create policy emisores_sri_superadmin_lectura on public.emisores_sri for select to authenticated using (public.es_superadmin());
create policy emisores_sri_superadmin_edicion on public.emisores_sri for update to authenticated using (public.es_superadmin()) with check (public.es_superadmin());

insert into public.emisores_sri (sucursal_id, ruc, ruc_confirmado, notas) values
  ('3bd2a17c-b4e0-4137-a5f3-66475dbcb836', '1804006391001', true,  'RUC entregado por Shuyana el 2026-09-25.'),
  ('1db17433-cc24-409f-92d2-794a01ce79d4', '2100060470001', false, 'Shuyana entregó 2100060470 (10 dígitos); se asume +001. Confirmar.'),
  ('e2775b83-2105-46a7-8c40-d8de6b3a63dd', '1722305412001', false, 'Shuyana entregó 1722305412 (10 dígitos); se asume +001. Confirmar.')
on conflict (sucursal_id) do nothing;
