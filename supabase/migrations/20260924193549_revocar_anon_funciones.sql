revoke execute on function public.activar_cobro_insistente(uuid, boolean) from public, anon;
revoke execute on function public.actualizar_estado_garantia(uuid, text) from public, anon;
revoke execute on function public.actualizar_orden_laboratorio(uuid, text, text, text, jsonb, jsonb, text) from public, anon;
revoke execute on function public.crear_garantia(uuid, uuid, text, text, text) from public, anon;
revoke execute on function public.crear_orden_laboratorio(uuid, uuid, uuid, text, text, text, jsonb, jsonb, text, boolean, uuid) from public, anon;
revoke execute on function public.registrar_pago_deuda_negocio(uuid, numeric, date, text, text, text) from public, anon;
revoke execute on function public.vincular_orden_garantia(uuid, uuid) from public, anon;

grant execute on function public.activar_cobro_insistente(uuid, boolean) to authenticated;
grant execute on function public.actualizar_estado_garantia(uuid, text) to authenticated;
grant execute on function public.actualizar_orden_laboratorio(uuid, text, text, text, jsonb, jsonb, text) to authenticated;
grant execute on function public.crear_garantia(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.crear_orden_laboratorio(uuid, uuid, uuid, text, text, text, jsonb, jsonb, text, boolean, uuid) to authenticated;
grant execute on function public.registrar_pago_deuda_negocio(uuid, numeric, date, text, text, text) to authenticated;
grant execute on function public.vincular_orden_garantia(uuid, uuid) to authenticated;
