
-- Restringe el banco de un pago de venta a los 3 bancos reales (o 'otro'),
-- necesario para poder distinguir cobros por banco en el cuadre de caja.
alter table public.pagos_venta
  add constraint pagos_venta_banco_check check (banco is null or banco in ('pichincha', 'guayaquil', 'internacional', 'otro'));

-- Cuentas bancarias (una por banco y empresa)
create table public.cuentas_bancarias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  banco text not null check (banco in ('pichincha', 'guayaquil', 'internacional')),
  saldo_actual numeric not null default 0,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (empresa_id, banco)
);

-- Gastos (egresos): clasificación grande + concepto específico + observaciones,
-- con origen caja (efectivo) o banco (transferencia desde una cuenta).
create table public.gastos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  sucursal_id uuid references public.sucursales(id),
  fecha date not null default current_date,
  clasificacion text not null check (clasificacion in ('salarios', 'pago_proveedor', 'gastos_mensuales', 'gastos_operacion', 'ajuste')),
  concepto text not null,
  monto numeric not null check (monto > 0),
  origen text not null check (origen in ('caja', 'banco')),
  cuenta_bancaria_id uuid references public.cuentas_bancarias(id),
  observaciones text,
  created_by uuid not null references public.usuarios(id),
  creado_en timestamptz not null default now(),
  check ((origen = 'banco') = (cuenta_bancaria_id is not null))
);

-- Movimientos bancarios: depósitos desde caja, transferencias recibidas
-- directamente, egresos (ligados a un gasto) y ajustes manuales.
create table public.movimientos_bancarios (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas_bancarias(id),
  empresa_id uuid not null references public.empresas(id),
  sucursal_id uuid references public.sucursales(id),
  fecha date not null default current_date,
  tipo text not null check (tipo in ('deposito_caja', 'transferencia_recibida', 'egreso', 'ajuste')),
  monto numeric not null,
  gasto_id uuid references public.gastos(id),
  observaciones text,
  created_by uuid not null references public.usuarios(id),
  creado_en timestamptz not null default now(),
  check (tipo <> 'ajuste' or monto <> 0),
  check (tipo = 'ajuste' or monto > 0),
  check ((tipo = 'egreso') = (gasto_id is not null))
);

-- Cierre de caja diario (el "Cuadre Diario" del Artifact, pero con los
-- cobros y ventas calculados en vivo desde las tablas reales en vez de
-- reescribirlos a mano).
create table public.cierres_caja (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  sucursal_id uuid not null references public.sucursales(id),
  fecha date not null default current_date,
  responsable_id uuid not null references public.usuarios(id),
  caja_anterior numeric not null default 0,
  caja_fisica numeric not null,
  acumulado_optox_anterior numeric,
  acumulado_optox_actual numeric,
  ventas_brutas numeric not null default 0,
  cobro_efectivo numeric not null default 0,
  cobro_tarjeta numeric not null default 0,
  cobro_transferencia_pichincha numeric not null default 0,
  cobro_transferencia_guayaquil numeric not null default 0,
  cobro_transferencia_internacional numeric not null default 0,
  cobro_credito numeric not null default 0,
  cobro_otro numeric not null default 0,
  egresos_efectivo numeric not null default 0,
  egresos_banco numeric not null default 0,
  depositos numeric not null default 0,
  caja_esperada numeric not null default 0,
  diferencia numeric not null default 0,
  check_cobros_ventas boolean,
  check_acumulado boolean,
  check_caja_fisica boolean not null default false,
  cuadre_correcto boolean not null default false,
  observaciones text,
  creado_en timestamptz not null default now(),
  unique (empresa_id, sucursal_id, fecha)
);

