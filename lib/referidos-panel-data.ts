import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import { getOperationalContext } from "@/lib/operational-context";
import { esUuid, periodoPorDefecto, periodoValido, type PanelReferidos, type Periodo } from "@/lib/referidos-panel";

export type PanelData = {
  status: "ready" | "needs_login" | "forbidden" | "error"; message?: string;
  empresaId?: string; empresaNombre?: string; periodo?: Periodo; sucursalId?: string; panel?: PanelReferidos;
};

const rolesPanel = new Set(["superadmin", "admin_sucursal"]);

export async function getPanelReferidos(params: { desde?: string; hasta?: string; sucursal?: string }): Promise<PanelData> {
  if (!hasSupabaseConfiguration()) return { status: "error", message: "Falta configurar la conexión segura." };
  try {
    const context = await getOperationalContext();
    if (!context) return { status: "needs_login", message: "Inicia sesión para ver el panel de referidos." };
    if (!rolesPanel.has(context.profile.rol)) return { status: "forbidden", message: "Tu perfil no tiene acceso al panel de referidos." };
    const empresaId = context.activeCompany.id;
    const periodo = periodoValido(params.desde, params.hasta) ?? periodoPorDefecto();
    const sucursalPedida = esUuid(params.sucursal) ? params.sucursal : null;
    const supabase = await createSupabaseServerClient();
    const consultar = (sucursal: string | null) => supabase.rpc("panel_referidos", { p_empresa: empresaId, p_desde: periodo.desde, p_hasta: periodo.hasta, p_sucursal: sucursal });
    let { data, error } = await consultar(sucursalPedida);
    // Un enlace viejo con una sucursal de otra óptica no debe romper la pantalla: se muestra "Todas".
    if (error && sucursalPedida && error.message.includes("no pertenece")) ({ data, error } = await consultar(null));
    if (error) return { status: "error", message: error.message.includes("No autorizado") ? "Tu perfil no tiene acceso al panel de referidos." : "No se pudo cargar el panel de referidos. Intenta de nuevo." };
    const panel = data as PanelReferidos;
    return { status: "ready", empresaId, empresaNombre: context.activeCompany.nombre, periodo, sucursalId: panel.sucursal ?? "todas", panel };
  } catch {
    return { status: "error", message: "No se pudo cargar el panel de referidos." };
  }
}
