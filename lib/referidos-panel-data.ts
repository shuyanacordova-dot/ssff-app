import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import { getOperationalContext } from "@/lib/operational-context";
import { periodoPorDefecto, periodoValido, type PanelReferidos, type Periodo } from "@/lib/referidos-panel";

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
    const sucursalPedida = params.sucursal && params.sucursal !== "todas" ? params.sucursal : null;
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("panel_referidos", { p_empresa: empresaId, p_desde: periodo.desde, p_hasta: periodo.hasta, p_sucursal: sucursalPedida });
    if (error) return { status: "error", message: error.message || "No se pudo cargar el panel de referidos." };
    const panel = data as PanelReferidos;
    return { status: "ready", empresaId, empresaNombre: context.activeCompany.nombre, periodo, sucursalId: panel.sucursal ?? "todas", panel };
  } catch {
    return { status: "error", message: "No se pudo cargar el panel de referidos." };
  }
}
