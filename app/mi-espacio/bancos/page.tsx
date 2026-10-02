import { getOperationalContext } from "@/lib/operational-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fechaGuayaquil } from "@/lib/record-date";
import CuadreBancosBoard, { type CuadreGuardado, type CuentaCuadre } from "./cuadre-bancos-board";
import type { FilaCuadreGeneral } from "./cuadre-general";
import type { PagoPendiente, AcreditacionReciente } from "./tarjetas-acreditacion";

export const dynamic = "force-dynamic";

export default async function CuadreBancosPage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const hoy = fechaGuayaquil();
  const pedida = (await searchParams).fecha;
  const fecha = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) && pedida <= hoy ? pedida : hoy;
  const context = await getOperationalContext();
  if (!context) return <CuadreBancosBoard status="needs_login" fecha={fecha} cuentas={[]} historial={[]} general={[]} />;
  if (context.profile.rol !== "superadmin") return <CuadreBancosBoard status="forbidden" fecha={fecha} cuentas={[]} historial={[]} general={[]} />;
  const supabase = await createSupabaseServerClient();
  const [cuentasResult, historialResult, generalResult, pendientesResult, acreditacionesResult] = await Promise.all([
    supabase.from("cuentas_bancarias").select("id,empresa_id,sucursal_id,banco,saldo_actual").eq("activo", true),
    supabase.from("cuadres_banco").select("id,cuenta_id,fecha,desde,saldo_anterior,transferencias,tarjetas,depositos_caja,otros_ingresos,egresos,comisiones,saldo_esperado,saldo_real,diferencia,notas").order("fecha", { ascending: false }).limit(60),
    supabase.rpc("cuadre_general", { p_fecha: fecha }),
    supabase.rpc("tarjetas_por_acreditar", { p_sucursal: null }),
    supabase.from("acreditaciones_tarjeta").select("id,fecha,cuenta_id,monto_bruto,monto_neto,comision").order("creado_en", { ascending: false }).limit(15),
  ]);
  const empresa = new Map(context.companies.map((c) => [c.id, c.nombre]));
  const sucursal = new Map(context.branches.map((b) => [b.id, b.nombre]));
  const orden: Record<string, number> = { pichincha: 0, guayaquil: 1, internacional: 2 };
  const cuentas: CuentaCuadre[] = (cuentasResult.data ?? [])
    .map((c) => ({ id: c.id as string, empresa_id: c.empresa_id as string, empresa_nombre: empresa.get(c.empresa_id as string) ?? "Empresa", sucursal_id: c.sucursal_id as string, sucursal_nombre: sucursal.get(c.sucursal_id as string) ?? empresa.get(c.empresa_id as string) ?? "Sucursal", banco: c.banco as string, saldo_actual: Number(c.saldo_actual) }))
    .sort((a, b) => a.sucursal_nombre.localeCompare(b.sucursal_nombre) || (orden[a.banco] ?? 9) - (orden[b.banco] ?? 9));
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const historial: CuadreGuardado[] = (historialResult.data ?? []).map((h) => ({
    id: h.id, cuenta_id: h.cuenta_id, fecha: h.fecha, desde: h.desde, saldo_anterior: num(h.saldo_anterior), transferencias: Number(h.transferencias), tarjetas: Number(h.tarjetas),
    depositos_caja: Number(h.depositos_caja), otros_ingresos: Number(h.otros_ingresos), egresos: Number(h.egresos), comisiones: Number(h.comisiones),
    saldo_esperado: num(h.saldo_esperado), saldo_real: Number(h.saldo_real), diferencia: num(h.diferencia), notas: h.notas,
  }));
  const pendientes: PagoPendiente[] = (pendientesResult.data ?? []).map((p: PagoPendiente) => ({ ...p, monto: Number(p.monto) }));
  const acreditaciones: AcreditacionReciente[] = (acreditacionesResult.data ?? []).map((a) => ({ ...a, monto_bruto: Number(a.monto_bruto), monto_neto: Number(a.monto_neto), comision: Number(a.comision) })) as AcreditacionReciente[];
  return <CuadreBancosBoard status="ready" fecha={fecha} cuentas={cuentas} historial={historial} general={(generalResult.data ?? []) as FilaCuadreGeneral[]} pendientes={pendientes} acreditaciones={acreditaciones} errorTarjetas={pendientesResult.error?.message ?? acreditacionesResult.error?.message ?? null} />;
}