-- Helpers de acceso, igual patrón que puede_ventas_empresa: superadmin
-- pasa siempre; el resto necesita permiso + misma empresa.
create or replace function app_private.puede_caja_empresa(p_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'app_private'
as $function$
  select exists (
    select 1 from public.usuarios u join public.roles r on r.id = u.rol_id
    where u.auth_user_id = (select auth.uid()) and u.activo
      and (r.nombre = 'superadmin' or u.empresa_id = p_empresa)
      and (r.nombre = 'superadmin' or public.tiene_permiso('cuadre_caja', 'leer'))
  );
$function$;

create or replace function app_private.puede_saldos_empresa(p_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'app_private'
as $function$
  select exists (
    select 1 from public.usuarios u join public.roles r on r.id = u.rol_id
    where u.auth_user_id = (select auth.uid()) and u.activo
      and (r.nombre = 'superadmin' or u.empresa_id = p_empresa)
      and (r.nombre = 'superadmin' or public.tiene_permiso('saldos_cuentas', 'leer'))
  );
$function$;

alter table public.cuentas_bancarias enable row level security;
alter table public.movimientos_bancarios enable row level security;
alter table public.gastos enable row level security;
alter table public.cierres_caja enable row level security;

create policy cuentas_bancarias_rls on public.cuentas_bancarias for all
  using (app_private.puede_saldos_empresa(empresa_id)) with check (app_private.puede_saldos_empresa(empresa_id));
create policy movimientos_bancarios_rls on public.movimientos_bancarios for all
  using (app_private.puede_saldos_empresa(empresa_id)) with check (app_private.puede_saldos_empresa(empresa_id));
create policy cierres_caja_rls on public.cierres_caja for all
  using (app_private.puede_caja_empresa(empresa_id)) with check (app_private.puede_caja_empresa(empresa_id));
create policy gastos_rls on public.gastos for all using (
  (origen = 'caja' and app_private.puede_caja_empresa(empresa_id)) or
  (origen = 'banco' and app_private.puede_saldos_empresa(empresa_id))
) with check (
  (origen = 'caja' and app_private.puede_caja_empresa(empresa_id)) or
  (origen = 'banco' and app_private.puede_saldos_empresa(empresa_id))
);

-- Un movimiento bancario siempre actualiza el saldo de su cuenta.
create or replace function app_private.aplicar_movimiento_bancario()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $function$
declare v_delta numeric;
begin
  v_delta := case when new.tipo = 'egreso' then -new.monto else new.monto end;
  update public.cuentas_bancarias set saldo_actual = saldo_actual + v_delta, actualizado_en = now() where id = new.cuenta_id;
  return new;
end;
$function$;

create trigger trg_aplicar_movimiento_bancario
  after insert on public.movimientos_bancarios
  for each row execute function app_private.aplicar_movimiento_bancario();

-- Un gasto pagado desde banco genera automáticamente su egreso en esa
-- cuenta; no hay que registrarlo dos veces.
create or replace function app_private.registrar_egreso_bancario_de_gasto()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $function$
begin
  if new.origen = 'banco' then
    insert into public.movimientos_bancarios (cuenta_id, empresa_id, sucursal_id, fecha, tipo, monto, gasto_id, observaciones, created_by)
    values (new.cuenta_bancaria_id, new.empresa_id, new.sucursal_id, new.fecha, 'egreso', new.monto, new.id, new.observaciones, new.created_by);
  end if;
  return new;
end;
$function$;

create trigger trg_registrar_egreso_bancario_de_gasto
  after insert on public.gastos
  for each row execute function app_private.registrar_egreso_bancario_de_gasto();

-- Registrar un gasto (efectivo o banco), validando el permiso según el
-- origen: caja para vendedor/caja/admin, saldos_cuentas (más sensible)
-- para egresos por banco.
create or replace function public.registrar_gasto(
  p_empresa uuid, p_sucursal uuid, p_fecha date, p_clasificacion text, p_concepto text, p_monto numeric,
  p_origen text, p_cuenta_bancaria_id uuid, p_observaciones text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $function$
declare v_user uuid; v_role text; v_gasto uuid;
begin
  select u.id, r.nombre into v_user, v_role
  from public.usuarios u join public.roles r on r.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and (r.nombre = 'superadmin' or u.empresa_id = p_empresa);
  if v_user is null then raise exception 'No autorizado'; end if;

  if p_origen = 'caja' and not (v_role = 'superadmin' or public.tiene_permiso('cuadre_caja', 'crear')) then
    raise exception 'No tienes permiso para registrar egresos de caja.';
  elsif p_origen = 'banco' and not (v_role = 'superadmin' or public.tiene_permiso('saldos_cuentas', 'crear')) then
    raise exception 'No tienes permiso para registrar egresos bancarios.';
  end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto debe ser mayor a cero.'; end if;
  if p_origen = 'banco' and p_cuenta_bancaria_id is null then raise exception 'Elige la cuenta bancaria del egreso.'; end if;

  insert into public.gastos (empresa_id, sucursal_id, fecha, clasificacion, concepto, monto, origen, cuenta_bancaria_id, observaciones, created_by)
  values (p_empresa, p_sucursal, coalesce(p_fecha, current_date), p_clasificacion, p_concepto, p_monto, p_origen, p_cuenta_bancaria_id, nullif(trim(p_observaciones), ''), v_user)
  returning id into v_gasto;
  return v_gasto;
end;
$function$;

-- Registrar un movimiento bancario manual (depósito, transferencia
-- recibida o ajuste). 'egreso' no es seleccionable: nace siempre de un gasto.
create or replace function public.registrar_movimiento_bancario(
  p_cuenta_id uuid, p_sucursal uuid, p_fecha date, p_tipo text, p_monto numeric, p_observaciones text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $function$
declare v_user uuid; v_role text; v_empresa uuid; v_mov uuid;
begin
  select empresa_id into v_empresa from public.cuentas_bancarias where id = p_cuenta_id;
  if v_empresa is null then raise exception 'Cuenta bancaria no encontrada'; end if;

  select u.id, r.nombre into v_user, v_role
  from public.usuarios u join public.roles r on r.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and (r.nombre = 'superadmin' or u.empresa_id = v_empresa);
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('saldos_cuentas', 'crear')) then
    raise exception 'No autorizado';
  end if;
  if p_tipo not in ('deposito_caja', 'transferencia_recibida', 'ajuste') then raise exception 'Tipo de movimiento inválido.'; end if;
  if p_tipo <> 'ajuste' and (p_monto is null or p_monto <= 0) then raise exception 'El monto debe ser mayor a cero.'; end if;
  if p_tipo = 'ajuste' and (p_monto is null or p_monto = 0) then raise exception 'El ajuste no puede ser cero.'; end if;

  insert into public.movimientos_bancarios (cuenta_id, empresa_id, sucursal_id, fecha, tipo, monto, observaciones, created_by)
  values (p_cuenta_id, v_empresa, p_sucursal, coalesce(p_fecha, current_date), p_tipo, p_monto, nullif(trim(p_observaciones), ''), v_user)
  returning id into v_mov;
  return v_mov;
end;
$function$;

-- Registrar el cuadre diario: calcula ventas y cobros reales del día
-- (desde ventas/pagos_venta), egresos y depósitos reales (desde
-- gastos/movimientos_bancarios), y aplica las 3 comprobaciones del
-- Artifact original.
create or replace function public.registrar_cierre_caja(
  p_empresa uuid, p_sucursal uuid, p_fecha date, p_caja_fisica numeric,
  p_acumulado_optox_anterior numeric, p_acumulado_optox_actual numeric, p_observaciones text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $function$
declare
  v_user uuid; v_role text; v_fecha date := coalesce(p_fecha, current_date);
  v_caja_anterior numeric := 0;
  v_ventas_brutas numeric := 0;
  v_efectivo numeric := 0; v_tarjeta numeric := 0; v_pich numeric := 0; v_guay numeric := 0; v_intl numeric := 0; v_credito numeric := 0; v_otro numeric := 0;
  v_egresos_efectivo numeric := 0; v_egresos_banco numeric := 0; v_depositos numeric := 0;
  v_caja_esperada numeric; v_diferencia numeric;
  v_check_cobros boolean; v_check_acumulado boolean; v_check_caja boolean; v_correcto boolean;
  v_id uuid;
begin
  select u.id, r.nombre into v_user, v_role
  from public.usuarios u join public.roles r on r.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and (r.nombre = 'superadmin' or u.empresa_id = p_empresa);
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('cuadre_caja', 'crear')) then
    raise exception 'No autorizado';
  end if;
  if p_caja_fisica is null then raise exception 'Ingresa el efectivo contado en caja.'; end if;

  select caja_fisica into v_caja_anterior from public.cierres_caja
    where empresa_id = p_empresa and sucursal_id = p_sucursal and fecha < v_fecha
    order by fecha desc limit 1;
  v_caja_anterior := coalesce(v_caja_anterior, 0);

  select coalesce(sum(total), 0) into v_ventas_brutas from public.ventas
    where empresa_id = p_empresa and sucursal_id = p_sucursal and estado = 'completada' and creado_en::date = v_fecha;

  select
    coalesce(sum(p.monto) filter (where p.metodo = 'efectivo'), 0),
    coalesce(sum(p.monto) filter (where p.metodo = 'tarjeta'), 0),
    coalesce(sum(p.monto) filter (where p.metodo = 'transferencia' and p.banco = 'pichincha'), 0),
    coalesce(sum(p.monto) filter (where p.metodo = 'transferencia' and p.banco = 'guayaquil'), 0),
    coalesce(sum(p.monto) filter (where p.metodo = 'transferencia' and p.banco = 'internacional'), 0),
    coalesce(sum(p.monto) filter (where p.metodo = 'credito'), 0),
    coalesce(sum(p.monto) filter (where p.metodo = 'otro' or (p.metodo = 'transferencia' and (p.banco is null or p.banco = 'otro'))), 0)
  into v_efectivo, v_tarjeta, v_pich, v_guay, v_intl, v_credito, v_otro
  from public.pagos_venta p join public.ventas v on v.id = p.venta_id
  where v.empresa_id = p_empresa and v.sucursal_id = p_sucursal and p.creado_en::date = v_fecha;

  select coalesce(sum(monto), 0) into v_egresos_efectivo from public.gastos
    where empresa_id = p_empresa and sucursal_id = p_sucursal and origen = 'caja' and fecha = v_fecha;
  select coalesce(sum(monto), 0) into v_egresos_banco from public.gastos
    where empresa_id = p_empresa and sucursal_id = p_sucursal and origen = 'banco' and fecha = v_fecha;
  select coalesce(sum(monto), 0) into v_depositos from public.movimientos_bancarios
    where empresa_id = p_empresa and sucursal_id = p_sucursal and tipo = 'deposito_caja' and fecha = v_fecha;

  v_caja_esperada := v_caja_anterior + v_efectivo - v_egresos_efectivo - v_depositos;
  v_diferencia := p_caja_fisica - v_caja_esperada;
  v_check_caja := abs(v_diferencia) < 0.01;
  v_check_cobros := abs((v_efectivo + v_tarjeta + v_pich + v_guay + v_intl + v_credito + v_otro) - v_ventas_brutas) < 0.01;
  if p_acumulado_optox_anterior is not null and p_acumulado_optox_actual is not null then
    v_check_acumulado := abs((p_acumulado_optox_actual - p_acumulado_optox_anterior) - (v_ventas_brutas - (v_egresos_efectivo + v_egresos_banco))) < 0.01;
  else
    v_check_acumulado := null;
  end if;
  v_correcto := v_check_caja and v_check_cobros and coalesce(v_check_acumulado, true);

  insert into public.cierres_caja (
    empresa_id, sucursal_id, fecha, responsable_id, caja_anterior, caja_fisica, acumulado_optox_anterior, acumulado_optox_actual,
    ventas_brutas, cobro_efectivo, cobro_tarjeta, cobro_transferencia_pichincha, cobro_transferencia_guayaquil, cobro_transferencia_internacional, cobro_credito, cobro_otro,
    egresos_efectivo, egresos_banco, depositos, caja_esperada, diferencia, check_cobros_ventas, check_acumulado, check_caja_fisica, cuadre_correcto, observaciones
  ) values (
    p_empresa, p_sucursal, v_fecha, v_user, v_caja_anterior, p_caja_fisica, p_acumulado_optox_anterior, p_acumulado_optox_actual,
    v_ventas_brutas, v_efectivo, v_tarjeta, v_pich, v_guay, v_intl, v_credito, v_otro,
    v_egresos_efectivo, v_egresos_banco, v_depositos, v_caja_esperada, v_diferencia, v_check_cobros, v_check_acumulado, v_check_caja, v_correcto, nullif(trim(p_observaciones), '')
  ) returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function public.registrar_gasto(uuid, uuid, date, text, text, numeric, text, uuid, text) from public, anon;
grant execute on function public.registrar_gasto(uuid, uuid, date, text, text, numeric, text, uuid, text) to authenticated;
revoke all on function public.registrar_movimiento_bancario(uuid, uuid, date, text, numeric, text) from public, anon;
grant execute on function public.registrar_movimiento_bancario(uuid, uuid, date, text, numeric, text) to authenticated;
revoke all on function public.registrar_cierre_caja(uuid, uuid, date, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.registrar_cierre_caja(uuid, uuid, date, numeric, numeric, numeric, text) to authenticated;

-- Cuentas bancarias iniciales (saldo en 0; se ajustan luego con un
-- movimiento de tipo 'ajuste' al saldo real).
insert into public.cuentas_bancarias (empresa_id, banco)
select e.id, b.banco from public.empresas e cross join (values ('pichincha'), ('guayaquil'), ('internacional')) as b(banco)
on conflict (empresa_id, banco) do nothing;
;
