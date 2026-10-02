-- Permiso para anular ventas por persona (Shuyana 2026-10-01: "dale acceso a Erick para que cancele ventas").
-- usuarios.puede_anular_ventas: además de la Superadministradora, la persona marcada puede anular ventas SOLO de su
-- propia empresa (Erick → Focus). La anulación sigue pidiendo motivo y el modo (devolver o saldo a favor).

alter table public.usuarios add column if not exists puede_anular_ventas boolean not null default false;
update public.usuarios set puede_anular_ventas = true where id = '40d6c60f-662d-4535-b8f7-91010dead3b8'; -- Erick Balseca (Focus)

do $migracion$
declare v_def text; v_nuevo text;
begin
  v_def := pg_get_functiondef('public.anular_venta_con_modo(uuid,text,text,text,text)'::regprocedure);
  v_nuevo := replace(v_def,
$a$  if not public.es_superadmin() then
    raise exception 'Solo la Superadministradora puede anular una venta.';
  end if;
$a$, '');
  v_nuevo := replace(v_nuevo,
$b$  if not found then raise exception 'No se encontró la venta.'; end if;
$b$,
$c$  if not found then raise exception 'No se encontró la venta.'; end if;
  -- Superadministradora, o una persona autorizada a anular ventas de su propia empresa.
  if not (public.es_superadmin() or exists (
      select 1 from public.usuarios ua where ua.auth_user_id = (select auth.uid()) and ua.activo
        and ua.puede_anular_ventas and ua.empresa_id = v_empresa)) then
    raise exception 'No tienes permiso para anular esta venta.';
  end if;
$c$);
  if v_nuevo = v_def or position('puede_anular_ventas' in v_nuevo) = 0 or position('Solo la Superadministradora puede anular' in v_nuevo) > 0 then
    raise exception 'No se pudo actualizar anular_venta_con_modo (texto inesperado).';
  end if;
  execute v_nuevo;
end
$migracion$;

-- El trigger de ventas también permitía anular solo a la Superadministradora: se aplica la misma regla.
do $trigger$
declare v_def text; v_nuevo text;
begin
  v_def := pg_get_functiondef('app_private.validar_transicion_venta()'::regprocedure);
  v_nuevo := replace(v_def,
$a$    if v_role is distinct from 'superadmin' then
      raise exception 'Solo la Superadministradora puede anular una venta.';
    end if;$a$,
$b$    if v_role is distinct from 'superadmin' and not exists (
        select 1 from public.usuarios ua where ua.auth_user_id = (select auth.uid()) and ua.activo
          and ua.puede_anular_ventas and ua.empresa_id = old.empresa_id) then
      raise exception 'No tienes permiso para anular esta venta.';
    end if;$b$);
  if v_nuevo = v_def then raise exception 'No se pudo actualizar validar_transicion_venta (texto inesperado).'; end if;
  execute v_nuevo;
end
$trigger$;
