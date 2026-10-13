-- Una sola cuenta de ahorros Diners para la empresa Shuvisión.
-- El saldo registrado se deriva de los egresos clasificados como ahorros:
-- editar o borrar un egreso corrige automáticamente ese saldo.
create table public.cuentas_ahorro (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null unique references public.empresas(id),
  banco text not null default 'diners' check (banco = 'diners'),
  saldo_inicial numeric not null default 0,
  creado_en timestamptz not null default now()
);
alter table public.cuentas_ahorro enable row level security;
revoke all on public.cuentas_ahorro from public, anon, authenticated;
grant select on public.cuentas_ahorro to authenticated;
create policy cuentas_ahorro_lectura on public.cuentas_ahorro for select to authenticated
  using (app_private.puede_caja_empresa(empresa_id));

do $$
declare v_total integer;
begin
  select count(*) into v_total from public.empresas where nombre = 'Shuvisión' and activo;
  if v_total <> 1 then raise exception 'No se encontró una única empresa Shuvisión activa.'; end if;
  insert into public.cuentas_ahorro (empresa_id)
  select id from public.empresas where nombre = 'Shuvisión' and activo;
end;
$$;

alter table public.gastos drop constraint gastos_clasificacion_check;
alter table public.gastos add constraint gastos_clasificacion_check
  check (clasificacion in ('salarios', 'pago_proveedor', 'gastos_mensuales', 'gastos_operacion', 'ajuste', 'ahorros'));

create or replace function app_private.validar_egreso_ahorros()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.clasificacion = 'ahorros' and not exists (
    select 1 from public.cuentas_ahorro ca where ca.empresa_id = new.empresa_id and ca.banco = 'diners'
  ) then
    raise exception 'Los ahorros se registran únicamente en la cuenta Diners de Shuvisión.';
  end if;
  if new.clasificacion = 'ahorros' and new.origen = 'banco' and not exists (
    select 1 from public.cuentas_bancarias cb
    where cb.id = new.cuenta_bancaria_id and cb.empresa_id = new.empresa_id
      and cb.sucursal_id = new.sucursal_id and cb.activo
  ) then
    raise exception 'Elige una cuenta de origen de la sucursal de Shuvisión.';
  end if;
  return new;
end;
$$;
revoke all on function app_private.validar_egreso_ahorros() from public, anon, authenticated;
create trigger trg_validar_egreso_ahorros before insert or update of clasificacion, empresa_id on public.gastos
for each row execute function app_private.validar_egreso_ahorros();

create or replace function public.resumen_ahorros_diners()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'empresa_id', ca.empresa_id,
    'banco', ca.banco,
    'saldo', ca.saldo_inicial + coalesce(sum(g.monto), 0),
    'registros', count(g.id)
  )
  from public.cuentas_ahorro ca
  left join public.gastos g on g.empresa_id = ca.empresa_id and g.clasificacion = 'ahorros'
  where public.es_superadmin()
  group by ca.id, ca.empresa_id, ca.banco, ca.saldo_inicial;
$$;
revoke all on function public.resumen_ahorros_diners() from public, anon;
grant execute on function public.resumen_ahorros_diners() to authenticated;
