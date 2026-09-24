import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";

export type InformeSucursal = { sucursal_id: string; sucursal_nombre: string; empresa_id: string; empresa_nombre: string; ventas_total: number; ingresos_total: number; ventas_count: number; cobrado_total: number; meta: number };
export type InformeMensual = {
  mes: string;
  por_sucursal: InformeSucursal[];
  totales: { ventas_total: number; ingresos_total: number; ventas_count: number; cobrado_total: number; saldo_total: number; meta_total: number; gastos_total: number; cuentas_por_cobrar_total: number };
  gastos_por_clasificacion: { clasificacion: string; monto: number }[];
  cobros_por_metodo: { metodo: string; monto: number }[];
  cuadres: { correctos: number; total: number };
};

export type InformesCompany = { id: string; nombre: string };
export type InformesProfile = { id: string; empresa_id: string; rol: string };
export type InformesData = { status: "ready" | "needs_configuration" | "needs_login" | "forbidden" | "error"; message?: string; profile?: InformesProfile; companies: InformesCompany[] };

const informesRoles = new Set(["superadmin", "admin_sucursal"]);
const roleName = (roles: { nombre: string } | { nombre: string }[] | null) => Array.isArray(roles) ? roles[0]?.nombre : roles?.nombre;

export async function getInformesData(): Promise<InformesData> {
  if (!hasSupabaseConfiguration()) return { status: "needs_configuration", message: "Falta configurar la conexión segura de esta copia local.", companies: [] };
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { status: "needs_login", message: "Inicia sesión para ver informes.", companies: [] };
    const { data: rawProfile, error: profileError } = await supabase.from("usuarios").select("id,empresa_id,activo,roles(nombre)").eq("auth_user_id", auth.user.id).maybeSingle();
    const profile = rawProfile as unknown as { id: string; empresa_id: string; activo: boolean; roles: { nombre: string } | { nombre: string }[] | null } | null;
    const role = roleName(profile?.roles ?? null);
    if (profileError || !profile?.activo || !role || !informesRoles.has(role)) return { status: "forbidden", message: "Tu perfil no tiene permiso para ver informes.", companies: [] };

    const { data: companies, error: companiesError } = await supabase.from("empresas").select("id,nombre").eq("activo", true).order("nombre");
    if (companiesError) return { status: "error", message: "No se pudieron cargar las empresas.", companies: [] };

    return { status: "ready", profile: { id: profile.id, empresa_id: profile.empresa_id, rol: role }, companies: companies ?? [] };
  } catch {
    return { status: "error", message: "La conexión de informes no está disponible.", companies: [] };
  }
}
