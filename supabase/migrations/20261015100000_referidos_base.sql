-- Referidos y recompensas, fase 1 (1/5): tablas, historial inmutable, RLS y programas apagados.
-- Diseño: docs/superpowers/specs/2026-10-14-referidos-recompensas-design.md

create table if not exists public.programas_referidos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null unique references public.empresas(id),
  nombre text not null,
  prefijo text not null check (prefijo ~ '^[A-Z]{3}$'),
  activo boolean not null default false,
  recompensas_suspendidas boolean not null default false,
  compra_minima numeric(12,2) not null check (compra_minima >= 0),
  descuento_bienvenida numeric(12,2) not null check (descuento_bienvenida >= 0),
  credito_por_referido numeric(12,2) not null check (credito_por_referido >= 0),
  bono_3_referidos numeric(12,2) not null default 0 check (bono_3_referidos >= 0),
  bono_5_referidos numeric(12,2) not null default 0 check (bono_5_referidos >= 0),
  vigencia_credito_dias integer not null check (vigencia_credito_dias > 0),
  tope_uso_porcentaje numeric(5,2) not null check (tope_uso_porcentaje between 0 and 100),
  presupuesto_mensual numeric(12,2) check (presupuesto_mensual is null or presupuesto_mensual >= 0),
  campana_desde date,
  campana_hasta date,
  categorias_excluidas text[] not null default '{}',
  siguiente_numero integer not null default 1,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references public.usuarios(id),
  check (campana_hasta is null or campana_desde is null or campana_hasta >= campana_desde)
);

create table if not exists public.codigos_referido (
  id uuid primary key default gen_random_uuid(),
  programa_id uuid not null references public.programas_referidos(id),
  paciente_id uuid not null references public.pacientes_clinicos(id),
  codigo text not null,
  creado_en timestamptz not null default now(),
  unique (programa_id, paciente_id),
  unique (programa_id, codigo)
);

create table if not exists public.referidos (
  id uuid primary key default gen_random_uuid(),
  programa_id uuid not null references public.programas_referidos(id),
  codigo_id uuid not null references public.codigos_referido(id),
  referidor_paciente_id uuid not null references public.pacientes_clinicos(id),
  referido_paciente_id uuid not null references public.pacientes_clinicos(id),
  estado text not null default 'registrado' check (estado in ('registrado', 'en_pago', 'recompensado', 'rechazado', 'revertido')),
  venta_id uuid references public.ventas(id),
  descuento_aplicado numeric(12,2) not null default 0,
  credito_a_otorgar numeric(12,2) not null default 0,
  vigencia_dias integer,
  reglas jsonb,
  motivo_rechazo text,
  registrado_por uuid references public.usuarios(id),
  creado_en timestamptz not null default now(),
  aplicado_en timestamptz,
  pagado_en timestamptz,
  unique (programa_id, referido_paciente_id),
  check (referidor_paciente_id <> referido_paciente_id)
);
create index if not exists referidos_referidor_idx on public.referidos (programa_id, referidor_paciente_id, estado);
create index if not exists referidos_venta_idx on public.referidos (venta_id) where venta_id is not null;

create table if not exists public.monedero_movimientos (
  id uuid primary key default gen_random_uuid(),
  programa_id uuid not null references public.programas_referidos(id),
  paciente_id uuid not null references public.pacientes_clinicos(id),
  tipo text not null check (tipo in ('credito', 'bono_hito', 'ajuste', 'devolucion', 'uso', 'vencimiento', 'reversa')),
  monto numeric(12,2) not null check (monto <> 0),
  lote_id uuid references public.monedero_movimientos(id),
  vence_en timestamptz,
  referido_id uuid references public.referidos(id),
  hito integer check (hito in (3, 5)),
  venta_id uuid references public.ventas(id),
  motivo text,
  creado_por uuid references public.usuarios(id),
  creado_en timestamptz not null default now(),
  check (
    (monto > 0 and lote_id is null and vence_en is not null and tipo in ('credito', 'bono_hito', 'ajuste', 'devolucion'))
    or (monto < 0 and lote_id is not null and vence_en is null and tipo in ('uso', 'vencimiento', 'reversa', 'ajuste'))
  ),
  check (tipo <> 'ajuste' or char_length(btrim(coalesce(motivo, ''))) >= 5)
);
create unique index if not exists monedero_un_credito_por_referido on public.monedero_movimientos (referido_id) where tipo = 'credito';
create unique index if not exists monedero_un_bono_por_hito on public.monedero_movimientos (programa_id, paciente_id, hito) where tipo = 'bono_hito';
create unique index if not exists monedero_un_vencimiento_por_lote on public.monedero_movimientos (lote_id) where tipo = 'vencimiento';
create unique index if not exists monedero_una_reversa_por_lote on public.monedero_movimientos (lote_id) where tipo = 'reversa';
create unique index if not exists monedero_una_devolucion_por_venta on public.monedero_movimientos (venta_id) where tipo = 'devolucion';
create index if not exists monedero_paciente_idx on public.monedero_movimientos (programa_id, paciente_id);
create index if not exists monedero_lote_idx on public.monedero_movimientos (lote_id) where lote_id is not null;

