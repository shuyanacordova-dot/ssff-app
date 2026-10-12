-- Corrección de pagos de deudas con historial y ajuste del egreso vinculado.
create table if not exists public.pagos_deuda_auditoria (
  id uuid primary key default gen_random_uuid(), pago_id uuid not null,
  accion text not null check (accion in ('editado','eliminado')),
  antes jsonb not null, despues jsonb, motivo text not null,
  usuario_id uuid references public.usuarios(id), creado_en timestamptz not null default now()
);
alter table public.pagos_deuda_auditoria enable row level security;
revoke all on public.pagos_deuda_auditoria from public, anon, authenticated;
grant select on public.pagos_deuda_auditoria to authenticated;
create policy pagos_deuda_auditoria_superadmin on public.pagos_deuda_auditoria for select to authenticated using (public.es_superadmin());

create or replace function public.corregir_pago_deuda(p_pago uuid, p_eliminar boolean, p_monto numeric, p_fecha date, p_periodo date, p_notas text, p_motivo text)
returns void language plpgsql security definer set search_path = public, app_private as $$
declare v_pago public.pagos_deuda_negocio; v_deuda public.deudas_negocio; v_gasto public.gastos; v_usuario uuid; v_nuevo numeric;
begin
  if not public.es_superadmin() then raise exception 'Solo la superadministradora puede corregir pagos'; end if;
  if length(trim(coalesce(p_motivo,''))) < 3 then raise exception 'Indica el motivo de la corrección'; end if;
  select * into v_pago from public.pagos_deuda_negocio where id=p_pago for update;
  if v_pago.id is null then raise exception 'Pago no encontrado'; end if;
  if coalesce(v_pago.automatico,false) then raise exception 'Este pago se generó desde un egreso. Corrige ese egreso'; end if;
  select * into v_deuda from public.deudas_negocio where id=v_pago.deuda_id for update;
  if v_deuda.id is null then raise exception 'Deuda no encontrada'; end if;
  select id into v_usuario from public.usuarios where auth_user_id=(select auth.uid()) and activo limit 1;
  if v_pago.gasto_id is not null then
    select * into v_gasto from public.gastos where id=v_pago.gasto_id for update;
    if v_gasto.id is null then raise exception 'Falta el egreso vinculado; revisa antes de corregir'; end if;
  end if;
  if p_eliminar then
    insert into public.pagos_deuda_auditoria(pago_id,accion,antes,motivo,usuario_id)
    values(p_pago,'eliminado',to_jsonb(v_pago),trim(p_motivo),v_usuario);
    if v_gasto.id is not null then perform public.eliminar_gasto(v_gasto.id,p_motivo); end if;
    delete from public.pagos_deuda_negocio where id=p_pago;
    v_nuevo := 0;
  else
    if p_monto is null or p_monto <= 0 or p_fecha is null then raise exception 'Indica monto y fecha válidos'; end if;
    if v_deuda.modalidad in ('cuotas','libre') and p_monto > v_deuda.saldo + v_pago.monto + .001 then raise exception 'El pago supera el saldo de la deuda'; end if;
    if v_gasto.id is not null then
      perform public.editar_gasto(v_gasto.id,p_fecha,v_gasto.clasificacion,v_gasto.concepto,p_monto,v_gasto.origen,v_gasto.cuenta_bancaria_id,coalesce(p_notas,''),p_motivo);
    end if;
    update public.pagos_deuda_negocio set monto=p_monto,fecha_pago=p_fecha,
      periodo=date_trunc('month',coalesce(p_periodo,p_fecha))::date,notas=nullif(trim(p_notas),'')
      where id=p_pago;
    insert into public.pagos_deuda_auditoria(pago_id,accion,antes,despues,motivo,usuario_id)
    select p_pago,'editado',to_jsonb(v_pago),to_jsonb(p),trim(p_motivo),v_usuario from public.pagos_deuda_negocio p where p.id=p_pago;
    v_nuevo := p_monto;
  end if;
  if v_deuda.modalidad in ('cuotas','libre') then
    update public.deudas_negocio set saldo=greatest(0,saldo+v_pago.monto-v_nuevo),
      estado=case when saldo+v_pago.monto-v_nuevo <= .001 then 'pagada' else 'pendiente' end,
      actualizado_en=now() where id=v_deuda.id;
  end if;
end;
$$;
revoke all on function public.corregir_pago_deuda(uuid,boolean,numeric,date,date,text,text) from public,anon;
grant execute on function public.corregir_pago_deuda(uuid,boolean,numeric,date,date,text,text) to authenticated;
