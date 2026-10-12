"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

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