create table if not exists public.referidos_auditoria (
  id uuid primary key default gen_random_uuid(),
  programa_id uuid references public.programas_referidos(id),
  evento text not null,
  paciente_id uuid references public.pacientes_clinicos(id),
  referido_id uuid references public.referidos(id),
  venta_id uuid references public.ventas(id),
  detalle jsonb not null default '{}'::jsonb,
  usuario_id uuid references public.usuarios(id),
  creado_en timestamptz not null default now()
);

-- Los libros no se editan ni se borran: las correcciones son movimientos nuevos.
create or replace function app_private.bloquear_modificacion_historial()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Este registro es un historial y no se puede modificar ni borrar.';
end $$;
revoke all on function app_private.bloquear_modificacion_historial() from public, anon, authenticated;

drop trigger if exists trg_monedero_inmutable on public.monedero_movimientos;
create trigger trg_monedero_inmutable before update or delete on public.monedero_movimientos
  for each row execute function app_private.bloquear_modificacion_historial();
drop trigger if exists trg_referidos_auditoria_inmutable on public.referidos_auditoria;
create trigger trg_referidos_auditoria_inmutable before update or delete on public.referidos_auditoria
  for each row execute function app_private.bloquear_modificacion_historial();

-- Rol del usuario actual si puede usar referidos en esa empresa (superadmin en cualquiera).
create or replace function public.rol_referidos(p_empresa uuid)
returns text language sql stable security definer set search_path = '' as $$
  select ro.nombre
  from public.usuarios u join public.roles ro on ro.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo
    and ro.nombre in ('superadmin', 'admin_sucursal', 'optometra', 'vendedor', 'caja')
    and (ro.nombre = 'superadmin' or u.empresa_id = p_empresa)
  limit 1;
$$;
revoke all on function public.rol_referidos(uuid) from public, anon;
grant execute on function public.rol_referidos(uuid) to authenticated;

alter table public.programas_referidos enable row level security;
alter table public.codigos_referido enable row level security;
alter table public.referidos enable row level security;
alter table public.monedero_movimientos enable row level security;
alter table public.referidos_auditoria enable row level security;
revoke all on public.programas_referidos, public.codigos_referido, public.referidos, public.monedero_movimientos, public.referidos_auditoria from public, anon, authenticated;
grant select on public.programas_referidos, public.codigos_referido, public.referidos, public.monedero_movimientos, public.referidos_auditoria to authenticated;

drop policy if exists programas_referidos_leer on public.programas_referidos;
create policy programas_referidos_leer on public.programas_referidos for select to authenticated
  using (public.rol_referidos(empresa_id) is not null);
drop policy if exists codigos_referido_leer on public.codigos_referido;
create policy codigos_referido_leer on public.codigos_referido for select to authenticated
  using (exists (select 1 from public.programas_referidos p where p.id = programa_id and public.rol_referidos(p.empresa_id) is not null));
drop policy if exists referidos_leer on public.referidos;
create policy referidos_leer on public.referidos for select to authenticated
  using (exists (select 1 from public.programas_referidos p where p.id = programa_id and public.rol_referidos(p.empresa_id) is not null));
drop policy if exists monedero_movimientos_leer on public.monedero_movimientos;
create policy monedero_movimientos_leer on public.monedero_movimientos for select to authenticated
  using (exists (select 1 from public.programas_referidos p where p.id = programa_id and public.rol_referidos(p.empresa_id) is not null));
drop policy if exists referidos_auditoria_leer on public.referidos_auditoria;
create policy referidos_auditoria_leer on public.referidos_auditoria for select to authenticated
  using (public.es_superadmin());

-- Programas sembrados APAGADOS con los valores iniciales acordados.
insert into public.programas_referidos (empresa_id, nombre, prefijo, compra_minima, descuento_bienvenida, credito_por_referido, bono_3_referidos, bono_5_referidos, vigencia_credito_dias, tope_uso_porcentaje)
select e.id, v.nombre, v.prefijo, v.minimo, v.descuento, 10, v.b3, v.b5, v.dias, 20
from public.empresas e
join (values ('Shuvisión', 'Círculo Shu', 'SHU', 100, 10, 10, 20, 90), ('Focus', 'Focus Friends', 'FOC', 120, 15, 15, 25, 60))
  as v(empresa, nombre, prefijo, minimo, descuento, b3, b5, dias) on e.nombre = v.empresa
on conflict (empresa_id) do nothing;
