
revoke all on function public.registrar_abono_venta(uuid, text, numeric, text, text) from public;
revoke all on function public.registrar_abono_venta(uuid, text, numeric, text, text) from anon;
grant execute on function public.registrar_abono_venta(uuid, text, numeric, text, text) to authenticated;
;
