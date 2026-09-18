"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type InformeSucursal = { sucursal_id: string; sucursal_nombre: string; empresa_id: string; empresa_nombre: string; ventas_total: number; ventas_count: number; cobrado_total: number; meta: number };
export type InformeMensual = {
  mes: string;
  por_sucursal: InformeSucursal[];
  totales: { ventas_total: number; ventas_count: number; cobrado_total: number; saldo_total: number; meta_total: number; gastos_total: number; cuentas_por_cobrar_total: number };
  gastos_por_clasificacion: { clasificacion: string; monto: number }[];
  cobros_por_metodo: { metodo: string; monto: number }[];
  cuadres: { correctos: number; total: number };
};

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
