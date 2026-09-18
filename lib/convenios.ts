import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";

export type ConvenioEmpresa = { id: string; nombre: string; activo: boolean; acuerdos: number };
export type ConveniosData = { status: "ready" | "needs_configuration" | "needs_login" | "forbidden" | "error"; message?: string; empresas: ConvenioEmpresa[] };

type UserProfile = { activo: boolean; roles: { nombre: string } | { nombre: string }[] | null };
const convenioRoles = new Set(["superadmin", "admin_sucursal", "vendedor", "caja", "optometra"]);
const roleName = (profile: UserProfile | null) => Array.isArray(profile?.roles) ? profile.roles[0]?.nombre : profile?.roles?.nombre;

export async function getConveniosData(): Promise<ConveniosData> {
  const empty = { empresas: [] };
  if (!hasSupabaseConfiguration()) return { status: "needs_configuration", message: "Falta configurar la conexión segura de esta copia local.", ...empty };
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { status: "needs_login", message: "Inicia sesión para ver convenios.", ...empty };
    const { data: rawProfile, error: profileError } = await supabase.from("usuarios").select("activo,roles(nombre)").eq("auth_user_id", auth.user.id).maybeSingle();
    const profile = rawProfile as unknown as UserProfile | null;
    const role = roleName(profile);
    if (profileError || !profile?.activo || !role || !convenioRoles.has(role)) return { status: "forbidden", message: "Tu perfil no tiene permiso para ver convenios.", ...empty };

    const { data: empresas, error } = await supabase.from("empresas_convenio").select("id,nombre,activo").order("nombre");
    if (error) return { status: "error", message: "No se pudieron cargar los convenios.", ...empty };
    const ids = (empresas ?? []).map((e) => e.id);
    const { data: acuerdos } = ids.length ? await supabase.from("acuerdos_pago").select("id,empresa_convenio_id").in("empresa_convenio_id", ids) : { data: [] as { id: string; empresa_convenio_id: string }[] };
    const counts = new Map<string, number>();
    (acuerdos ?? []).forEach((a) => counts.set(a.empresa_convenio_id, (counts.get(a.empresa_convenio_id) ?? 0) + 1));

    return { status: "ready", empresas: (empresas ?? []).map((e) => ({ id: e.id, nombre: e.nombre, activo: e.activo, acuerdos: counts.get(e.id) ?? 0 })) };
  } catch {
    return { status: "error", message: "La conexión de convenios no está disponible.", ...empty };
  }
}
