"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOperationalContext } from "@/lib/operational-context";
import { esUuid, periodoValido, type DetalleReferidor } from "@/lib/referidos-panel";

export type ResultadoDetalle = { ok: true; detalle: DetalleReferidor } | { ok: false; error: string };

export async function obtenerDetalleReferidor(args: { empresaId: string; referidorId: string; desde: string; hasta: string; sucursalId: string | null }): Promise<ResultadoDetalle> {
  try {
    const context = await getOperationalContext();
    if (!context) return { ok: false, error: "Inicia sesión para ver el detalle." };
    if (context.profile.rol !== "superadmin" && context.profile.rol !== "admin_sucursal") return { ok: false, error: "Tu perfil no tiene acceso al panel de referidos." };
    if (args.empresaId !== context.activeCompany.id) return { ok: false, error: "Esa óptica no es la que tienes activa." };
    if (!esUuid(args.referidorId) || (args.sucursalId !== null && !esUuid(args.sucursalId))) return { ok: false, error: "No se pudo identificar a la persona." };
    const periodo = periodoValido(args.desde, args.hasta);
    if (!periodo) return { ok: false, error: "El período no es válido." };
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("panel_referidos_detalle", {
      p_empresa: args.empresaId, p_referidor: args.referidorId, p_desde: periodo.desde, p_hasta: periodo.hasta, p_sucursal: args.sucursalId,
    });
    if (error) return { ok: false, error: error.message.includes("No autorizado") ? "Tu perfil no tiene acceso al panel de referidos." : "No se pudo cargar el detalle. Intenta de nuevo." };
    return { ok: true, detalle: data as DetalleReferidor };
  } catch {
    return { ok: false, error: "No se pudo cargar el detalle. Intenta de nuevo." };
  }
}
