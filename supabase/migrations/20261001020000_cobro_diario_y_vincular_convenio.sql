-- Pedidos de Shuyana 2026-10-01:
-- 1) Frecuencia de cobro DIARIA en Cuentas por cobrar (y pestaña "Cobros diarios"); en "Cobros de hoy" sale todos los días.
-- 2) El convenio "Municipio de Shushufindi" se llama "Sindicato Único de Trabajadores del Municipio de Shushufindi"
--    (también en el texto de los acuerdos ya generados).
-- 3) Sergi Matías Pazmiño Vera: su acuerdo es a 4 cuotas, no 6 ($100 → 4 × $25).
-- 4) Clasificar una deuda como "Convenios" la VINCULA a la empresa del convenio para los informes:
--    vincular_convenio_paciente(paciente, empresa, titular): el titular (trabajador) queda como persona del convenio y,
--    si es otra persona, como responsable de la cuenta del paciente. El informe mensual incluye las deudas de los
--    dependientes (pacientes en "convenio" cuyo responsable es persona del convenio) a nombre del trabajador.
-- 5) Ámbar Jaily Lara Ruiz ($90, folio 5077) → Sindicato, descuento a Sandra Macarena Ruiz (confirmado por Shuyana).

alter table public.pacientes_clinicos drop constraint if exists pacientes_clinicos_frecuencia_cobro_check;
alter table public.pacientes_clinicos add constraint pacientes_clinicos_frecuencia_cobro_check
  check (frecuencia_cobro is null or frecuencia_cobro in ('diaria', 'semanal', 'quincenal', 'mensual'));
alter table public.pacientes_clinicos drop constraint if exists pacientes_clinicos_categoria_cobro_check;
alter table public.pacientes_clinicos add constraint pacientes_clinicos_categoria_cobro_check
  check (categoria_cobro is null or categoria_cobro in ('urgentes', 'recientes', 'diarios', 'semanales', 'quincenales', 'mensuales', 'convenio', 'rezagados'));

create or replace function public.actualizar_frecuencia_cobro(p_paciente uuid, p_frecuencia text)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid; v_role text;
begin
  select u.id, ro.nombre into v_user, v_role
  from public.usuarios u join public.roles ro on ro.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo;
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('ventas', 'crear')) then
    raise exception 'No autorizado';
  end if;
  if p_frecuencia is not null and p_frecuencia not in ('diaria', 'semanal', 'quincenal', 'mensual') then
    raise exception 'Frecuencia inválida';
  end if;
  update public.pacientes_clinicos set frecuencia_cobro = p_frecuencia, actualizado_en = now() where id = p_paciente;
end;
$function$;

create or replace function public.clasificar_deuda_paciente(p_paciente uuid, p_categoria text)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid; v_role text;
begin
  select u.id, ro.nombre into v_user, v_role
  from public.usuarios u join public.roles ro on ro.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo;
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('ventas', 'crear')) then
    raise exception 'No autorizado';
  end if;
  if p_categoria is not null and p_categoria not in ('urgentes', 'recientes', 'diarios', 'semanales', 'quincenales', 'mensuales', 'convenio', 'rezagados') then
    raise exception 'Clasificación inválida';
  end if;
  update public.pacientes_clinicos set categoria_cobro = p_categoria, actualizado_en = now() where id = p_paciente;
end;
$function$;

-- Vincular una deuda (paciente) a una empresa de convenio, con el trabajador titular.
create or replace function public.vincular_convenio_paciente(p_paciente uuid, p_empresa_convenio uuid, p_titular uuid default null)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid; v_role text; v_paciente record; v_titular uuid; v_t record;
begin
  select u.id, ro.nombre into v_user, v_role
  from public.usuarios u join public.roles ro on ro.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo;
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('ventas', 'crear')) then
    raise exception 'No autorizado';
  end if;
  if not exists (select 1 from public.empresas_convenio where id = p_empresa_convenio) then raise exception 'Empresa de convenio no encontrada.'; end if;
  select * into v_paciente from public.pacientes_clinicos where id = p_paciente;
  if v_paciente.id is null then raise exception 'Paciente no encontrado.'; end if;
  v_titular := coalesce(p_titular, v_paciente.responsable_id, v_paciente.id);
  select * into v_t from public.pacientes_clinicos where id = v_titular;
  if v_t.id is null then raise exception 'Trabajador titular no encontrado.'; end if;

  update public.pacientes_clinicos
     set categoria_cobro = 'convenio',
         responsable_id = case when v_titular <> v_paciente.id then v_titular else responsable_id end,
         actualizado_en = now()
   where id = p_paciente;

  -- El titular queda como persona del convenio (si ya estaba por cédula sin ficha, se le enlaza la ficha).
  if not exists (select 1 from public.convenio_personas where empresa_convenio_id = p_empresa_convenio and paciente_id = v_titular) then
    if v_t.cedula is not null and exists (select 1 from public.convenio_personas where empresa_convenio_id = p_empresa_convenio and cedula = v_t.cedula) then
      update public.convenio_personas set paciente_id = v_titular, estado = 'cliente', actualizado_en = now()
       where empresa_convenio_id = p_empresa_convenio and cedula = v_t.cedula;
    else
      insert into public.convenio_personas (empresa_convenio_id, nombres, apellidos, cedula, telefono, estado, paciente_id, created_by)
      values (p_empresa_convenio, coalesce(nullif(trim(v_t.nombres), ''), 'Sin nombre'), nullif(trim(v_t.apellidos), ''), v_t.cedula, v_t.telefono, 'cliente', v_titular, v_user);
    end if;
  end if;
