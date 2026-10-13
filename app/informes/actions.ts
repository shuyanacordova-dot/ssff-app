"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/current-user";
import type { CuentaBancaria, Gasto } from "@/lib/caja";

import type { InformeMensual } from "@/lib/informes";
export type { InformeMensual, InformeSucursal } from "@/lib/informes";

export async function obtenerInformeMensual(empresaId: string | null, mes: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("obtener_informe_mensual", { p_empresa: empresaId, p_mes: mes });
  if (error) throw new Error(error.message || "No se pudo generar el informe.");
  return data as InformeMensual;
}

export async function establecerMetaVenta(empresaId: string, sucursalId: string, mes: string, monto: number) {
  const supabase = await createSupabaseServerClient();
  if (!empresaId || !sucursalId) throw new Error("Falta identificar la sucursal.");
  if (!Number.isFinite(monto) || monto < 0) throw new Error("Indica una meta válida.");
  const { error } = await supabase.rpc("establecer_meta_venta", { p_empresa: empresaId, p_sucursal: sucursalId, p_mes: mes, p_monto: monto });
  if (error) throw new Error(error.message || "No se pudo guardar la meta.");
}

export type TipoDesglose = "ventas" | "saldo" | "cxc" | "cobros" | "gastos" | "cuadres";
export type FilaDesglose = Record<string, string | number | boolean | null>;
export type DesgloseInforme = { tipo: TipoDesglose; filas: FilaDesglose[]; categorias: string[] };
export type EgresoParaEditar = { gasto: Gasto; cuentas: CuentaBancaria[]; cuadreGuardado: boolean };

export async function obtenerEgresoParaEditar(gastoId: string): Promise<EgresoParaEditar> {
  const supabase = await createSupabaseServerClient();
  const user = await getCurrentUser();
  if (!user) throw new Error("Inicia sesión para editar egresos.");
  const { data: profile, error: profileError } = await supabase.from("usuarios").select("activo,roles(nombre)").eq("auth_user_id", user.id).maybeSingle();
  const roles = profile?.roles as { nombre: string } | { nombre: string }[] | null | undefined;
  const rol = Array.isArray(roles) ? roles[0]?.nombre : roles?.nombre;
  if (profileError || !profile?.activo || rol !== "superadmin") throw new Error("Solo la Superadministradora puede editar egresos.");
  const { data: gasto, error: gastoError } = await supabase.from("gastos")
    .select("id,empresa_id,sucursal_id,fecha,clasificacion,concepto,monto,origen,cuenta_bancaria_id,observaciones,creado_en")
    .eq("id", gastoId).maybeSingle();
  if (gastoError || !gasto) throw new Error("No se encontró el egreso.");
  const [cuentasResult, cierresResult] = await Promise.all([
    supabase.from("cuentas_bancarias").select("id,empresa_id,sucursal_id,banco,saldo_actual").eq("empresa_id", gasto.empresa_id).eq("activo", true),
    gasto.sucursal_id ? supabase.from("cierres_caja").select("id").eq("sucursal_id", gasto.sucursal_id).eq("fecha", gasto.fecha).limit(1) : Promise.resolve({ data: [], error: null }),
  ]);
  if (cuentasResult.error || cierresResult.error) throw new Error("No se pudieron cargar los datos del egreso.");
  return {
    gasto: gasto as Gasto,
    cuentas: (cuentasResult.data ?? []).filter((cuenta) => cuenta.sucursal_id === gasto.sucursal_id || (!gasto.sucursal_id && cuenta.empresa_id === gasto.empresa_id)) as CuentaBancaria[],
    cuadreGuardado: (cierresResult.data ?? []).length > 0,
  };
}

export async function obtenerDesgloseInforme(empresaId: string | null, mes: string, tipo: TipoDesglose) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("obtener_desglose_informe", { p_empresa: empresaId, p_mes: mes, p_tipo: tipo });
  if (error) throw new Error(error.message || "No se pudo abrir el desglose.");
  return data as DesgloseInforme;
}

// Categoría de un egreso elegida por la superadministradora; porConcepto = se recuerda para todos los egresos con ese concepto.
export async function asignarCategoriaGasto(gastoId: string, categoria: string, porConcepto: boolean) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("asignar_categoria_gasto", { p_gasto: gastoId, p_categoria: categoria, p_por_concepto: porConcepto });
  if (error) throw new Error(error.message || "No se pudo guardar la categoría.");
}

export async function clasificarEgreso(gastoId: string, clasificacion: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("clasificar_egreso_informe", { p_gasto: gastoId, p_clasificacion: clasificacion });
  if (error) throw new Error(error.message || "No se pudo clasificar el egreso.");
}
