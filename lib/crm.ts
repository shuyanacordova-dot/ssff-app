import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import { getOperationalContext } from "@/lib/operational-context";

import type { CrmItem, CrmBranch, CrmData } from "@/lib/crm-labels";
export type { CrmMotivo, CrmItem, CrmBranch, CrmData } from "@/lib/crm-labels";
export { motivoLabels } from "@/lib/crm-labels";

const crmRoles = new Set(["superadmin", "admin_sucursal", "optometra", "vendedor"]);

export async function getCrmData(sucursalParam?: string): Promise<CrmData> {
  const empty = { branches: [], items: [] };
  if (!hasSupabaseConfiguration()) return { status: "needs_configuration", message: "Falta configurar la conexión segura.", ...empty };
  try {
    const context = await getOperationalContext();
    if (!context) return { status: "needs_login", message: "Inicia sesión para ver el CRM.", ...empty };
    if (!crmRoles.has(context.profile.rol)) return { status: "forbidden", message: "Tu perfil no tiene acceso al CRM.", ...empty };
    const empresaId = context.activeCompany.id;
    const branches = context.accessibleBranches.filter((b) => b.empresa_id === empresaId).map((b) => ({ id: b.id, nombre: b.nombre, empresa_id: b.empresa_id }));
    const sucursalId = sucursalParam === "todas" ? undefined : branches.some((b) => b.id === sucursalParam) ? sucursalParam : context.activeBranch.id;
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("crm_bandeja", { p_empresa: empresaId, p_sucursal: sucursalId ?? null });
    if (error) return { status: "error", message: error.message || "No se pudo cargar el CRM.", ...empty };
    return { status: "ready", empresaId, empresaNombre: context.activeCompany.nombre, sucursalId: sucursalId ?? "todas", branches, items: (data ?? []) as CrmItem[] };
  } catch {
    return { status: "error", message: "No se pudo cargar el CRM.", ...empty };
  }
}