end;
$function$;
revoke all on function public.vincular_convenio_paciente(uuid, uuid, uuid) from public, anon;
grant execute on function public.vincular_convenio_paciente(uuid, uuid, uuid) to authenticated;

-- Nombre correcto del convenio y texto de sus acuerdos.
update public.acuerdos_pago set texto = replace(texto, 'Municipio de Shushufindi', 'Sindicato Único de Trabajadores del Municipio de Shushufindi')
where empresa_convenio_id = '268ac214-830b-4b38-956c-8b13865fb676' and texto like '%Municipio de Shushufindi%' and texto not like '%Sindicato Único%';
update public.empresas_convenio set nombre = 'Sindicato Único de Trabajadores del Municipio de Shushufindi'
where id = '268ac214-830b-4b38-956c-8b13865fb676';

-- Sergi Matías Pazmiño Vera: 4 cuotas de $25.
update public.acuerdos_pago set cuotas = 4, monto_cuota = 25.00,
  texto = replace(texto, 'en 6 cuota(s) de $16.67 cada una', 'en 4 cuota(s) de $25.00 cada una')
where id = '6dbb3ea2-50fb-456a-96c3-9362cb5b8e78' and cuotas = 6;

-- Ámbar Jaily Lara Ruiz → responsable Sandra Macarena Ruiz (persona del Sindicato), categoría convenio.
update public.pacientes_clinicos set responsable_id = 'b82a1d93-84a2-4e55-95ac-b70bb28f58a1', categoria_cobro = 'convenio', actualizado_en = now()
where id = 'bd65b9d3-e079-4b48-a492-f81ac6c95f65';

-- Cobros de hoy: frecuencia diaria (todos los días).
create or replace function public.cola_cobros_hoy(p_sucursal uuid)
returns table(paciente_id uuid, nombres text, apellidos text, telefono text, empresa_id uuid, empresa_nombre text, saldo numeric, ventas integer,
  dias_deuda integer, motivo text, cada_dias integer, ultimo_mensaje timestamptz,
  cobro_insistente boolean, frecuencia text, apartado boolean, apartado_hasta date, fecha_cobro_acordada date)
