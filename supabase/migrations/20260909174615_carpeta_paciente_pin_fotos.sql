alter table usuarios add column pin_hash text;

create table historia_fotos (
  id            uuid primary key default gen_random_uuid(),
  historia_id   text not null,
  paciente_id   text not null,
  storage_path  text not null,
  empresa_id    uuid not null references empresas(id),
  sucursal_id   uuid not null references sucursales(id),
  subido_por    uuid not null references usuarios(id),
  creado_en     timestamptz not null default now()
);

create index idx_historia_fotos_historia on historia_fotos (historia_id);
create index idx_historia_fotos_paciente on historia_fotos (paciente_id);

alter table historia_fotos enable row level security;

insert into storage.buckets (id, name, public)
values ('historias', 'historias', false)
on conflict (id) do nothing;
;
