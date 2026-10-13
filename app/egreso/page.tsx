import Link from "next/link";
import { getOperationalContext } from "@/lib/operational-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import EgresoRapido from "./egreso-rapido";

export const dynamic = "force-dynamic";

// Registrar egreso rápido desde el iPhone: se guarda como ícono en la pantalla de inicio o lo abre un atajo con
// ?monto=…&concepto=…&observaciones=…&metodo=efectivo|pichincha|guayaquil|internacional&sucursal=shuvision|sacha|focus
export default async function EgresoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const context = await getOperationalContext();
  if (!context) return <main className="page agenda-page"><div className="container agenda-shell"><h1>Registrar egreso</h1><Link className="primary-link" href="/login?next=/egreso">Iniciar sesión</Link></div></main>;
  const supabase = await createSupabaseServerClient();
  const sucursales = context.accessibleBranches.map((b) => ({ id: b.id, nombre: b.nombre, empresa_id: b.empresa_id }));
  const [cuentasResult, ahorroResult] = await Promise.all([
    supabase.from("cuentas_bancarias").select("id,banco,sucursal_id").in("sucursal_id", sucursales.map((s) => s.id)),
    supabase.from("cuentas_ahorro").select("empresa_id").eq("banco", "diners").maybeSingle(),
  ]);
  const pedida = (query.sucursal ?? "").toLowerCase();
  const inicial = sucursales.find((s) => pedida && (pedida === "sacha" ? /sacha/i.test(s.nombre) : pedida === "focus" ? /focus/i.test(s.nombre) : /^shuvision$/i.test(s.nombre.trim())))?.id ?? context.activeBranch.id;
  return <EgresoRapido sucursales={sucursales} cuentas={(cuentasResult.data ?? []) as { id: string; banco: string; sucursal_id: string }[]} cuentaAhorrosEmpresaId={ahorroResult.data?.empresa_id} sucursalInicial={inicial}
    montoInicial={(query.monto ?? "").replace(/[^0-9.,]/g, "")} conceptoInicial={query.concepto ?? ""} observacionesInicial={query.observaciones ?? ""} metodoInicial={(query.metodo ?? "efectivo").toLowerCase()} />;
}