language sql stable security definer set search_path to 'public', 'app_private'
as $$
  with permiso as (
    select 1 from public.usuarios u join public.roles r on r.id = u.rol_id
    where u.auth_user_id = (select auth.uid()) and u.activo
      and r.nombre in ('superadmin', 'admin_sucursal', 'vendedor', 'caja', 'optometra')
      and (select app_private.sucursales_usuario()) @> array[p_sucursal]
  ), hoy as (select (now() at time zone 'America/Guayaquil')::date d),
  deudas as (
    select v.paciente_id, v.empresa_id, sum(v.saldo) saldo, count(*)::int ventas,
           ((select d from hoy) - min((v.creado_en at time zone 'America/Guayaquil')::date))::int dias,
           bool_or(coalesce(v.apartado, false)) apartado, min(v.apartado_hasta) filter (where v.apartado) apartado_hasta
    from public.ventas v
    where v.sucursal_id = p_sucursal and v.estado = 'completada' and v.saldo > 0.004 and v.paciente_id is not null
      and not exists (select 1 from public.acuerdos_pago a where a.venta_id = v.id)
    group by v.paciente_id, v.empresa_id
  ), reglas as (
    select d.*, p.nombres, p.apellidos, p.telefono, p.cobro_insistente, p.fecha_cobro_acordada,
      case when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('diaria', 'diarios') then 'diaria'
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('semanal', 'semanales') then 'semanal'
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('quincenal', 'quincenales') then 'quincenal'
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('mensual', 'mensuales') then 'mensual' end frecuencia,
      case when p.cobro_insistente then 1
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('diaria', 'diarios') then 1
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('semanal', 'semanales') then 7
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('quincenal', 'quincenales') then 15
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('mensual', 'mensuales') then 30
           when p.categoria_cobro in ('convenio', 'rezagados') then null
           when d.dias > 8 then 15 end cada_dias,
      case when p.cobro_insistente then 'Cobro insistente (todos los días)'
           when d.apartado then 'Apartado'
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('diaria', 'diarios') then 'Cobro diario'
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('semanal', 'semanales') then 'Cobro semanal'
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('quincenal', 'quincenales') then 'Cobro quincenal'
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('mensual', 'mensuales') then 'Cobro mensual'
           else 'Saldo pendiente (cada 15 días)' end motivo,
      (select max(m.enviado_en) from public.cobros_mensajes m where m.paciente_id = d.paciente_id and m.sucursal_id = p_sucursal) ultimo
    from deudas d join public.pacientes_clinicos p on p.id = d.paciente_id
    where exists (select 1 from permiso)
  )
  select r.paciente_id, r.nombres, r.apellidos, r.telefono, r.empresa_id, e.nombre, r.saldo, r.ventas, r.dias,
         case when r.fecha_cobro_acordada is not null and r.fecha_cobro_acordada <= (select d from hoy)
                   and (r.ultimo is null or (r.ultimo at time zone 'America/Guayaquil')::date < r.fecha_cobro_acordada)
              then 'Fecha de cobro acordada (' || to_char(r.fecha_cobro_acordada, 'DD/MM') || ')' else r.motivo end,
         r.cada_dias, r.ultimo, coalesce(r.cobro_insistente, false), r.frecuencia, r.apartado, r.apartado_hasta, r.fecha_cobro_acordada
  from reglas r join public.empresas e on e.id = r.empresa_id
  where (
      r.fecha_cobro_acordada is not null and r.fecha_cobro_acordada <= (select d from hoy)
      and (r.ultimo is null or (r.ultimo at time zone 'America/Guayaquil')::date < r.fecha_cobro_acordada)
    ) or (
      r.cada_dias is not null
      and (r.fecha_cobro_acordada is null or r.fecha_cobro_acordada <= (select d from hoy))
      and (r.ultimo is null or (r.ultimo at time zone 'America/Guayaquil')::date <= (select d from hoy) - r.cada_dias)
    )
  order by (r.cada_dias = 1) desc, r.saldo desc;
$$;

-- Informe mensual: incluye deudas de dependientes en "convenio" cuyo responsable es persona del convenio;
-- sin acuerdo firmado, el "empleado" es ese responsable y el paciente aparece como beneficiario.
create or replace function public.informe_convenio_mensual(p_convenio uuid, p_optica uuid, p_mes date)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'app_private'
as $function$
declare v_mes date := date_trunc('month', coalesce(p_mes, (now() at time zone 'America/Guayaquil')::date))::date;
        v_filas jsonb; v_convenio record; v_optica record;
