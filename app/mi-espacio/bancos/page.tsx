import { getOperationalContext } from "@/lib/operational-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import CuadreBancosBoard, { type CuadreGuardado, type CuentaCuadre } from "./cuadre-bancos-board";

export const dynamic = "force-dynamic";

export default async function CuadreBancosPage() {
  const context = await getOperationalContext();
  if (!context) return <CuadreBancosBoard status="needs_login" cuentas={[]} historial={[]} />;
  if (context.profile.rol !== "superadmin") return <CuadreBancosBoard status="forbidden" cuentas={[]} historial={[]} />;
  const supabase = await createSupabaseServerClient();
  const [cuentasResult, historialResult] = await Promise.all([
    supabase.from("cuentas_bancarias").select("id,empresa_id,banco,saldo_actual").eq("activo", true),
    supabase.from("cuadres_banco").select("id,cuenta_id,fecha,desde,saldo_anterior,transferencias,tarjetas,depositos_caja,otros_ingresos,egresos,comisiones,saldo_esperado,saldo_real,diferencia,notas").order("fecha", { ascending: false }).limit(60),
  ]);
  const empresa = new Map(context.companies.map((c) => [c.id, c.nombre]));
  const orden: Record<string, number> = { pichincha: 0, guayaquil: 1, internacional: 2 };
  const cuentas: CuentaCuadre[] = (cuentasResult.data ?? [])
    .map((c) => ({ id: c.id as string, empresa_id: c.empresa_id as string, empresa_nombre: empresa.get(c.empresa_id as string) ?? "Empresa", banco: c.banco as string, saldo_actual: Number(c.saldo_actual) }))
    .sort((a, b) => a.empresa_nombre.localeCompare(b.empresa_nombre) || (orden[a.banco] ?? 9) - (orden[b.banco] ?? 9));
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const historial: CuadreGuardado[] = (historialResult.data ?? []).map((h) => ({
    id: h.id, cuenta_id: h.cuenta_id, fecha: h.fecha, desde: h.desde, saldo_anterior: num(h.saldo_anterior), transferencias: Number(h.transferencias), tarjetas: Number(h.tarjetas),
    depositos_caja: Number(h.depositos_caja), otros_ingresos: Number(h.otros_ingresos), egresos: Number(h.egresos), comisiones: Number(h.comisiones),
    saldo_esperado: num(h.saldo_esperado), saldo_real: Number(h.saldo_real), diferencia: num(h.diferencia), notas: h.notas,
  }));
  return <CuadreBancosBoard status="ready" cuentas={cuentas} historial={historial} />;
}
