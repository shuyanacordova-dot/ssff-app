import { getCurrentUser } from "@/lib/supabase/current-user";
import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import { getOperationalContext } from "@/lib/operational-context";
import type { BranchIdentity, CompanyIdentity } from "@/lib/sucursales";

export type SucursalesConfigData = {
  status: "ready" | "needs_configuration" | "needs_login" | "forbidden" | "error";
  message?: string;
  schemaReady: boolean;
  companies: CompanyIdentity[];
  branches: BranchIdentity[];
};

const empty = (status: SucursalesConfigData["status"], message: string): SucursalesConfigData => ({ status, message, schemaReady: false, companies: [], branches: [] });

export async function getSucursalesConfigData(): Promise<SucursalesConfigData> {
  if (!hasSupabaseConfiguration()) return empty("needs_configuration", "Falta configurar la conexión de esta copia local.");
  try {
    const context = await getOperationalContext();
    if (!context) {
      const supabase = await createSupabaseServerClient();
      const data = { user: await getCurrentUser() };
      return empty(data.user ? "forbidden" : "needs_login", data.user ? "No tienes permiso para configurar sucursales." : "Inicia sesión para continuar.");
    }
    if (context.profile.rol !== "superadmin") return empty("forbidden", "Solo la administración general puede configurar la identidad de las sucursales.");
    return { status: "ready", schemaReady: context.brandingSchemaReady, companies: context.companies, branches: context.branches };
  } catch {
    return empty("error", "No se pudo cargar la configuración de sucursales.");
  }
}