begin
  if not (public.es_superadmin()
    or exists (select 1 from public.usuarios u join public.roles r on r.id = u.rol_id
               where u.auth_user_id = (select auth.uid()) and u.activo and r.nombre = 'admin_sucursal' and u.empresa_id = p_optica)
    or (public.tiene_permiso('informes_convenio', 'leer')
        and exists (select 1 from public.usuarios u where u.auth_user_id = (select auth.uid()) and u.activo and u.empresa_id = p_optica))) then
    raise exception 'Solo la administración puede generar el informe del convenio.';
  end if;
  select id, nombre, cuotas_predeterminadas into v_convenio from public.empresas_convenio where id = p_convenio;
  if v_convenio.id is null then raise exception 'Convenio no encontrado.'; end if;
  select id, nombre, direccion, telefono, email, logo_url into v_optica from public.empresas where id = p_optica;
  if v_optica.id is null then raise exception 'Óptica no encontrada.'; end if;

  with candidatas as (
    select a.venta_id, a.id acuerdo_id from public.acuerdos_pago a where a.empresa_convenio_id = p_convenio
    union
    select v.id, null::uuid from public.convenio_personas cp join public.ventas v on v.paciente_id = cp.paciente_id
    where cp.empresa_convenio_id = p_convenio and cp.paciente_id is not null
    union
    select v.id, null::uuid from public.convenio_personas cp
      join public.pacientes_clinicos dep on dep.responsable_id = cp.paciente_id and dep.categoria_cobro = 'convenio'
      join public.ventas v on v.paciente_id = dep.id
    where cp.empresa_convenio_id = p_convenio and cp.paciente_id is not null
  ), ventas_deuda as (
    select distinct on (v.id) v.id venta_id, v.folio, v.creado_en, v.total, v.pagado, v.saldo, v.paciente_id, v.cliente_nombre, v.sucursal_id,
           coalesce(c.acuerdo_id, (select a2.id from public.acuerdos_pago a2 where a2.venta_id = v.id and a2.empresa_convenio_id = p_convenio limit 1)) acuerdo_id
    from candidatas c join public.ventas v on v.id = c.venta_id
    where v.empresa_id = p_optica and v.estado = 'completada' and v.saldo > 0.004
      -- Una venta con acuerdo en OTRA empresa de convenio no entra a este informe.
      and not exists (select 1 from public.acuerdos_pago ax where ax.venta_id = v.id and ax.empresa_convenio_id <> p_convenio)
    order by v.id, c.acuerdo_id nulls last
  ), plan as (
    select d.*, a.id a_id, t.id t_id, t.nombres t_nombres, t.apellidos t_apellidos, t.cedula t_cedula,
      coalesce(a.cuotas, v_convenio.cuotas_predeterminadas) n_cuotas,
      coalesce(a.monto_cuota, round(greatest(d.total - coalesce((select sum(pv.monto) from public.pagos_venta pv where pv.venta_id = d.venta_id
                  and (pv.creado_en at time zone 'America/Guayaquil')::date = (d.creado_en at time zone 'America/Guayaquil')::date), 0), 0)
                / v_convenio.cuotas_predeterminadas, 2)) monto,
      coalesce(date_trunc('month', a.fecha_primera_cuota)::date,
               (date_trunc('month', (d.creado_en at time zone 'America/Guayaquil')::date) + interval '1 month')::date) inicio
    from ventas_deuda d
    left join public.acuerdos_pago a on a.id = d.acuerdo_id
    left join public.pacientes_clinicos pp on pp.id = d.paciente_id
    left join public.pacientes_clinicos t on t.id = coalesce(a.titular_paciente_id,
      case when exists (select 1 from public.convenio_personas cpx where cpx.empresa_convenio_id = p_convenio and cpx.paciente_id = pp.responsable_id)
           then pp.responsable_id end)
  )
  select coalesce(jsonb_agg(fila order by fila->>'empleado', fila->>'folio'), '[]'::jsonb) into v_filas
  from (
    select jsonb_build_object(
      'venta_id', d.venta_id, 'folio', d.folio, 'fecha_venta', (d.creado_en at time zone 'America/Guayaquil')::date,
      'empleado', coalesce(nullif(trim(d.t_nombres || ' ' || coalesce(d.t_apellidos, '')), ''), nullif(trim(p.nombres || ' ' || coalesce(p.apellidos, '')), ''), d.cliente_nombre, 'Sin nombre'),
      'cedula', coalesce(d.t_cedula, p.cedula),
      'beneficiario', case when d.t_id is not null and d.t_id <> p.id then nullif(trim(p.nombres || ' ' || coalesce(p.apellidos, '')), '') end,
      'sucursal', s.nombre,
      'total', d.total, 'pagado', d.pagado, 'saldo', d.saldo,
      'con_acuerdo', d.a_id is not null, 'cuotas_automaticas', d.a_id is null,
      'cuotas', d.n_cuotas, 'monto_cuota', d.monto,
      'cuota_numero', (extract(year from age(v_mes, d.inicio)) * 12 + extract(month from age(v_mes, d.inicio)))::int + 1,
      'cuota_mes', round(case
        when v_mes < d.inicio then 0
        when v_mes >= (d.inicio + make_interval(months => d.n_cuotas))::date - interval '1 month' then d.saldo
        else least(d.monto, d.saldo) end, 2)
    ) fila
    from plan d
    left join public.pacientes_clinicos p on p.id = d.paciente_id
    left join public.sucursales s on s.id = d.sucursal_id
  ) x;

  return jsonb_build_object(
    'convenio', jsonb_build_object('id', v_convenio.id, 'nombre', v_convenio.nombre, 'cuotas_predeterminadas', v_convenio.cuotas_predeterminadas),
    'optica', jsonb_build_object('id', v_optica.id, 'nombre', v_optica.nombre, 'direccion', v_optica.direccion, 'telefono', v_optica.telefono, 'email', v_optica.email, 'logo_url', v_optica.logo_url),
    'mes', v_mes, 'filas', v_filas);
end;
$function$;
