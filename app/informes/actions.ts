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
