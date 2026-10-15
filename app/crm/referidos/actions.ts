"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { periodoValido, type DetalleReferidor } from "@/lib/referidos-panel";

export async function obtenerDetalleReferidor(args: { empresaId: string; referidorId: string; desde: string; hasta: string; sucursalId: string | null }): Promise<DetalleReferidor> {
  const periodo = periodoValido(args.desde, args.hasta);
  if (!periodo) throw new Error("El período no es válido.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("panel_referidos_detalle", {
    p_empresa: args.empresaId, p_referidor: args.referidorId, p_desde: periodo.desde, p_hasta: periodo.hasta, p_sucursal: args.sucursalId,
  });
  if (error) throw new Error(error.message && !error.message.startsWith("permission denied") ? error.message : "No se pudo cargar el detalle.");
  return data as DetalleReferidor;
}
